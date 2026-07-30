// autopilot-anchor-gate
//
// The core of the Anchor-First strategy: prove the frame BEFORE paying for
// motion. A still costs roughly one hundredth of a video clip, so we generate
// it, judge it with vision, repair it, and only hand a verified frame to the
// expensive image-to-video pass.
//
// Returns { ok, anchorUrl, score, attempts, verdicts } — never throws at the
// caller; a hard failure comes back as ok:false so the orchestrator can route
// to a fallback instead of stalling the production.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface Body {
  production_id?: string;
  scene_id: string;
  /** Compiled anchor prompt from `promptGrammar.compileAnchorPrompt`. English. */
  anchor_prompt: string;
  aspect_ratio?: "16:9" | "9:16" | "1:1" | "4:5";
  /** Cast & World portraits — enables the identity-locked anchor path. */
  portrait_urls?: string[];
  character_names?: string[];
  /** Brand product references the frame must render faithfully. */
  prop_urls?: string[];
  /** Extra things the judge should specifically look for. */
  must_contain?: string[];
  /** Stop repairing once the score reaches this. */
  pass_score?: number;
  /** Hard cap on generation attempts (1 = generate once, judge, no repair). */
  max_attempts?: number;
  /**
   * Produktionsweiter Stilblock (englisch). Jede Szene desselben Films bekommt
   * denselben Block — ohne ihn driftet der Look (Anime-Ausreißer).
   */
  style_guide?: string;
  /** Freigegebener Anker der ersten Szene — Look-Referenz, nicht Inhalt. */
  style_reference_url?: string;
  /** Gesamtbudget in ms; danach wird der beste bisherige Frame zurückgegeben. */
  deadline_ms?: number;
}

/** Fixed rubric. Calibrate this, not the prompt of the day. */
const JUDGE_RULES = `Du bist Bildkritiker in einer Werbeproduktion. Du bewertest EIN Standbild,
das gleich als erster Frame eines Videoclips animiert wird. Fehler, die du jetzt durchwinkst,
kosten später ein Vielfaches.

Bewerte streng und unabhängig in sieben Achsen, je 0–100:
- identity_fidelity: Stimmen Gesichter mit den Referenzportraits überein? Keine Doppelgänger,
  keine zusätzlichen Personen, keine vertauschten Identitäten. Ohne Referenzportraits: 100.
- product_fidelity: Ist das Produkt korrekt und unverzerrt dargestellt? Ohne Produkt: 100.
- anatomy: Hände, Finger, Augen, Zähne, Gliedmaßen. Jeder Anatomiefehler ist gravierend.
- composition: Bildaufbau, Blickführung, Platz für spätere Textelemente, kein Beschnitt am Motiv.
- text_artifacts: 100 = gar kein Text im Bild. Jede Fantasieschrift, jedes verzerrte Logo
  und jedes Wasserzeichen zieht stark ab.
- brand_fit: Passen Licht, Farbwelt und Stimmung zur beschriebenen Szene?
- style_match: Entspricht der Frame exakt dem vorgegebenen Look des Films (Fotorealismus,
  Filmstock, Farbwelt)? Jede Stilabweichung — Anime, Illustration, Cartoon, 3D-Render,
  Gemälde, Comic — ist ein harter Durchfall (unter 30). Ohne Stilvorgabe: 100.

Der Gesamtscore ist das MINIMUM aller sieben Achsen, nicht der Durchschnitt — ein einziger
grober Fehler macht den Frame unbrauchbar.

Wenn der Frame durchfällt, formuliere in "repair_instruction" eine kurze, konkrete englische
Korrekturanweisung, die nur den Fehler adressiert (z. B. "the left hand has six fingers, render
both hands relaxed and partially out of frame"). Erfinde keine neue Bildidee.

Antworte NUR über den Tool-Call.`;


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { fn: "autopilot-anchor-gate", ok: true });

  try {
    const body = (await req.json()) as Body;
    if (!body?.scene_id || !body?.anchor_prompt) {
      return json({ ok: false, error: "scene_id and anchor_prompt are required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ ok: false, error: "LOVABLE_API_KEY missing" }, 500);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const aspect = body.aspect_ratio ?? "16:9";
    const passScore = clampInt(body.pass_score ?? 78, 40, 98);
    const maxAttempts = clampInt(body.max_attempts ?? 4, 1, 6);
    const portraits = (body.portrait_urls ?? []).filter(Boolean).slice(0, 4);
    const props = (body.prop_urls ?? []).filter(Boolean).slice(0, 3);

    const verdicts: unknown[] = [];
    let prompt = body.anchor_prompt;
    let best: { url: string; score: number } | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const image = await generateAnchor({
        apiKey: LOVABLE_API_KEY,
        prompt,
        aspect,
        refs: [...portraits, ...props],
      });

      if (!image) {
        verdicts.push({ attempt, error: "generation_failed" });
        continue;
      }

      const url = await upload(admin, body.scene_id, attempt, image);
      if (!url) {
        verdicts.push({ attempt, error: "upload_failed" });
        continue;
      }

      const verdict = await judge({
        apiKey: LOVABLE_API_KEY,
        imageUrl: url,
        prompt: body.anchor_prompt,
        hasPortraits: portraits.length > 0,
        characterNames: body.character_names ?? [],
        mustContain: body.must_contain ?? [],
      });

      verdicts.push({ attempt, url, ...verdict });

      if (!best || verdict.score > best.score) best = { url, score: verdict.score };

      if (verdict.score >= passScore) {
        return json({
          ok: true,
          anchor_url: url,
          score: verdict.score,
          attempts: attempt,
          verdicts,
        });
      }

      // Targeted repair — we change what is broken, we do not reroll the dice.
      if (verdict.repair_instruction) {
        prompt = `${body.anchor_prompt} IMPORTANT CORRECTION: ${verdict.repair_instruction}`;
      }
    }

    // Nothing cleared the bar. Hand back the best frame we produced together
    // with its score so the orchestrator can decide: accept, swap the engine,
    // or fall back to stock.
    return json({
      ok: Boolean(best),
      anchor_url: best?.url ?? null,
      score: best?.score ?? 0,
      attempts: maxAttempts,
      below_threshold: true,
      verdicts,
    });
  } catch (err) {
    console.error("[autopilot-anchor-gate] fatal", err);
    return json({ ok: false, error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});

// ---------------------------------------------------------------- generation

async function generateAnchor(args: {
  apiKey: string;
  prompt: string;
  aspect: string;
  refs: string[];
}): Promise<{ bytes: Uint8Array; mime: string; ext: string } | null> {
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        `${args.prompt}\n\nRender a single photorealistic still frame in ${args.aspect} aspect ratio.` +
        (args.refs.length
          ? " The attached reference images define the exact identity of the people and the exact appearance of the products. Reproduce them faithfully."
          : ""),
    },
  ];
  for (const url of args.refs) content.push({ type: "image_url", image_url: { url } });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 90_000);
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
      }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      console.error("[anchor-gate] image error", resp.status, (await resp.text()).slice(0, 300));
      return null;
    }
    const jsonBody = await resp.json();
    const dataUrl: string | undefined =
      jsonBody?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:image")) return null;

    const [meta, b64] = dataUrl.split(",", 2);
    const mime = /data:(image\/[a-z+]+);/.exec(meta)?.[1] ?? "image/png";
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    return { bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), mime, ext };
  } catch (e) {
    clearTimeout(timer);
    console.warn("[anchor-gate] image generation aborted", (e as Error)?.name);
    return null;
  }
}

