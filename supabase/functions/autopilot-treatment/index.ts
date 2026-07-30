// autopilot-treatment
//
// The Director Team, stage 1: turn a one-line brief into a fully specified
// treatment. The LLM never writes a provider prompt — it only fills the scene
// grammar. Everything downstream (prompt compilation, rhythm, sound) is
// deterministic code, which is what keeps the output consistent.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface Body {
  brief: string;
  genre?: string;
  platform?: string;
  aspect_ratio?: string;
  language?: string;
  target_duration_seconds?: number;
  /** Cast & World characters the user pre-selected. Hard lock — no invention. */
  characters?: Array<{ id: string; name: string; description?: string }>;
  brand?: { name?: string; tone?: string; primaryColor?: string };
}

const SYSTEM = `Du bist ein Regisseur und Werbetexter mit 20 Jahren Erfahrung in hochwertiger
Bewegtbild-Produktion. Du entwickelst aus einem knappen Kundenbriefing ein vollständiges
Treatment für einen kurzen Film.

Arbeitsregeln:
1. Du schreibst KEINE Prompts. Du füllst ausschließlich Felder aus. Ein Compiler baut daraus
   später den Modellprompt.
2. subject, action, environment und mood sind IMMER auf Englisch — das ist die Sprache der
   Bildmodelle. Titel, Logline und gesprochene Dialoge sind in der Sprache des Nutzers.
3. Eine Szene = eine sichtbare Handlung. Keine Aufzählungen, keine "und dann"-Ketten.
4. Kein Text im Bild. Beschreibe niemals Schrift, Logos, Untertitel oder Schilder.
5. Verwende ausschließlich die übergebenen Charaktere. Erfinde keine Personen dazu.
   Wenn keine Charaktere übergeben wurden, beschreibe Menschen generisch oder verzichte
   ganz auf Personen.
6. Variiere Einstellungsgrößen und Kamerabewegungen. Zweimal hintereinander dieselbe
   Bewegung wirkt maschinell.
7. Die Dauer der einzelnen Szenen setzt du NICHT — das übernimmt der Rhythmus-Planer.
8. Sprechen in einer Szene mehrere Personen, füllst du "turns" (ein Eintrag pro Redebeitrag,
   in der richtigen Reihenfolge, jeweils mit der Charakter-ID des Sprechers). "dialogue"
   lässt du dann leer. Sprechen alle Turns zusammen, dürfen sie die Szene nicht sprengen:
   rechne mit rund 2,6 Wörtern pro Sekunde.


Antworte ausschließlich über den Tool-Call.`;

