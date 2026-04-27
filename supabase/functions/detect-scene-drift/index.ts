// detect-scene-drift v1.0.0
// Compares the last frame of scene N (anchor) with the first frame of scene N+1
// using Gemini 2.5 Flash multimodal. Returns a drift score 0-100 and a short label.
//
// Scoring rubric (lower = better continuity):
//   0-15   ✓ perfectly consistent (same character, lighting, framing)
//   16-35  · acceptable cut (minor drift in lighting / angle)
//   36-65  ⚠ noticeable drift (different framing or props changed)
//   66-100 ✗ broken continuity (different character / scene / style)
//
// Persists the score to composer_scenes.continuity_drift_score for the
// "next" scene (the one being judged).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  /** Public URL of the previous scene's last frame (anchor). */
  anchorImageUrl: string;
  /** Public URL of the next scene's first frame (or its reference image). */
  candidateImageUrl: string;
  /** ID of the "next" scene — score is persisted on this row. */
  sceneId?: string;
  /** Optional id of the "previous" (anchor) scene for history logging. */
  anchorSceneId?: string;
  /** Optional composer project id for history logging. */
  projectId?: string;
}

interface DriftResult {
  driftScore: number;
  label: string;
  recommendation: "ok" | "soft-repair" | "hard-repair";
}

const SYSTEM_PROMPT = `You are a film continuity supervisor. You will see two stills:
IMAGE A = the LAST frame of the previous shot
IMAGE B = the FIRST frame of the next shot

Score the visual continuity drift on a scale 0-100:
  0-15   = perfectly consistent (same character, identical lighting, similar framing)
  16-35  = acceptable cut (minor drift in lighting/angle, same scene & cast)
  36-65  = noticeable drift (different framing, lighting changed, props moved)
  66-100 = broken continuity (different character, different scene, style mismatch)

Respond ONLY with strict minified JSON, no prose, no markdown:
{"driftScore": <int 0-100>, "label": "<max 8 words diff summary>", "recommendation": "ok"|"soft-repair"|"hard-repair"}`;

async function fetchAsBase64(url: string): Promise<{ data: string; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} → ${res.status}`);
  const mime = res.headers.get("content-type") || "image/png";
  const buf = new Uint8Array(await res.arrayBuffer());
  // base64 in chunks to avoid call-stack limits
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return { data: btoa(binary), mime };
}

function safeParseDrift(raw: string): DriftResult {
  // Strip markdown fences if model wraps anyway
  const cleaned = raw
    .replace(/```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    const driftScore = Math.max(
      0,
      Math.min(100, Math.round(Number(parsed.driftScore) || 0))
    );
    const label = String(parsed.label || "").slice(0, 80);
    const rec =
      parsed.recommendation === "hard-repair" ||
      parsed.recommendation === "soft-repair"
        ? parsed.recommendation
        : driftScore >= 66
          ? "hard-repair"
          : driftScore >= 36
            ? "soft-repair"
            : "ok";
    return { driftScore, label, recommendation: rec };
  } catch (e) {
    console.warn("[drift] failed to parse JSON:", raw);
    // Heuristic fallback — pessimistic so the user still notices
    return {
      driftScore: 50,
      label: "Could not analyse — manual review recommended",
      recommendation: "soft-repair",
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = (await req.json()) as RequestBody;
    if (!body.anchorImageUrl || !body.candidateImageUrl) {
      return new Response(
        JSON.stringify({
          error: "anchorImageUrl and candidateImageUrl required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch + b64 in parallel
    const [anchor, candidate] = await Promise.all([
      fetchAsBase64(body.anchorImageUrl),
      fetchAsBase64(body.candidateImageUrl),
    ]);

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "IMAGE A — last frame of previous shot:" },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${anchor.mime};base64,${anchor.data}`,
                  },
                },
                {
                  type: "text",
                  text: "IMAGE B — first frame of next shot:",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${candidate.mime};base64,${candidate.data}`,
                  },
                },
                {
                  type: "text",
                  text: "Return only the JSON.",
                },
              ],
            },
          ],
        }),
      }
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[drift] AI gateway error:", aiRes.status, errText);
      throw new Error(`AI gateway ${aiRes.status}: ${errText.slice(0, 200)}`);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "";
    const result = safeParseDrift(String(raw));

    // Persist to next-scene row
    if (body.sceneId) {
      const { error: upErr } = await supabase
        .from("composer_scenes")
        .update({
          continuity_drift_score: result.driftScore,
          continuity_drift_label: result.label,
          continuity_checked_at: new Date().toISOString(),
        })
        .eq("id", body.sceneId);
      if (upErr) {
        console.warn("[drift] persist failed:", upErr);
      }
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[detect-scene-drift] error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
