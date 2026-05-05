// AI Text Studio - Streaming chat edge function
// Routes to Lovable AI Gateway (OpenAI/Gemini) or Anthropic API.
// Streams OpenAI-compatible SSE deltas to the client (uniform parser on frontend).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// --- Pricing (EUR per 1k tokens, end-user prices with margin) ---
const PRICING: Record<string, { input: number; output: number }> = {
  "google-gemini-3-1-pro": { input: 0.0016, output: 0.013 },
  "openai-gpt-5-5-pro": { input: 0.0195, output: 0.0975 },
  "anthropic-claude-4-1-opus": { input: 0.0195, output: 0.0975 },
};

const PROVIDER_MAP: Record<string, { provider: "gateway" | "anthropic"; apiModel: string }> = {
  "google-gemini-3-1-pro": { provider: "gateway", apiModel: "google/gemini-3.1-pro-preview" },
  "openai-gpt-5-5-pro": { provider: "gateway", apiModel: "openai/gpt-5.5-pro" },
  "anthropic-claude-4-1-opus": { provider: "anthropic", apiModel: "claude-opus-4-1" },
};

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || "").length / 4));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse({ error: "Invalid body" }, 400);

    const {
      conversationId: convIdInput,
      messages,
      model: modelId,
      reasoningEffort,
      systemPrompt,
      personaId,
      isPrivate,
      parentConversationId,
      branchedFromMessageId,
      branchLabel,
    } = body as {
      conversationId?: string;
      messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
      model: string;
      reasoningEffort?: string;
      systemPrompt?: string;
      personaId?: string;
      isPrivate?: boolean;
      parentConversationId?: string;
      branchedFromMessageId?: string;
      branchLabel?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: "messages required" }, 400);
    }
    const route = PROVIDER_MAP[modelId];
    const pricing = PRICING[modelId];
    if (!route || !pricing) return jsonResponse({ error: "Unknown model" }, 400);

    // Anthropic key check
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (route.provider === "anthropic" && !ANTHROPIC_API_KEY) {
      return jsonResponse(
        { error: "Claude is not configured. Add ANTHROPIC_API_KEY in settings.", code: "MISSING_KEY" },
        400,
      );
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (route.provider === "gateway" && !LOVABLE_API_KEY) {
      return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);
    }

    // --- Wallet check (estimated cost) ---
    const inputText = messages.map((m) => m.content).join("\n") + (systemPrompt || "");
    const estInputTokens = estimateTokens(inputText);
    const estOutputTokens = 800;
    const estCost = Number(
      ((estInputTokens / 1000) * pricing.input + (estOutputTokens / 1000) * pricing.output).toFixed(4),
    );

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("ai_video_wallets")
      .select("balance_euros, currency")
      .eq("user_id", userId)
      .maybeSingle();

    if (walletError || !wallet) {
      return jsonResponse(
        { error: "No wallet found. Please purchase credits first.", code: "NO_WALLET" },
        402,
      );
    }
    if (Number(wallet.balance_euros) < estCost) {
      return jsonResponse(
        {
          error: `Insufficient credits. Estimated €${estCost.toFixed(2)}, have €${Number(wallet.balance_euros).toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS",
          required: estCost,
          available: Number(wallet.balance_euros),
        },
        402,
      );
    }

    // --- Ensure conversation exists ---
    let conversationId = convIdInput;
    if (!conversationId) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const title = (lastUser?.content || "Neue Konversation").slice(0, 80);
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("text_studio_conversations")
        .insert({
          user_id: userId,
          title,
          model: modelId,
          persona_id: personaId || null,
          is_private: !!isPrivate,
          parent_conversation_id: parentConversationId || null,
          branched_from_message_id: branchedFromMessageId || null,
          branch_label: branchLabel || null,
        })
        .select("id")
        .single();
      if (convErr) return jsonResponse({ error: convErr.message }, 500);
      conversationId = conv.id;
    }

    // --- Sanitize history (strip non-text, drop empties, normalize roles) ---
    // Different providers (OpenAI reasoning, Anthropic, Gemini) reject foreign payload shapes.
    // We force a strict {role, content:string} shape and drop assistant-empty placeholders.
    const cleanMessages = (messages || [])
      .map((m) => ({
        role: (m.role === "system" || m.role === "user" || m.role === "assistant") ? m.role : "user",
        content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
      }))
      .filter((m) => m.content.trim().length > 0);

    if (cleanMessages.length === 0) {
      return jsonResponse({ error: "No non-empty messages to send" }, 400);
    }

    // --- Build upstream request ---
    const sysMsg = systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : [];

    let upstream: Response;
    if (route.provider === "gateway") {
      const reqBody: Record<string, unknown> = {
        model: route.apiModel,
        messages: [...sysMsg, ...cleanMessages],
        stream: true,
      };
      if (reasoningEffort && PRICING[modelId] && modelId === "openai-gpt-5-5-pro") {
        reqBody.reasoning = { effort: reasoningEffort };
      }
      upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reqBody),
      });
    } else {
      // Anthropic streaming — Claude requires alternating user/assistant and starts with user
      const anthroMsgs = cleanMessages
        .map((m) => ({ role: m.role === "system" ? "user" : m.role, content: m.content }))
        .filter((m, i, arr) => i === 0 ? m.role === "user" : true); // drop leading assistant
      upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: route.apiModel,
          max_tokens: 4096,
          system: systemPrompt || undefined,
          messages: anthroMsgs,
          stream: true,
        }),
      });
    }

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text();
      console.error("[text-studio-chat] upstream error", upstream.status, errText);
      if (upstream.status === 429) return jsonResponse({ error: "Rate limited, try again." }, 429);
      if (upstream.status === 402) return jsonResponse({ error: "AI credits exhausted." }, 402);
      // Surface a useful snippet so the user sees the real reason in the toast
      const snippet = errText.replace(/\s+/g, " ").slice(0, 200);
      return jsonResponse(
        { error: `Provider error (${upstream.status}): ${snippet || "unknown"}`, details: errText.slice(0, 500) },
        502,
      );
    }

    // --- Stream + capture full assistant text for DB write after end ---
    let fullAssistant = "";
    let outputTokens = 0;
    let inputTokens = estInputTokens;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        let buffer = "";

        const sendDelta = (text: string) => {
          if (!text) return;
          fullAssistant += text;
          const payload = {
            choices: [{ delta: { content: text } }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let idx: number;
            while ((idx = buffer.indexOf("\n")) !== -1) {
              const rawLine = buffer.slice(0, idx).replace(/\r$/, "");
              buffer = buffer.slice(idx + 1);
              if (!rawLine || rawLine.startsWith(":")) continue;

              if (route.provider === "gateway") {
                if (!rawLine.startsWith("data: ")) continue;
                const payload = rawLine.slice(6).trim();
                if (payload === "[DONE]") continue;
                try {
                  const json = JSON.parse(payload);
                  const delta = json.choices?.[0]?.delta?.content;
                  if (delta) sendDelta(delta);
                  if (json.usage) {
                    inputTokens = json.usage.prompt_tokens ?? inputTokens;
                    outputTokens = json.usage.completion_tokens ?? outputTokens;
                  }
                } catch {
                  buffer = rawLine + "\n" + buffer;
                  break;
                }
              } else {
                // Anthropic SSE: lines like "event: ...", "data: {...}"
                if (!rawLine.startsWith("data: ")) continue;
                const payload = rawLine.slice(6).trim();
                try {
                  const json = JSON.parse(payload);
                  if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
                    sendDelta(json.delta.text || "");
                  } else if (json.type === "message_delta" && json.usage) {
                    outputTokens = json.usage.output_tokens ?? outputTokens;
                  } else if (json.type === "message_start" && json.message?.usage) {
                    inputTokens = json.message.usage.input_tokens ?? inputTokens;
                  }
                } catch {
                  buffer = rawLine + "\n" + buffer;
                  break;
                }
              }
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("[text-studio-chat] stream error", err);
        } finally {
          controller.close();

          // Background: persist messages + deduct wallet
          // @ts-ignore
          EdgeRuntime.waitUntil(
            (async () => {
              try {
                if (!outputTokens) outputTokens = estimateTokens(fullAssistant);
                const realCost = Number(
                  ((inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output).toFixed(4),
                );

                // Deduct from wallet
                try {
                  await supabaseAdmin.rpc("deduct_text_studio_credits", {
                    p_user_id: userId,
                    p_amount: realCost,
                    p_conversation_id: conversationId,
                  });
                } catch (e) {
                  console.error("[text-studio-chat] deduct failed", e);
                }

                if (!isPrivate) {
                  // Persist last user message + assistant message
                  const lastUser = [...messages].reverse().find((m) => m.role === "user");
                  const inserts = [];
                  if (lastUser) {
                    inserts.push({
                      conversation_id: conversationId,
                      user_id: userId,
                      role: "user",
                      content: lastUser.content,
                      model: modelId,
                    });
                  }
                  inserts.push({
                    conversation_id: conversationId,
                    user_id: userId,
                    role: "assistant",
                    content: fullAssistant,
                    model: modelId,
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    cost_eur: realCost,
                    reasoning_effort: reasoningEffort || null,
                  });
                  await supabaseAdmin.from("text_studio_messages").insert(inserts);
                }

                // Update conversation totals
                await supabaseAdmin
                  .from("text_studio_conversations")
                  .update({
                    total_input_tokens: inputTokens,
                    total_output_tokens: outputTokens,
                    total_cost_eur: realCost,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", conversationId);
              } catch (e) {
                console.error("[text-studio-chat] persist failed", e);
              }
            })(),
          );
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Conversation-Id": conversationId!,
      },
    });
  } catch (e) {
    console.error("[text-studio-chat]", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
