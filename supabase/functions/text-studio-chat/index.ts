// AI Text Studio - Streaming chat edge function
// Routes to Lovable AI Gateway (OpenAI/Gemini) or Anthropic API.
// Streams OpenAI-compatible SSE deltas to the client (uniform parser on frontend).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-Conversation-Id",
};

// --- Pricing (EUR per 1k tokens, end-user prices with margin) ---
const PRICING: Record<string, { input: number; output: number }> = {
  "openai-gpt-5-6-luna": { input: 0.0004, output: 0.0026 },
  "openai-gpt-5-6-terra": { input: 0.0021, output: 0.0169 },
  "openai-gpt-5-6-sol": { input: 0.0195, output: 0.0975 },
  "google-gemini-3-1-flash-lite": { input: 0.00013, output: 0.0005 },
  "google-gemini-3-6-flash": { input: 0.0005, output: 0.0033 },
  "google-gemini-3-1-pro": { input: 0.0016, output: 0.013 },
  "anthropic-claude-4-1-opus": { input: 0.0195, output: 0.0975 },
};

const PROVIDER_MAP: Record<string, { provider: "gateway" | "anthropic"; apiModel: string }> = {
  "openai-gpt-5-6-luna": { provider: "gateway", apiModel: "openai/gpt-5.6-luna" },
  "openai-gpt-5-6-terra": { provider: "gateway", apiModel: "openai/gpt-5.6-terra" },
  "openai-gpt-5-6-sol": { provider: "gateway", apiModel: "openai/gpt-5.6-sol" },
  "google-gemini-3-1-flash-lite": { provider: "gateway", apiModel: "google/gemini-3.1-flash-lite" },
  "google-gemini-3-6-flash": { provider: "gateway", apiModel: "google/gemini-3.6-flash" },
  "google-gemini-3-1-pro": { provider: "gateway", apiModel: "google/gemini-3.1-pro-preview" },
  "anthropic-claude-4-1-opus": { provider: "anthropic", apiModel: "claude-opus-4-1" },
};

// Legacy IDs from the previous registry
const LEGACY_ALIASES: Record<string, string> = {
  "openai-gpt-5-5-pro": "openai-gpt-5-6-sol",
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

  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "text-studio-chat" });


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
      model: modelIdRaw,
      reasoningEffort,
      maxOutputTokens,
      temperature,
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
      maxOutputTokens?: number;
      temperature?: number;
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
    const modelId = LEGACY_ALIASES[modelIdRaw] ?? modelIdRaw;
    const route = PROVIDER_MAP[modelId];
    const pricing = PRICING[modelId];
    if (!route || !pricing) return jsonResponse({ error: "Unknown model" }, 400);

    const outputTokenCap = Math.min(Math.max(Number(maxOutputTokens) || 1800, 256), 8192);
    const temp =
      typeof temperature === "number" && temperature >= 0 && temperature <= 2
        ? temperature
        : undefined;


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

    // v428: Text Studio is free — no wallet check, cost is telemetry only.


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
    // Reply language is dictated by the caller's UI language (default English),
    // so the assistant never opens the conversation in a random language.
    const LANG_NAMES: Record<string, string> = {
      en: "English",
      de: "German (Deutsch)",
      es: "Spanish (Español)",
    };
    const replyLang = LANG_NAMES[String((body as { language?: string }).language ?? "en")] ?? "English";
    const langDirective = `OUTPUT LANGUAGE (ABSOLUTE, HIGHEST PRIORITY): Write every reply in ${replyLang}. Never switch languages or mirror the language of these instructions, unless the user explicitly asks for another language.`;
    const effectiveSystemPrompt = systemPrompt ? `${langDirective}\n\n${systemPrompt}` : langDirective;
    const sysMsg = [{ role: "system" as const, content: effectiveSystemPrompt }];


    let upstream: Response;
    if (route.provider === "gateway") {
      const isOpenAI = route.apiModel.startsWith("openai/");
      const reqBody: Record<string, unknown> = {
        model: route.apiModel,
        messages: [...sysMsg, ...cleanMessages],
        stream: true,
      };
      if (isOpenAI) {
        // GPT-5.6 models require an explicit reasoning_effort; "none" disables thinking.
        reqBody.reasoning_effort = reasoningEffort && reasoningEffort !== "none" ? reasoningEffort : "none";
        reqBody.max_completion_tokens = outputTokenCap;
      } else {
        reqBody.max_tokens = outputTokenCap;
        if (temp !== undefined) reqBody.temperature = temp;
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
          max_tokens: outputTokenCap,
          ...(temp !== undefined ? { temperature: Math.min(temp, 1) } : {}),
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

          // Background: persist messages (v428: Text Studio is free — no wallet deduction)
          // @ts-ignore
          EdgeRuntime.waitUntil(
            (async () => {
              try {
                if (!outputTokens) outputTokens = estimateTokens(fullAssistant);
                const realCost = Number(
                  ((inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output).toFixed(4),
                );


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
