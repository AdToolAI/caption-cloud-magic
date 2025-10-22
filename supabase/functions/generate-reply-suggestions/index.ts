import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { commentId, commentText, platform, language } = await req.json();

    if (!commentId || !commentText) {
      return new Response(
        JSON.stringify({ error: "commentId and commentText are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating reply suggestions for comment: ${commentId}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Du bist ein Social-Media-Experte, der professionelle Antworten auf Kommentare erstellt.

Analysiere den folgenden Kommentar und erstelle 3 unterschiedliche Antwortvorschläge:

1. **Freundlich & hilfsbereit**: Warmherzig, persönlich, unterstützend
2. **Werblich & Conversion-orientiert**: Professionell, mit CTA, verkaufsorientiert
3. **Locker & persönlich**: Entspannt, mit Emojis, authentisch

Halte die Antworten kurz (max. 2-3 Sätze) und natürlich.
Wenn eine Kaufabsicht erkennbar ist, füge einen passenden Hinweis hinzu.
Sprache: ${language || "Deutsch"}

Antworte im folgenden JSON-Format:
{
  "replies": [
    {"type": "freundlich", "text": "..."},
    {"type": "werblich", "text": "..."},
    {"type": "locker", "text": "..."}
  ]
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Plattform: ${platform || "unbekannt"}\n\nKommentar: "${commentText}"` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_reply_suggestions",
              description: "Generiere 3 Antwortvorschläge für einen Kommentar",
              parameters: {
                type: "object",
                properties: {
                  replies: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: {
                          type: "string",
                          enum: ["freundlich", "werblich", "locker"],
                        },
                        text: {
                          type: "string",
                        },
                      },
                      required: ["type", "text"],
                    },
                  },
                },
                required: ["replies"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_reply_suggestions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit erreicht. Bitte versuche es später erneut." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Guthaben aufgebraucht. Bitte lade dein Lovable AI Guthaben auf." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error("AI Gateway error");
    }

    const aiResponse = await response.json();
    console.log("AI Response:", JSON.stringify(aiResponse, null, 2));

    // Extract tool call result
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in AI response");
    }

    const suggestions = JSON.parse(toolCall.function.arguments);

    // Store suggestions in comment_analysis
    const { error: updateError } = await supabaseClient
      .from("comment_analysis")
      .update({
        reply_suggestions: suggestions.replies,
        updated_at: new Date().toISOString(),
      })
      .eq("comment_id", commentId);

    if (updateError) {
      console.error("Error storing suggestions:", updateError);
      // Don't fail the request, just log the error
    }

    return new Response(
      JSON.stringify({
        commentId,
        suggestions: suggestions.replies,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error generating reply suggestions:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
