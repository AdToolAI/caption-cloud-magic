// AI Text Studio - Compare endpoint
// Calls all 3 models in parallel (non-streaming) and returns aggregated results.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function callModel(
  modelId: string,
  prompt: string,
  systemPrompt: string | undefined,
  keys: { lovable?: string; anthropic?: string },
) {
  const route = PROVIDER_MAP[modelId];
  const pricing = PRICING[modelId];
  const start = Date.now();

  try {
    if (route.provider === "anthropic") {
      if (!keys.anthropic) {
        return { ok: false, error: "ANTHROPIC_API_KEY not configured", model: modelId };
      }
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": keys.anthropic,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: route.apiModel,
          max_tokens: 2048,
          system: systemPrompt || undefined,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!r.ok) return { ok: false, error: await r.text(), model: modelId };
      const j = await r.json();
      const text = j.content?.map((c: any) => c.text).join("") ?? "";
      const inputTokens = j.usage?.input_tokens ?? estimateTokens(prompt + (systemPrompt || ""));
      const outputTokens = j.usage?.output_tokens ?? estimateTokens(text);
      const cost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
      return {
        ok: true,
        model: modelId,
        content: text,
        inputTokens,
        outputTokens,
        cost: Number(cost.toFixed(4)),
        latencyMs: Date.now() - start,
      };
    } else {
      if (!keys.lovable) return { ok: false, error: "LOVABLE_API_KEY not configured", model: modelId };
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keys.lovable}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: route.apiModel,
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!r.ok) return { ok: false, error: await r.text(), model: modelId };
      const j = await r.json();
      const text = j.choices?.[0]?.message?.content ?? "";
      const inputTokens = j.usage?.prompt_tokens ?? estimateTokens(prompt + (systemPrompt || ""));
      const outputTokens = j.usage?.completion_tokens ?? estimateTokens(text);
      const cost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
      return {
        ok: true,
        model: modelId,
        content: text,
        inputTokens,
        outputTokens,
        cost: Number(cost.toFixed(4)),
        latencyMs: Date.now() - start,
      };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), model: modelId };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: ud, error: ue } = await sb.auth.getUser();
    if (ue || !ud?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = ud.user.id;

    const body = await req.json().catch(() => null);
    if (!body?.prompt) return jsonResponse({ error: "prompt required" }, 400);
    const { prompt, systemPrompt } = body;

    const lovable = Deno.env.get("LOVABLE_API_KEY") || undefined;
    const anthropic = Deno.env.get("ANTHROPIC_API_KEY") || undefined;

    // Wallet pre-check (estimate worst case)
    const estTotal = Object.keys(PRICING).reduce((acc, m) => {
      const p = PRICING[m];
      const inT = estimateTokens(prompt + (systemPrompt || ""));
      return acc + (inT / 1000) * p.input + (1500 / 1000) * p.output;
    }, 0);

    const { data: wallet } = await admin
      .from("ai_video_wallets")
      .select("balance_euros")
      .eq("user_id", userId)
      .maybeSingle();

    if (!wallet || Number(wallet.balance_euros) < estTotal) {
      return jsonResponse(
        {
          error: `Insufficient credits for compare run (~€${estTotal.toFixed(2)})`,
          code: "INSUFFICIENT_CREDITS",
        },
        402,
      );
    }

    const models = Object.keys(PROVIDER_MAP);
    const results = await Promise.all(
      models.map((m) => callModel(m, prompt, systemPrompt, { lovable, anthropic })),
    );

    const totalCost = results.reduce((a, r: any) => a + (r.cost || 0), 0);
    const resultsObj: Record<string, unknown> = {};
    for (const r of results) resultsObj[(r as any).model] = r;

    // Persist
    const { data: row } = await admin
      .from("text_studio_comparisons")
      .insert({
        user_id: userId,
        prompt,
        system_prompt: systemPrompt || null,
        results: resultsObj,
        total_cost_eur: Number(totalCost.toFixed(4)),
      })
      .select("id")
      .single();

    // Deduct
    if (totalCost > 0) {
      try {
        await admin.rpc("deduct_text_studio_credits", {
          p_user_id: userId,
          p_amount: Number(totalCost.toFixed(4)),
          p_conversation_id: null,
        });
      } catch (e) {
        console.error("[text-studio-compare] deduct failed", e);
      }
    }

    return jsonResponse({ id: row?.id, results: resultsObj, totalCost });
  } catch (e) {
    console.error("[text-studio-compare]", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
