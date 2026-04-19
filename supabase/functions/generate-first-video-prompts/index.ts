// Generates 3 personalized first-video prompts for Hailuo 2.3 based on the
// user's onboarding profile. Caches the result in onboarding_profiles.first_video_prompts.
// Idempotent — skips generation if cache already exists, unless force=true.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PromptItem {
  prompt: string;
  prompt_en: string;
  style_hint: string;
}

const FALLBACK_PROMPTS: Record<string, PromptItem[]> = {
  de: [
    { prompt: "Cinematische Drohnenaufnahme über einer modernen Skyline bei Sonnenuntergang", prompt_en: "Cinematic drone shot over a modern skyline at sunset", style_hint: "cinematic" },
    { prompt: "Eleganter Produkt-Shot eines Parfüm-Flakons mit weichem Goldlicht", prompt_en: "Elegant product shot of a perfume bottle with soft gold light", style_hint: "product" },
    { prompt: "Eine entspannte Person auf einer Couch, die in die Kamera lächelt", prompt_en: "A relaxed person on a couch smiling at the camera", style_hint: "lifestyle" },
  ],
  en: [
    { prompt: "Cinematic drone shot over a modern skyline at sunset", prompt_en: "Cinematic drone shot over a modern skyline at sunset", style_hint: "cinematic" },
    { prompt: "Elegant product shot of a perfume bottle with soft gold light", prompt_en: "Elegant product shot of a perfume bottle with soft gold light", style_hint: "product" },
    { prompt: "A relaxed person on a couch smiling at the camera", prompt_en: "A relaxed person on a couch smiling at the camera", style_hint: "lifestyle" },
  ],
  es: [
    { prompt: "Toma cinematográfica con dron sobre una ciudad moderna al atardecer", prompt_en: "Cinematic drone shot over a modern skyline at sunset", style_hint: "cinematic" },
    { prompt: "Toma elegante de un frasco de perfume con luz dorada suave", prompt_en: "Elegant product shot of a perfume bottle with soft gold light", style_hint: "product" },
    { prompt: "Persona relajada en un sofá sonriendo a la cámara", prompt_en: "A relaxed person on a couch smiling at the camera", style_hint: "lifestyle" },
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    // Auth — extract user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const force: boolean = body?.force === true;
    const language: "de" | "en" | "es" =
      ["de", "en", "es"].includes(body?.language) ? body.language : "en";

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Load existing onboarding profile
    const { data: profile, error: profileErr } = await admin
      .from("onboarding_profiles")
      .select("niche, business_type, platforms, posting_goal, experience_level, first_video_prompts")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr) {
      console.error("[first-video-prompts] profile load error:", profileErr);
    }

    // Idempotency: skip if already cached
    if (!force && profile?.first_video_prompts && Array.isArray(profile.first_video_prompts) && profile.first_video_prompts.length > 0) {
      return json({ prompts: profile.first_video_prompts, cached: true });
    }

    // If we don't even have an onboarding profile, return localized defaults
    if (!profile) {
      return json({ prompts: FALLBACK_PROMPTS[language], cached: false, fallback: true });
    }

    // Build the prompt for Lovable AI
    const niche = profile.niche || "general content creation";
    const businessType = profile.business_type || "creator";
    const platforms = Array.isArray(profile.platforms) ? profile.platforms.join(", ") : "Instagram, TikTok";
    const postingGoal = profile.posting_goal || "grow_audience";
    const experienceLevel = profile.experience_level || "beginner";

    const langName = language === "de" ? "German" : language === "es" ? "Spanish" : "English";

    const systemPrompt = `You are an expert AI video coach for the Hailuo 2.3 model (6-second clips, realistic motion and characters).
Generate exactly 3 short, distinct video prompts (max 25 words each) tailored to the user's profile.
Each prompt MUST be realistic to render with Hailuo 2.3 (no impossible camera moves, no text overlays in scene).
Return BOTH a localized version in ${langName} (field "prompt") AND an English version (field "prompt_en") for the model.
Also include a "style_hint" tag from: cinematic, product, lifestyle, documentary, dynamic, minimal, dreamy.`;

    const userPrompt = `User profile:
- Niche: ${niche}
- Business type: ${businessType}
- Platforms: ${platforms}
- Posting goal: ${postingGoal}
- Experience level: ${experienceLevel}

Generate 3 personalized first-video prompts that fit this niche and goal. Vary them stylistically.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_video_prompts",
              description: "Return 3 personalized video prompts.",
              parameters: {
                type: "object",
                properties: {
                  prompts: {
                    type: "array",
                    minItems: 3,
                    maxItems: 3,
                    items: {
                      type: "object",
                      properties: {
                        prompt: { type: "string", description: `Prompt in ${langName}, max 25 words.` },
                        prompt_en: { type: "string", description: "Same prompt in English for the model." },
                        style_hint: {
                          type: "string",
                          enum: ["cinematic", "product", "lifestyle", "documentary", "dynamic", "minimal", "dreamy"],
                        },
                      },
                      required: ["prompt", "prompt_en", "style_hint"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["prompts"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_video_prompts" } },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("[first-video-prompts] AI gateway error:", aiRes.status, text);
      if (aiRes.status === 429) return json({ error: "Rate limited", prompts: FALLBACK_PROMPTS[language], fallback: true }, 429);
      if (aiRes.status === 402) return json({ error: "Credits exhausted", prompts: FALLBACK_PROMPTS[language], fallback: true }, 402);
      return json({ error: "AI gateway error", prompts: FALLBACK_PROMPTS[language], fallback: true }, 200);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let prompts: PromptItem[] | null = null;
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        if (Array.isArray(args?.prompts) && args.prompts.length === 3) {
          prompts = args.prompts.map((p: any) => ({
            prompt: String(p.prompt || "").slice(0, 300),
            prompt_en: String(p.prompt_en || "").slice(0, 300),
            style_hint: String(p.style_hint || "cinematic"),
          }));
        }
      } catch (e) {
        console.error("[first-video-prompts] parse error:", e);
      }
    }

    if (!prompts || prompts.length !== 3) {
      console.warn("[first-video-prompts] AI returned no valid prompts, using fallback");
      prompts = FALLBACK_PROMPTS[language];
    }

    // Cache result
    const { error: updateErr } = await admin
      .from("onboarding_profiles")
      .update({ first_video_prompts: prompts })
      .eq("user_id", userId);

    if (updateErr) {
      console.error("[first-video-prompts] cache write error:", updateErr);
    }

    return json({ prompts, cached: false });
  } catch (e) {
    console.error("[first-video-prompts] uncaught:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
