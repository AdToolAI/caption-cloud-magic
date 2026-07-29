// autopilot-ideas
//
// The Director Team, stage 0: strategy first, then five deliberately different
// campaign ideas. The model never picks the mechanism itself — each of the five
// slots is assigned a narrative angle, which is what prevents five rewordings
// of the same thought. Feasibility scoring happens in deterministic code
// afterwards (src/lib/autopilot/ideaFeasibility.ts is mirrored here).

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const MAX_TOTAL_SECONDS = 180;
const MIN_TOTAL_SECONDS = 8;

const ANGLES = [
  {
    id: "problem_solution",
    label: "Problem → Lösung",
    mechanism:
      "Zeige zuerst den konkreten Ärger im Alltag der Zielgruppe, dann die Lösung als sichtbare Erleichterung. Kein Text erklärt das Problem — man sieht es.",
  },
  {
    id: "testimonial",
    label: "Testimonial",
    mechanism:
      "Ein Mensch erzählt in eigenen Worten, was sich verändert hat. Ehrlich, unpoliert, nah am Gesicht. Die Aussage trägt den Film.",
  },
  {
    id: "visual_metaphor",
    label: "Visuelle Metapher",
    mechanism:
      "Übersetze den Nutzen in ein einziges starkes Bild, das man nicht erklären muss. Es löst sich am Ende im Produkt auf.",
  },
  {
    id: "micro_story",
    label: "Mikro-Story mit Wendung",
    mechanism:
      "Winzige Geschichte mit Kippmoment. Der Zuschauer glaubt zuerst etwas anderes zu sehen — die Wendung macht das Produkt zur Pointe.",
  },
  {
    id: "product_poetry",
    label: "Produkt-Poesie",
    mechanism:
      "Reine Sinnlichkeit: Makro, Licht, Textur, Bewegung. Kein Argument, nur Begehren. Rhythmus und Ton tragen die Wirkung.",
  },
];

const SYSTEM = `Du bist Kreativdirektor einer preisgekrönten Werbeagentur. Du denkst zuerst
strategisch, dann kreativ. Du lieferst Ideen, die ein Kunde sofort versteht und ein Regisseur
sofort drehen kann.

Regeln:
1. Zuerst die Strategie: Zielgruppe, konkreter Nutzen, echtes Kaufhemmnis, Tonalität,
   was der Zuschauer nach drei Sekunden gedacht haben soll, und die eine Sache, die hängen bleibt.
2. Danach genau fünf Ideen. Jede Idee bekommt einen fest vorgegebenen Erzählmechanismus —
   halte dich exakt daran, damit die fünf Ideen wirklich verschieden sind.
3. Jede Idee braucht einen Hook, der in der ersten Sekunde funktioniert, ohne Ton verständlich ist
   und keine Floskel enthält ("Kennst du das?" ist verboten).
4. Beschreibe Beats als sichtbare Handlung, nicht als Werbetext. Eine Handlung pro Beat.
5. Niemals Schrift, Logos, Untertitel oder Schilder im Bild beschreiben — Text kommt später
   als saubere Einblendung.
6. Keine Menschenmengen, keine Stunts, keine gefährliche Physik. Maximal vier sichtbare Personen
   pro Einstellung.
7. Verwende ausschließlich die übergebenen Charaktere und Kundenbilder. Erfinde nichts dazu.
8. Titel, Hook, Logline, Beats und Begründung in der Sprache des Nutzers. Nur "visualWorld"
   darf englische Fachbegriffe enthalten.

Antworte ausschließlich über den Tool-Call.`;

