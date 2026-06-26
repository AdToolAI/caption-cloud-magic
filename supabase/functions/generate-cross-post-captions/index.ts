// Cross-Post Magic — generates per-channel captions from a single briefing.
// Uses Lovable AI Gateway (Gemini 2.5 Flash) with tool-calling for strict JSON.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

type Channel = "instagram" | "tiktok" | "linkedin" | "youtube";
type Tone = "default" | "hype" | "educational" | "story" | "bold" | "premium";

interface Body {
  videoId?: string;
  videoUrl?: string;
  channels: Channel[];
  briefingPlan?: Record<string, unknown> | null;
  briefingText?: string;
  tone?: Tone;
  language?: string; // "de" | "en" | "es"
}

const CHANNEL_RULES: Record<Channel, string> = {
  instagram:
    "Instagram caption: ≤2200 chars, hook line 1 (≤8 words, emoji ok), 1–2 paragraph story, soft CTA + question. 8–15 hashtags.",
  tiktok:
    "TikTok caption: ≤150 chars, brutally short, one sharp hook sentence, casual/lowercase ok. 3–5 trending hashtags.",
  linkedin:
    "LinkedIn caption: 200–800 chars, professional first-person, 1 insight + bullets + question CTA, max 1–2 emojis. 3–5 industry hashtags.",
  youtube:
    "YouTube: title ≤70 chars SEO-keywords-first; description ≤400 chars; 5–12 tags (no # prefix in tags, but caption can keep them).",
};

const TONE_HINTS: Record<Tone, string> = {
  default: "Natural, audience-aware tone matching the briefing.",
  hype: "High-energy, exclamatory, urgent, FOMO-driven.",
  educational: "Calm, expert, teaches a clear takeaway.",
  story: "Personal, narrative, micro-anecdote arc.",
  bold: "Provocative, contrarian, breaks consensus.",
  premium: "Refined, restrained, luxury-brand cadence.",
};

