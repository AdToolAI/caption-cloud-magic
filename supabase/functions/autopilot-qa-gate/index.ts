// Vision-Gate — analyzes generated asset + caption for brand safety, deepfake/copyright risks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  slot_id: string;
  asset_url?: string | null;
  caption?: string;
}

const QA_RULES = `Du bist Compliance-QA für Social-Media-Assets. Prüfe streng:
RED FLAGS (allowed=false, severity=critical):
- Erkennbare reale Personen (Promis, Politiker)
- Marken-Logos / geschützte Charaktere (Disney, Pixar, Marvel, Apple, Nike etc.)
- Watermarks anderer KI-Tools / Stock-Sites
- NSFW, Gewalt, Blut, Hass-Symbole

YELLOW (allowed=true, score 50-70):
- Generische Personen (sehr stylisiert ok)
- Vage marken-ähnliche Elemente
- Text-Overlays mit Tippfehlern

GREEN (allowed=true, score 80-100):
- Saubere generische Visuals
- Keine Logos / keine erkennbaren Personen
- Caption enthält "Made with AI" oder "AI-generated" Hinweis

Antworte NUR via Tool-Call.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const userMessages: Array<Record<string, unknown>> = [
      { type: "text", text: `Caption:\n${body.caption ?? "(none)"}` },
    ];
    if (body.asset_url) {
      userMessages.push({ type: "image_url", image_url: { url: body.asset_url } });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: QA_RULES },
          { role: "user", content: userMessages },
        ],
        tools: [{
          type: "function",
          function: {
            name: "qa_check",
            description: "Liefere QA-Ergebnis.",
            parameters: {
              type: "object",
              properties: {
                allowed: { type: "boolean" },
                score: { type: "integer", minimum: 0, maximum: 100 },
                severity: { type: "string", enum: ["none", "soft", "hard", "critical"] },
                findings: {
                  type: "object",
                  properties: {
                    deepfake_risk: { type: "boolean" },
                    copyright_risk: { type: "boolean" },
                    brand_logo_detected: { type: "boolean" },
                    nsfw: { type: "boolean" },
                    has_ai_disclosure: { type: "boolean" },
                  },
                  required: ["deepfake_risk", "copyright_risk", "brand_logo_detected", "nsfw", "has_ai_disclosure"],
                  additionalProperties: false,
                },
                reason: { type: "string" },
              },
              required: ["allowed", "score", "severity", "findings", "reason"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "qa_check" } },
      }),
    });

    if (aiResp.status === 429 || aiResp.status === 402) {
      // On AI failure, default to qa_review (humans must approve)
      return json({ allowed: true, score: 50, severity: "soft", findings: {}, reason: "qa_unavailable" });
    }
    if (!aiResp.ok) throw new Error(`AI ${aiResp.status}`);

    const data = await aiResp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const qa = args ? JSON.parse(args) : { allowed: true, score: 60, severity: "soft", findings: {}, reason: "no-classification" };

    // Critical → strike + slot block
    if (!qa.allowed && (qa.severity === "hard" || qa.severity === "critical") && body.slot_id) {
      const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: slot } = await supa.from("autopilot_queue").select("user_id").eq("id", body.slot_id).maybeSingle();
      if (slot) {
        await supa.from("autopilot_strikes").insert({
          user_id: slot.user_id,
          severity: qa.severity,
          reason_code: `qa_gate_${qa.findings?.deepfake_risk ? "deepfake" : qa.findings?.copyright_risk ? "copyright" : qa.findings?.brand_logo_detected ? "brand_logo" : "qa"}`,
          reason_description: `QA-Gate blockiert: ${qa.reason}`,
          related_slot_id: body.slot_id,
          evidence_json: { qa, asset_url: body.asset_url, caption: body.caption?.slice(0, 200) },
        });

        // critical → trigger termination check
        if (qa.severity === "critical") {
          await supa.functions.invoke("terminate-autopilot-abuse", {
            body: { user_id: slot.user_id, reason: "critical_qa_violation", evidence: qa },
          });
        }
      }
    }

    return json(qa);
  } catch (e) {
    console.error("qa-gate error", e);
    return json({ allowed: true, score: 50, severity: "soft", findings: {}, reason: e instanceof Error ? e.message : "qa_error" });
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
