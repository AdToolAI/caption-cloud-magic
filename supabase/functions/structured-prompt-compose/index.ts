// Block K-2 — Structured Prompt Composer (Edge Function)
//
// Three modes (driven by `mode` field of the request body):
//
//  • 'compose'  → take filled slots, translate to English, and assemble a
//                 model-specific final prompt. Returns { prompt, warnings }.
//  • 'suggest'  → write ONE single slot suggestion based on the other slots
//                 + a free-text contextHint. Returns { suggestion }.
//  • 'condense' → shorten an over-long prompt to ≤ targetLimit while keeping
//                 visual fidelity. Returns { prompt }.
//
// Auth: this function deploys with `verify_jwt = false` (default for
// Lovable-managed functions). It uses no per-user data — only forwards
// to Lovable AI Gateway.
//
// CORS: open (called from browser).

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

type SlotKey = "subject" | "action" | "setting" | "timeWeather" | "style" | "negative";

interface ComposeBody {
  mode: "compose" | "suggest" | "condense" | "inspire";
  slots?: Partial<Record<SlotKey, string>>;
  /** Block K-P2 — user-defined slot order (Negative always at end). */
  slotOrder?: SlotKey[];
  slot?: SlotKey;
  contextHint?: string;
  language?: string;
  targetModel?:
    | "ai-sora"
    | "ai-kling"
    | "ai-hailuo"
    | "ai-wan"
    | "ai-seedance"
    | "ai-luma";
  /** condense mode: max words/chars allowed in output. */
  targetLimit?: number;
  promptText?: string;
  /** inspire mode: optional seed style to riff on (e.g. "cinematic drama"). */
  seedStyle?: string;
}

const MODEL_STYLE_HINT: Record<string, string> = {
  "ai-sora":
    "Sora 2 — write a single flowing sentence, comma-separated descriptive clauses, present tense, ~40-80 words.",
  "ai-kling":
    "Kling 3.0 — 2-3 short cinematic sentences, present tense, mention camera move explicitly, ~80-150 words.",
  "ai-hailuo":
    "Hailuo 2.3 — natural narrative sentences, focus on subject motion and emotion, ~100-180 words.",
  "ai-wan":
    "Wan 2.5 — keyword-style: comma-separated tags (subject, action, setting, lighting, style, lens), ~40-90 words.",
  "ai-seedance":
    "Seedance 1 — short cinematic sentence + style tags, ~60-120 words.",
  "ai-luma":
    "Luma Ray 2 — descriptive paragraph with strong motion verbs, ~80-150 words.",
};

function buildSystemPrompt(mode: string, targetModel: string): string {
  const styleHint = MODEL_STYLE_HINT[targetModel] ?? MODEL_STYLE_HINT["ai-sora"];

  if (mode === "compose") {
    return `You are an expert AI video prompt engineer specialised in writing prompts for Sora 2, Kling 3, Hailuo 2.3, Wan 2.5, Seedance and Luma Ray.

The user provides 6 structured slots. Your job:
1. Translate every slot to natural ENGLISH if it isn't already.
2. Compose ONE final visual prompt following this style guide:
   ${styleHint}
3. Naturally weave Subject → Action → Setting → Time/Weather → Style.
4. If a Negative slot is provided, append a separate line: "Negative: ..."
5. Never invent unrelated content. Never add subtitles, captions, on-screen text, watermarks, or logos.
6. Output ONLY the final prompt as plain text — NO preamble, NO markdown, NO explanations.`;
  }

  if (mode === "suggest") {
    return `You are an expert AI video prompt engineer.

Given the user's other slot values and a free-text context hint, write ONE concise suggestion (in ENGLISH, ≤ 25 words) for the requested slot only.
Do not duplicate content already in other slots. Do not add quotes or labels.
Output ONLY the suggestion, plain text, single line.`;
  }

  if (mode === "inspire") {
    return `You are an expert AI cinematographer pitching a fresh, vivid one-shot scene idea.

Invent ONE original cinematic moment (NOT generic, NOT a cliché). Mix uncommon subject matter with strong visual style.
Return STRICT JSON only — no markdown fences, no commentary — matching this shape:
{
  "subject":     "...",
  "action":      "...",
  "setting":     "...",
  "timeWeather": "...",
  "style":       "...",
  "negative":    "no text, no logos, no subtitles"
}
All values in ENGLISH. Each field ≤ 18 words. The 6 fields together should describe ONE coherent shot a director could film.`;
  }

  // condense
  return `You are an expert AI video prompt engineer.

Shorten the given prompt to fit the target limit while preserving every visual detail (subject, action, lighting, style). Drop redundant adjectives first.
Style guide: ${styleHint}
Output ONLY the shortened prompt as plain text.`;
}