const SCENE_SCHEMA = {
  type: "object",
  properties: {
    beat: { type: "string" },
    subject: { type: "string" },
    action: { type: "string" },
    environment: { type: "string" },
    shotSize: { type: "string" },
    cameraMove: { type: "string" },
    lens: { type: "string" },
    lighting: { type: "string" },
    mood: { type: "string" },
    characterIds: { type: "array", items: { type: "string" } },
    dialogue: { type: "string" },
    speakerCharacterId: { type: "string" },
    turns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speakerCharacterId: { type: "string" },
          text: { type: "string" },
        },
        required: ["speakerCharacterId", "text"],
        additionalProperties: false,
      },
    },
    foleyHint: { type: "string" },
  },
  required: [
    "beat",
    "subject",
    "action",
    "environment",
    "shotSize",
    "cameraMove",
    "lens",
    "lighting",
    "mood",
  ],
  additionalProperties: false,
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { fn: "autopilot-treatment", ok: true });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = (await req.json()) as Body;
    const brief = (body?.brief ?? "").trim();
    if (brief.length < 8) return json({ error: "Bitte beschreibe dein Video etwas genauer." }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const language = body.language ?? "de";
    const aspect = body.aspect_ratio ?? "9:16";
    let characters = (body.characters ?? []).slice(0, 6);

    // Auto-Casting: the customer never has to pick a cast. When nothing was
    // pre-selected we hand the model the user's own Cast & World roster so it
    // can cast the film itself — instead of producing speakerless dialogue.
    if (characters.length === 0) {
      const { data: pool } = await supabase
        .from("brand_characters")
        .select("id, name, description, usage_count")
        .eq("user_id", user.id)
        .order("usage_count", { ascending: false })
        .limit(6);
      characters = (pool ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        name: String(row.name ?? "Charakter"),
        description: (row.description as string) ?? undefined,
      }));
    }


    const userPrompt = [
      `Briefing des Kunden:\n"${brief}"`,
      `Genre: ${body.genre ?? "automatisch bestimmen"}`,
      `Plattform: ${body.platform ?? "Instagram Reels"} · Format: ${aspect}`,
      `Zielsprache für Dialoge/Texte: ${language}`,
      body.target_duration_seconds
        ? `Gesamtlänge: ca. ${body.target_duration_seconds} Sekunden`
        : "Gesamtlänge: passend zum Genre wählen",
      characters.length
        ? `Verfügbare Charaktere (nur diese verwenden, characterIds exakt übernehmen):\n${characters
            .map((c) => `- ${c.id} — ${c.name}${c.description ? `: ${c.description}` : ""}`)
            .join("\n")}`
        : "Keine festen Charaktere hinterlegt.",
      body.brand?.name ? `Marke: ${body.brand.name} · Tonalität: ${body.brand.tone ?? "neutral"}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "treatment",
              description: "Das vollständige Treatment für den Film.",
              parameters: {
                type: "object",
                properties: {
                  genre: { type: "string" },
                  title: { type: "string" },
                  logline: { type: "string" },
                  totalDurationSeconds: { type: "number" },
                  musicMood: { type: "string" },
                  scenes: { type: "array", items: SCENE_SCHEMA },
                },
                required: ["genre", "title", "logline", "totalDurationSeconds", "scenes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "treatment" } },
      }),
    });

    if (resp.status === 429) return json({ error: "rate_limited" }, 429);
    if (resp.status === 402) return json({ error: "credits_exhausted" }, 402);
    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 400);
      console.error("[autopilot-treatment] gateway error", resp.status, detail);
      return json({ error: "treatment_generation_failed" }, 502);
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!raw) return json({ error: "treatment_empty" }, 502);

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const validIds = new Set(characters.map((c) => c.id));

    const scenes = (Array.isArray(parsed.scenes) ? parsed.scenes : []).map(
      (scene: Record<string, unknown>, index: number) => {
      const sceneId = crypto.randomUUID();
      // Multi-speaker turns. Only cast members survive the id lock; voices are
      // assigned later in the Director's Table, never invented by the model.
      const turns = (Array.isArray(scene.turns) ? scene.turns : [])
        .map((t: Record<string, unknown>, i: number) => ({
          id: `${sceneId}:${i}`,
          text: String(t?.text ?? "").trim(),
          speakerCharacterId: validIds.has(String(t?.speakerCharacterId ?? ""))
            ? String(t.speakerCharacterId)
            : undefined,
        }))
        .filter((t) => t.text.length > 1 && !!t.speakerCharacterId);
      return ({
        id: sceneId,
        orderIndex: index,
        beat: String(scene.beat ?? "body"),
        durationSeconds: 0, // the rhythm planner owns this
        subject: String(scene.subject ?? ""),
        action: String(scene.action ?? ""),
        environment: String(scene.environment ?? ""),
        shotSize: String(scene.shotSize ?? "medium"),
        cameraMove: String(scene.cameraMove ?? "static"),
        lens: String(scene.lens ?? "35mm"),
        lighting: String(scene.lighting ?? "soft_window"),
        mood: String(scene.mood ?? ""),
        // Hard character lock — anything the model invented is dropped here.
        characterIds: (Array.isArray(scene.characterIds) ? scene.characterIds : [])
          .map(String)
          .filter((id) => validIds.has(id)),
        propIds: [],
        turns: turns.length > 0 ? turns : undefined,
        dialogue: turns.length > 0
          ? turns.map((t) => t.text).join(" ")
          : String(scene.dialogue ?? "").trim() || undefined,
        speakerCharacterId: turns.length > 0
          ? turns[0].speakerCharacterId
          : validIds.has(String(scene.speakerCharacterId ?? ""))
          ? String(scene.speakerCharacterId)
          : undefined,
        voiceLanguage: language,
        foleyHint: String(scene.foleyHint ?? "").trim() || undefined,
      });
      },
    );

    if (scenes.length === 0) return json({ error: "treatment_no_scenes" }, 502);

    const treatment = {
      genre: String(parsed.genre ?? body.genre ?? "ad_spot"),
      title: String(parsed.title ?? "Ohne Titel"),
      logline: String(parsed.logline ?? ""),
      aspect,
      totalDurationSeconds:
        Number(parsed.totalDurationSeconds) || body.target_duration_seconds || 20,
      language,
      scenes,
      musicMood: String(parsed.musicMood ?? ""),
      brand: body.brand ?? {},
    };

    // Persist so the Director's Table can reload the production after a refresh.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: production, error: insertError } = await admin
      .from("autopilot_productions")
      .insert({
        user_id: user.id,
        brief,
        genre: treatment.genre,
        platform: body.platform ?? "instagram_reels",
        aspect_ratio: aspect,
        language,
        target_duration_seconds: treatment.totalDurationSeconds,
        stage: "treatment",
        status: "awaiting_approval",
        progress: 20,
        treatment,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[autopilot-treatment] insert failed", insertError.message);
      return json({ error: "persist_failed", detail: insertError.message }, 500);
    }

    await admin.from("autopilot_director_log").insert({
      production_id: production.id,
      user_id: user.id,
      stage: "treatment",
      role: "writer",
      message: `Treatment "${treatment.title}" mit ${scenes.length} Szenen entwickelt.`,
      meta: { logline: treatment.logline },
    });

    return json({ ok: true, production_id: production.id, treatment });
  } catch (err) {
    console.error("[autopilot-treatment] fatal", err);
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