const LANG_NAME = (l?: string) =>
  l?.toLowerCase().startsWith("de") ? "German"
  : l?.toLowerCase().startsWith("es") ? "Spanish"
  : "English";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const isMock = req.headers.get("x-qa-mock") === "true";
    const body = (await req.json()) as Body;
    const channels = (body.channels || []).filter((c) =>
      ["instagram", "tiktok", "linkedin", "youtube"].includes(c),
    );
    if (channels.length === 0) {
      return new Response(JSON.stringify({ error: "channels required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tone: Tone = (body.tone ?? "default") as Tone;
    const language = body.language ?? "en";
    const languageName = LANG_NAME(language);

    // ── QA Mock ──
    if (isMock) {
      const drafts = buildMockDrafts(channels, languageName);
      return json({ drafts, mock: true });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Auth user (for storing drafts) ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseSrv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id ?? null;

    const briefingSummary = summarizeBriefing(body.briefingPlan, body.briefingText);

    const channelInstructions = channels
      .map((c) => `- ${c.toUpperCase()}: ${CHANNEL_RULES[c]}`)
      .join("\n");

    const system =
      `You are a senior social-media copywriter. Generate platform-optimised captions from one creative briefing.\n\n` +
      `LANGUAGE LOCK: Write ALL captions, hashtags, titles, and descriptions in ${languageName}. ` +
      `Do NOT translate brand names. Hashtags must also be in ${languageName} when meaningful.\n\n` +
      `TONE: ${TONE_HINTS[tone]}\n\n` +
      `CHANNEL RULES:\n${channelInstructions}\n\n` +
      `Score each caption with a hook_score 0–10 based on stopping-power of the first line.`;

    const userPrompt =
      `BRIEFING:\n${briefingSummary}\n\n` +
      (body.videoUrl ? `Video URL (context only): ${body.videoUrl}\n\n` : "") +
      `Generate one optimised draft for each of: ${channels.join(", ")}. ` +
      `Return ONLY via the provided tool.`;

    const tool = {
      type: "function",
      function: {
        name: "submit_cross_post_drafts",
        description: "Return per-channel optimised social captions.",
        parameters: {
          type: "object",
          properties: {
            drafts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  channel: { type: "string", enum: channels },
                  caption: { type: "string" },
                  hashtags: { type: "array", items: { type: "string" } },
                  title: { type: "string" },
                  description: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  hook_score: { type: "number" },
                },
                required: ["channel", "caption", "hashtags", "hook_score"],
                additionalProperties: false,
              },
            },
          },
          required: ["drafts"],
          additionalProperties: false,
        },
      },
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "submit_cross_post_drafts" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      const status = aiRes.status === 429 ? 429 : aiRes.status === 402 ? 402 : 500;
      return new Response(JSON.stringify({ error: "ai_gateway_error", detail: txt }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    const args = call ? JSON.parse(call.function.arguments) : null;
    const drafts: Array<Record<string, unknown>> = args?.drafts ?? [];

    // ── Persist drafts (best-effort) ──
    if (userId && drafts.length > 0) {
      const srv = createClient(supabaseUrl, supabaseSrv);
      const rows = drafts.map((d) => ({
        user_id: userId,
        video_id: body.videoId ?? null,
        video_url: body.videoUrl ?? null,
        channel: d.channel,
        caption: d.caption ?? null,
        hashtags: d.hashtags ?? [],
        title: d.title ?? null,
        description: d.description ?? null,
        tags: d.tags ?? [],
        hook_score: d.hook_score ?? null,
        tone,
        language,
        edited_by_user: false,
      }));
      // Upsert: one row per (user_id, video_id, channel). Without unique constraint we delete+insert.
      if (body.videoId) {
        await srv
          .from("cross_post_drafts")
          .delete()
          .eq("user_id", userId)
          .eq("video_id", body.videoId)
          .in("channel", channels);
      }
      await srv.from("cross_post_drafts").insert(rows);
    }

    return json({ drafts });
  } catch (e) {
    console.error("[cross-post-captions] error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function summarizeBriefing(plan: unknown, text?: string): string {
  if (text && text.trim().length > 0) return text.slice(0, 4000);
  if (plan && typeof plan === "object") {
    try {
      return JSON.stringify(plan).slice(0, 4000);
    } catch { /* noop */ }
  }
  return "(no briefing provided — use the video URL context to infer a generic promotional message)";
}

function buildMockDrafts(channels: Channel[], lang: string) {
  const sampleByLang = {
    German: {
      hook: "Stopp ❌ wenn du auch ständig vergisst zu posten…",
      story: "Wir haben es satt. Deshalb haben wir AdTool gebaut — dein Briefing → fertiges Video → automatisch auf alle Kanäle.",
    },
    English: {
      hook: "Stop ❌ scrolling if your posting schedule is a mess…",
      story: "AdTool turns a 60-second briefing into a finished video and ships it to every channel automatically.",
    },
    Spanish: {
      hook: "Para ❌ si publicar te quita más tiempo que crear…",
      story: "AdTool convierte un briefing de 60 segundos en un vídeo terminado y lo publica en todos tus canales.",
    },
  } as const;
  const s = sampleByLang[lang as keyof typeof sampleByLang] ?? sampleByLang.English;
  return channels.map((c) => ({
    channel: c,
    caption:
      c === "tiktok" ? `${s.hook} 👇`
      : c === "linkedin" ? `${s.story}\n\nWas hält dich heute vom posten ab?`
      : `${s.hook}\n\n${s.story}\n\n👉 14 Tage gratis testen.`,
    hashtags:
      c === "tiktok" ? ["fyp", "contentcreator", "aitools"]
      : c === "linkedin" ? ["contentmarketing", "ai", "productivity"]
      : c === "youtube" ? ["adtool", "ai video", "content creator", "tiktok", "instagram"]
      : ["contentcreator", "aitools", "marketingtips", "creatoreconomy", "adtool", "smallbusiness", "socialmedia", "videoeditor"],
    title: c === "youtube" ? "AI macht dein Video & postet überall (60 Sek Briefing)" : undefined,
    description: c === "youtube" ? s.story : undefined,
    tags: c === "youtube" ? ["adtool", "ai video", "content creator"] : undefined,
    hook_score: c === "tiktok" ? 9.1 : c === "linkedin" ? 7.4 : 8.6,
  }));
}