function buildUserPrompt(body: ComposeBody): string {
  if (body.mode === "compose") {
    const s = body.slots ?? {};
    const reorderable: SlotKey[] = ["subject", "action", "setting", "timeWeather", "style"];
    const customOrder = (body.slotOrder ?? []).filter(
      (k): k is SlotKey => reorderable.includes(k)
    );
    const ordered: SlotKey[] = [];
    for (const k of customOrder) if (!ordered.includes(k)) ordered.push(k);
    for (const k of reorderable) if (!ordered.includes(k)) ordered.push(k);
    ordered.push("negative");

    const labels: Record<SlotKey, string> = {
      subject: "Subject",
      action: "Action",
      setting: "Setting",
      timeWeather: "Time/Weather",
      style: "Style",
      negative: "Negative",
    };
    const lines: string[] = [
      `Source language: ${body.language ?? "en"}`,
      `Target model: ${body.targetModel ?? "ai-sora"}`,
      "",
      "Slots (compose in this exact order, Negative always last):",
      ...ordered.map((k) => `- ${labels[k]}: ${s[k] ?? "(empty)"}`),
    ];
    return lines.join("\n");
  }

  if (body.mode === "suggest") {
    const s = body.slots ?? {};
    const others = (Object.keys(s) as SlotKey[])
      .filter((k) => k !== body.slot && (s[k] ?? "").trim().length > 0)
      .map((k) => `- ${k}: ${s[k]}`)
      .join("\n");
    return [
      `Slot to fill: ${body.slot}`,
      `Source language: ${body.language ?? "en"}`,
      `Other slots:\n${others || "(none)"}`,
      `Context hint: ${body.contextHint ?? "(none)"}`,
    ].join("\n");
  }

  if (body.mode === "inspire") {
    const seed = body.seedStyle?.trim();
    return [
      `Source language: ${body.language ?? "en"}`,
      `Target model: ${body.targetModel ?? "ai-sora"}`,
      seed ? `Seed style to riff on: ${seed}` : `No seed — invent freely.`,
      `Context hint (avoid duplicating): ${body.contextHint ?? "(none)"}`,
      "",
      "Return strict JSON with the 6 slot fields described in the system prompt.",
    ].join("\n");
  }

  // condense
  return [
    `Target limit: ${body.targetLimit ?? 400} units`,
    `Target model: ${body.targetModel ?? "ai-sora"}`,
    "",
    "Prompt to shorten:",
    body.promptText ?? "",
  ].join("\n");
}

function countTokens(text: string, model: string): { count: number; unit: "words" | "chars" } {
  const wordModels = new Set(["ai-sora", "ai-wan", "ai-seedance"]);
  if (wordModels.has(model)) {
    return { count: text.match(/\S+/g)?.length ?? 0, unit: "words" };
  }
  return { count: text.length, unit: "chars" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ComposeBody;

    if (!body.mode || !["compose", "suggest", "condense", "inspire"].includes(body.mode)) {
      return new Response(
        JSON.stringify({ error: "mode must be 'compose' | 'suggest' | 'condense' | 'inspire'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetModel = body.targetModel ?? "ai-sora";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = buildSystemPrompt(body.mode, targetModel);
    const userPrompt = buildUserPrompt(body);

    console.log(`[structured-prompt-compose] mode=${body.mode} model=${targetModel}`);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Fast & cheap for this transformation task; switch to flash if quality drops.
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: body.mode === "suggest" ? 0.85 : body.mode === "inspire" ? 1.05 : 0.4,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[structured-prompt-compose] AI error", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please retry shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI workspace credits exhausted. Top up to keep using AI prompts.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `AI gateway error: ${aiResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const raw = (aiData.choices?.[0]?.message?.content ?? "").trim();

    if (!raw) {
      return new Response(
        JSON.stringify({ error: "Empty AI response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.mode === "suggest") {
      // Strip surrounding quotes if the model added them.
      const suggestion = raw.replace(/^["'`]+|["'`]+$/g, "").trim();
      return new Response(
        JSON.stringify({ suggestion }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.mode === "inspire") {
      // Robust JSON extraction: model may wrap with ```json fences.
      let jsonText = raw;
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenceMatch) jsonText = fenceMatch[1].trim();
      const firstBrace = jsonText.indexOf("{");
      const lastBrace = jsonText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonText = jsonText.slice(firstBrace, lastBrace + 1);
      }
      let slots: Record<string, string> = {};
      try {
        const parsed = JSON.parse(jsonText);
        for (const k of ["subject", "action", "setting", "timeWeather", "style", "negative"]) {
          if (typeof parsed[k] === "string") slots[k] = parsed[k].trim();
        }
      } catch (e) {
        console.error("[structured-prompt-compose] inspire JSON parse failed", e, raw);
        return new Response(
          JSON.stringify({ error: "Failed to parse inspire JSON", raw }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ slots }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // compose / condense → return as `prompt`
    const { count, unit } = countTokens(raw, targetModel);
    const warnings: string[] = [];
    if (body.mode === "compose" && count === 0) {
      warnings.push("Model returned an empty prompt.");
    }

    return new Response(
      JSON.stringify({ prompt: raw, tokenCount: count, tokenUnit: unit, warnings }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[structured-prompt-compose] fatal", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