const IDEA_SCHEMA = {
  type: "object",
  properties: {
    angle: { type: "string" },
    title: { type: "string" },
    hook: { type: "string" },
    logline: { type: "string" },
    genre: { type: "string" },
    visualWorld: { type: "string" },
    rationale: { type: "string" },
    maxPeopleInShot: { type: "number" },
    speakingScenes: { type: "number" },
    usesAssetIds: { type: "array", items: { type: "string" } },
    beats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          beat: { type: "string" },
          description: { type: "string" },
          seconds: { type: "number" },
        },
        required: ["beat", "description", "seconds"],
        additionalProperties: false,
      },
    },
  },
  required: ["angle", "title", "hook", "logline", "visualWorld", "rationale", "beats"],
  additionalProperties: false,
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const body = await req.json();
    const brief = String(body?.brief ?? "").trim();
    if (brief.length < 8) return json({ error: "Bitte beschreibe dein Video etwas genauer." }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const language = String(body?.language ?? "de");
    const aspect = String(body?.aspect_ratio ?? "9:16");
    const duration = clampDuration(Number(body?.target_duration_seconds ?? 30));
    const characters = (Array.isArray(body?.characters) ? body.characters : []).slice(0, 8);
    const assets = (Array.isArray(body?.assets) ? body.assets : []).slice(0, 8);
    const options = {
      voiceover: body?.voiceover !== false,
      lipSync: body?.lip_sync === true,
      lipSyncSpeakers: Math.max(1, Math.min(4, Number(body?.lip_sync_speakers ?? 1))),
      platform: String(body?.platform ?? "instagram_reels"),
    };

    const userPrompt = [
      `Briefing des Kunden:\n"${brief}"`,
      `Plattform: ${options.platform} · Format: ${aspect} · Sprache: ${language}`,
      `Gesamtlänge: ca. ${duration} Sekunden (harte Obergrenze 180 Sekunden)`,
      options.lipSync
        ? `Lip-Sync gewünscht: bis zu ${options.lipSyncSpeakers} sprechende Person(en) im Bild.`
        : "Kein Lip-Sync — niemand spricht sichtbar in die Kamera.",
      options.voiceover ? "Ein Voiceover ist erwünscht." : "Kein Voiceover — der Film wirkt über Bild und Ton.",
      characters.length
        ? `Verfügbare Charaktere (nur diese):\n${characters
            .map((c: Record<string, unknown>) => `- ${c.id} — ${c.name}${c.description ? `: ${c.description}` : ""}`)
            .join("\n")}`
        : "Keine festen Charaktere hinterlegt.",
      assets.length
        ? `Vom Kunden hochgeladene Bilder (usesAssetIds exakt übernehmen):\n${assets
            .map((a: Record<string, unknown>) =>
              `- ${a.id} [${a.role}] ${a.description ?? ""}${a.note ? ` — Kundenwunsch: ${a.note}` : ""}${
                a.role === "logo" ? " (wird als Einblendung gelegt, nicht generiert)" : ""
              }${a.role === "style" ? " (nur Look übernehmen, nicht den Inhalt)" : ""}`)
            .join("\n")}`
        : "Keine eigenen Bilder hochgeladen.",
      `Die fünf Ideen-Slots mit ihrem festen Mechanismus:\n${ANGLES.map(
        (a, i) => `${i + 1}. ${a.id} (${a.label}) — ${a.mechanism}`,
      ).join("\n")}`,
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
              name: "idea_round",
              description: "Strategie plus fünf Werbeideen.",
              parameters: {
                type: "object",
                properties: {
                  strategy: {
                    type: "object",
                    properties: {
                      audience: { type: "string" },
                      benefit: { type: "string" },
                      objection: { type: "string" },
                      tone: { type: "string" },
                      threeSecondThought: { type: "string" },
                      takeaway: { type: "string" },
                    },
                    required: ["audience", "benefit", "objection", "tone", "threeSecondThought", "takeaway"],
                    additionalProperties: false,
                  },
                  ideas: { type: "array", items: IDEA_SCHEMA },
                },
                required: ["strategy", "ideas"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "idea_round" } },
      }),
    });

    if (resp.status === 429) return json({ error: "rate_limited" }, 429);
    if (resp.status === 402) return json({ error: "credits_exhausted" }, 402);
    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 400);
      console.error("[autopilot-ideas] gateway error", resp.status, detail);
      return json({ error: "idea_generation_failed", detail }, 502);
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!raw) return json({ error: "idea_round_empty" }, 502);
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const validAssetIds = new Set(assets.map((a: Record<string, unknown>) => String(a.id)));
    const rawIdeas = Array.isArray(parsed.ideas) ? parsed.ideas : [];

    // Slot alignment: the model may return the angles out of order, or drop one.
    const ideas = ANGLES.map((angle, index) => {
      const match =
        rawIdeas.find((i: Record<string, unknown>) => String(i.angle) === angle.id) ??
        rawIdeas[index] ??
        null;
      if (!match) return null;
      const m = match as Record<string, unknown>;
      return {
        index,
        angle: angle.id,
        title: String(m.title ?? angle.label),
        hook: String(m.hook ?? ""),
        logline: String(m.logline ?? ""),
        genre: String(m.genre ?? body?.genre ?? "ad_spot"),
        visualWorld: String(m.visualWorld ?? ""),
        rationale: String(m.rationale ?? ""),
        maxPeopleInShot: Number(m.maxPeopleInShot ?? 1) || 1,
        speakingScenes: Number(m.speakingScenes ?? 0) || 0,
        usesAssetIds: (Array.isArray(m.usesAssetIds) ? m.usesAssetIds : [])
          .map(String)
          .filter((id: string) => validAssetIds.has(id)),
        beats: (Array.isArray(m.beats) ? m.beats : []).map((b: Record<string, unknown>) => ({
          beat: String(b.beat ?? "body"),
          description: String(b.description ?? ""),
          seconds: Number(b.seconds ?? 3) || 3,
        })),
      };
    }).filter(Boolean);

    if (ideas.length === 0) return json({ error: "idea_round_no_ideas" }, 502);

    const strategy = (parsed.strategy ?? {}) as Record<string, unknown>;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: record, error: insertError } = await admin
      .from("autopilot_ideas")
      .insert({
        user_id: user.id,
        brief,
        strategy,
        concepts: ideas,
        genre: body?.genre ?? null,
        language,
        aspect_ratio: aspect,
        target_duration_seconds: duration,
        options,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[autopilot-ideas] insert failed", insertError.message);
      return json({ error: "persist_failed", detail: insertError.message }, 500);
    }

    // Attach the uploaded assets to this idea round so the treatment can reload them.
    if (assets.length) {
      await admin
        .from("autopilot_assets")
        .update({ idea_id: record.id })
        .in("id", assets.map((a: Record<string, unknown>) => String(a.id)))
        .eq("user_id", user.id);
    }

    return json({ ok: true, idea_record_id: record.id, strategy, ideas });
  } catch (err) {
    console.error("[autopilot-ideas] fatal", err);
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});

function clampDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return 30;
  return Math.min(MAX_TOTAL_SECONDS, Math.max(MIN_TOTAL_SECONDS, Math.round(seconds)));
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
