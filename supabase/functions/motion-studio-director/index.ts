// motion-studio-director v1.0.0
// Transforms a free-text brief into a structured storyboard using
// Gemini 2.5 Pro. The output maps directly onto Studio Mode state:
//   { title, scenes: [{ shot, prompt, durationSeconds, cameraMove, cast, locationHint }] }
//
// Pure planning function — does NOT touch the database. The client
// applies the returned plan to its local Studio Mode state.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DirectorScene {
  shot: string;            // e.g. "WS", "MS", "CU", "OTS"
  prompt: string;          // ready-to-render prompt for the AI engine
  durationSeconds: number; // 3-8s typical
  cameraMove?: string;     // pan, dolly, static, …
  castName?: string;       // free-text cast reference (resolved client-side)
  locationHint?: string;   // free-text location reference
  vibe?: string;           // mood/tone tag
}

interface DirectorPlan {
  title: string;
  logline: string;
  scenes: DirectorScene[];
  totalDurationSeconds: number;
}

interface RequestBody {
  brief: string;
  targetDurationSeconds?: number; // default 30
  language?: string;              // 'de' | 'en' | 'es'
  castNames?: string[];           // names of available characters
  locationNames?: string[];       // names of available locations
  mood?: string;                  // optional global mood/style override
}

const SYSTEM_PROMPT = `You are an award-winning film director who turns rough briefs
into shot-by-shot storyboards for AI-generated short videos.

Output STRICT minified JSON with this exact shape — no prose, no markdown:
{
  "title": "<short cinematic title, max 8 words>",
  "logline": "<one-sentence logline>",
  "scenes": [
    {
      "shot": "WS|MS|CU|OTS|POV|AERIAL",
      "prompt": "<detailed visual prompt for an AI text-to-video model, 1-2 sentences, vivid, specific>",
      "durationSeconds": <int 3-8>,
      "cameraMove": "static|pan|dolly|tilt|orbit|push-in|pull-out",
      "castName": "<one of the provided cast names if relevant, else null>",
      "locationHint": "<one of the provided location names if relevant, else short free-text>",
      "vibe": "<mood tag like 'cinematic', 'energetic', 'intimate'>"
    }
  ]
}

Rules:
- Total durations across scenes should sum close to the requested target (±5s).
- 4-8 scenes max. Vary shot types for rhythm.
- Each prompt must be visually specific (lighting, framing, action) — never generic.
- If castNames/locationNames are provided, prefer them over invented entities.
- Respond in the requested language for title + logline; KEEP visual prompts in ENGLISH for AI model quality.`;

function safeParse(raw: string): DirectorPlan | null {
  const cleaned = raw
    .replace(/```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed?.scenes || !Array.isArray(parsed.scenes)) return null;
    const scenes: DirectorScene[] = parsed.scenes
      .slice(0, 8)
      .map((s: any) => ({
        shot: String(s.shot ?? "MS").slice(0, 12),
        prompt: String(s.prompt ?? "").slice(0, 600),
        durationSeconds: Math.max(2, Math.min(10, Math.round(Number(s.durationSeconds) || 5))),
        cameraMove: s.cameraMove ? String(s.cameraMove).slice(0, 24) : undefined,
        castName: s.castName ? String(s.castName).slice(0, 80) : undefined,
        locationHint: s.locationHint ? String(s.locationHint).slice(0, 120) : undefined,
        vibe: s.vibe ? String(s.vibe).slice(0, 32) : undefined,
      }))
      .filter((s: DirectorScene) => s.prompt.length > 0);
    if (scenes.length === 0) return null;
    return {
      title: String(parsed.title ?? "Untitled").slice(0, 80),
      logline: String(parsed.logline ?? "").slice(0, 240),
      scenes,
      totalDurationSeconds: scenes.reduce((a, s) => a + s.durationSeconds, 0),
    };
  } catch (e) {
    console.warn("[director] JSON parse failed:", raw.slice(0, 200));
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const body = (await req.json()) as RequestBody;
    if (!body.brief || body.brief.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "brief is required (min 10 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetDuration = body.targetDurationSeconds ?? 30;
    const language = body.language ?? "en";
    const castList = (body.castNames ?? []).filter(Boolean).slice(0, 10);
    const locList = (body.locationNames ?? []).filter(Boolean).slice(0, 10);

    const userPrompt = [
      `BRIEF: ${body.brief.trim()}`,
      `TARGET DURATION: ~${targetDuration} seconds total`,
      `OUTPUT LANGUAGE (title/logline): ${language}`,
      castList.length ? `AVAILABLE CAST: ${castList.join(", ")}` : "AVAILABLE CAST: (none)",
      locList.length ? `AVAILABLE LOCATIONS: ${locList.join(", ")}` : "AVAILABLE LOCATIONS: (none)",
      body.mood ? `GLOBAL MOOD: ${body.mood}` : "",
      "Return ONLY the JSON storyboard.",
    ]
      .filter(Boolean)
      .join("\n");

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      }
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[director] AI gateway error:", aiRes.status, errText);
      throw new Error(`AI gateway ${aiRes.status}: ${errText.slice(0, 200)}`);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "";
    const plan = safeParse(String(raw));

    if (!plan) {
      return new Response(
        JSON.stringify({ error: "Director could not produce a valid plan", raw: String(raw).slice(0, 400) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true, plan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[motion-studio-director] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
