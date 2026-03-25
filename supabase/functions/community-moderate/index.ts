import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message_id, content, channel_id, moderation_rules } = await req.json();

    const rules = moderation_rules || {};
    const issues: string[] = [];

    // Check max length
    if (rules.max_length && content.length > rules.max_length) {
      issues.push(`Nachricht überschreitet ${rules.max_length} Zeichen.`);
    }

    // Check blocked words
    if (rules.blocked_words?.length > 0) {
      const lower = content.toLowerCase();
      for (const word of rules.blocked_words) {
        if (lower.includes(word.toLowerCase())) {
          issues.push(`Blockiertes Wort: "${word}"`);
        }
      }
    }

    // AI toxicity check
    if (rules.ai_check) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              {
                role: "system",
                content: "You are a content moderator. Analyze if the following message is toxic, spam, or inappropriate. Reply with JSON: {\"safe\": true/false, \"reason\": \"...\"}",
              },
              { role: "user", content },
            ],
            tools: [{
              type: "function",
              function: {
                name: "moderate_content",
                description: "Return moderation result",
                parameters: {
                  type: "object",
                  properties: {
                    safe: { type: "boolean" },
                    reason: { type: "string" },
                  },
                  required: ["safe", "reason"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "moderate_content" } },
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall) {
            const result = JSON.parse(toolCall.function.arguments);
            if (!result.safe) {
              issues.push(`AI-Moderation: ${result.reason}`);
            }
          }
        }
      }
    }

    const status = issues.length > 0 ? "flagged" : (rules.auto_approve ? "approved" : "pending");

    // Update message moderation status via service role
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    await fetch(`${SUPABASE_URL}/rest/v1/community_messages?id=eq.${message_id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        moderation_status: status,
        moderated_at: new Date().toISOString(),
      }),
    });

    return new Response(JSON.stringify({ status, issues }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Moderation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