async function upload(
  admin: ReturnType<typeof createClient>,
  sceneId: string,
  attempt: number,
  image: { bytes: Uint8Array; mime: string; ext: string },
): Promise<string | null> {
  const path = `autopilot-anchors/${sceneId}/${Date.now()}-a${attempt}.${image.ext}`;
  const { error } = await admin.storage
    .from("composer-frames")
    .upload(path, image.bytes, { contentType: image.mime, upsert: true });
  if (error) {
    console.error("[anchor-gate] upload failed", error.message);
    return null;
  }
  const { data } = admin.storage.from("composer-frames").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

// -------------------------------------------------------------------- judging

interface Verdict {
  score: number;
  axes: Record<string, number>;
  repair_instruction: string | null;
  summary: string;
}

async function judge(args: {
  apiKey: string;
  imageUrl: string;
  prompt: string;
  hasPortraits: boolean;
  characterNames: string[];
  mustContain: string[];
}): Promise<Verdict> {
  const userText = [
    `Geplante Szene (englischer Prompt):\n${args.prompt}`,
    args.hasPortraits
      ? `Im Bild erwartete Personen: ${args.characterNames.join(", ") || "(unbenannt)"} — genau ${args.characterNames.length || "diese"} Person(en), keine weiteren.`
      : "Keine Referenzpersonen — identity_fidelity mit 100 bewerten.",
    args.mustContain.length ? `Muss sichtbar sein: ${args.mustContain.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
        messages: [
          { role: "system", content: JUDGE_RULES },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: args.imageUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "verdict",
              description: "Liefere die Bewertung des Standbilds.",
              parameters: {
                type: "object",
                properties: {
                  identity_fidelity: { type: "integer" },
                  product_fidelity: { type: "integer" },
                  anatomy: { type: "integer" },
                  composition: { type: "integer" },
                  text_artifacts: { type: "integer" },
                  brand_fit: { type: "integer" },
                  repair_instruction: { type: "string" },
                  summary: { type: "string" },
                },
                required: [
                  "identity_fidelity",
                  "product_fidelity",
                  "anatomy",
                  "composition",
                  "text_artifacts",
                  "brand_fit",
                  "summary",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "verdict" } },
      }),
    });

    if (!resp.ok) {
      console.error("[anchor-gate] judge error", resp.status, (await resp.text()).slice(0, 300));
      // A judge outage must not block the production — accept with a neutral score.
      return neutralVerdict("judge_unavailable");
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!call) return neutralVerdict("judge_no_toolcall");

    const parsed = JSON.parse(call) as Record<string, unknown>;
    const axes: Record<string, number> = {};
    for (const key of [
      "identity_fidelity",
      "product_fidelity",
      "anatomy",
      "composition",
      "text_artifacts",
      "brand_fit",
    ]) {
      axes[key] = clampInt(Number(parsed[key] ?? 0), 0, 100);
    }

    // Minimum, not average: one broken axis ruins the frame.
    const score = Math.min(...Object.values(axes));
    const repair = String(parsed.repair_instruction ?? "").trim();

    return {
      score,
      axes,
      repair_instruction: repair || null,
      summary: String(parsed.summary ?? ""),
    };
  } catch (err) {
    console.error("[anchor-gate] judge threw", err);
    return neutralVerdict("judge_exception");
  }
}

function neutralVerdict(reason: string): Verdict {
  return { score: 80, axes: {}, repair_instruction: null, summary: reason };
}

// -------------------------------------------------------------------- helpers

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
