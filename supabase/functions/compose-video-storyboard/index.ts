import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Briefing {
  mode: string;
  productName: string;
  productDescription: string;
  usps: string[];
  targetAudience: string;
  tone: string;
  duration: number;
  aspectRatio: string;
  brandColors: string[];
}

const CATEGORY_STRUCTURES: Record<string, string> = {
  "product-ad": `USP-DRIVEN PRODUCT AD — use the AIDA framework. Treat the briefing's "productName" as the product, "usps" as benefits, "targetAudience" as the buyer persona.
1. Hook (3-4s): Attention-grabbing visual that stops scrolling
2. Problem (4-6s): Show the pain point the audience faces
3. Solution (4-6s): Introduce the product as the answer
4. Demo (5-10s): Show the product in action with key features
5. Social Proof (4-6s): Testimonials, numbers, or trust signals
6. CTA (3-5s): Clear call-to-action with urgency`,

  "corporate-ad": `MISSION-DRIVEN CORPORATE FILM — trust-building, brand-led. Treat "productName" as the COMPANY name, "productDescription" as industry/mission, "usps" as core brand messages.
1. Hook (3-5s): Bold brand statement or vision
2. Problem (4-6s): Industry challenge or market need the company addresses
3. Solution (5-8s): Company's unique approach / mission in action
4. Demo (5-10s): Team, services or impact showcase
5. Social Proof (4-6s): Client logos, awards, metrics, longevity
6. CTA (3-5s): Brand tagline + next step (visit, contact, join)`,

  storytelling: `NARRATIVE STORYTELLING — 3-act emotional arc, NO ad copy. Treat "productName" as the STORY TITLE, "productDescription" as the logline/setting, "usps" as key beats/scenes, "targetAudience" as the protagonist + conflict (parsed from "Protagonist: X | Conflict: Y") combined with the target emotion. Build a real story with character, tension and emotional payoff. Avoid sales language entirely. 🚨 NO TEXT OVERLAYS AT ALL — the textOverlayText field MUST be an empty string "" for every single scene. Storytelling lebt rein von Bildsprache, Atmosphäre, Schauspiel und Schnitt — keine Schrift, keine Untertitel, keine Datums-/Ort-Inserts, keine Title-Cards, keine Lower-Thirds. Der Zuschauer soll den Film SEHEN, nicht LESEN.
ACT 1 — SETUP (≈25% of duration): Introduce protagonist and world. Establish tone and stakes.
ACT 2 — CONFRONTATION (≈50% of duration): Inciting incident → rising conflict → midpoint twist → crisis. Multiple scenes here.
ACT 3 — RESOLUTION (≈25% of duration): Climax → emotional payoff → final image that lingers.
Use sceneType values loosely — map "hook"=opening, "problem"=conflict beats, "solution"=turning point, "demo"=climax, "social-proof"=emotional payoff, "cta"=final image.`,

  custom: `FREE EDITOR MODE — follow the user's free description as literally as possible. Treat "productName" as the title, "productDescription" as the user's full creative brief (TOP PRIORITY — the storyboard must reflect it scene-by-scene), "usps" as optional style hints. Do NOT impose AIDA or any fixed framework. Generate scenes that mirror the user's description in order. Text overlays only if the brief implies them.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { briefing, category, language } = await req.json() as {
      briefing: Briefing;
      category: string;
      language: string;
    };

    if (!briefing?.productName) {
      return new Response(JSON.stringify({ error: "productName is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const structure = CATEGORY_STRUCTURES[category] || CATEGORY_STRUCTURES["custom"];
    const targetSceneCount = Math.max(4, Math.min(10, Math.round(briefing.duration / 8)));

    const langLabel = language === "de" ? "German" : language === "es" ? "Spanish" : "English";

    // Tone → visual styling translation (drives lighting/lens/look)
    const toneStyling: Record<string, string> = {
      professional: 'clean key light, neutral white-balance, 50mm lens, subtle dolly, restrained composition',
      energetic: 'handheld camera, neon practicals, rapid push-ins, high-contrast color, 24mm wide lens',
      emotional: 'soft window light, shallow depth of field, 85mm portrait lens, slow motion, golden hour warmth',
      funny: 'bright even light, playful primary colors, snap-zoom punch-ins, whip pans, 35mm lens',
      luxury: 'low-key chiaroscuro, marble & gold textures, slow orbit, 50mm anamorphic, deep blacks',
      minimal: 'single hard light source, monochrome palette, locked-off composition, 50mm lens, generous negative space',
      dramatic: 'top-down rim light, smoke, low angle, 35mm anamorphic with lens flares, slow dolly-in',
      friendly: 'soft daylight, pastel palette, eye-level composition, 35mm lens, gentle handheld breathing',
    };
    const toneLook = toneStyling[briefing.tone] || toneStyling.professional;

    // Per scene-type structural hints — PRODUCT-IN-SCENE, NOT PRODUCT-AS-SCENE
    const sceneTypeHints = `Scene-type visual templates (product MUST appear within a real-world human moment, not isolated):
- hook: emotional human moment that stops the scroll — a person in a relatable situation, product visible but in context (held in hand, in pocket, on the table next to them, on the desk while they work). NEVER an isolated product macro on a plain background.
- problem: medium shot of a frustrated/struggling person in their real environment · low-key light · cool tint · NO product yet (this is the pain scene)
- solution: reveal moment where the person discovers / picks up / uses the product for the first time — product ENTERS the scene through human action (hand reaching in, unboxing, switching it on). Product is NOT standing alone.
- demo: a real person actively USING the product in a real environment — show the result/benefit on their face and surroundings, not just the product spinning. ⚠️ If (and only if) the briefing truly demands a clean product beauty-shot, this is the ONE scene allowed to be an isolated hero — but prefer hands-in-frame even here.
- social-proof: real people in real settings reacting to / holding / wearing / talking about the product — testimonial or candid lifestyle framing · 85mm · soft natural light · shallow depth
- cta: wide hero shot of person + product together in their world (lifestyle final frame), brand color dominant in environment — NEVER product alone on background or gradient`;

    const systemPrompt = `You are a senior cinematographer + video ad director. You write professional, production-ready storyboards for short-form video ads. Your AI prompts must read like real cinematography directions, not generic descriptions.

Hard rules:
- Each scene 3-15 seconds; total ≈ ${briefing.duration}s; create ${targetSceneCount} scenes (±1)
- Text overlays in ${langLabel} (max 8 words, punchy)
- Transitions in English (enum)
${category === 'storytelling' ? '\n🚨 STORYTELLING MODE — TEXT OVERLAY BAN (ABSOLUTE): textOverlayText MUST be "" (empty string) for EVERY scene. textAnimation MUST be "none". No exceptions. No dates, no place names, no dialogue cards, no chapter titles. The story is told purely visually.\n' : ''}

🚨 NO BURNED-IN TEXT RULE (ABSOLUTE — overrides everything else):
The video clips are generated independently and we apply our OWN subtitles, captions and text overlays in a later editing step. Therefore the AI-generated footage MUST NEVER contain any readable text, captions, subtitles, watermarks, logos, signs with words, UI overlays, lower-thirds, typography or written language of any kind. Every aiPrompt MUST end with the exact negative clause defined in rule 10 below. Never quote on-screen text inside the prompt.

🚨 PRODUCT INTEGRATION RULES (HIGHEST PRIORITY — overrides anything else):
A. The SUBJECT of the MAJORITY of scenes must be a HUMAN or a LIFE SITUATION — NOT the product alone. The product appears WITHIN the scene, integrated into the action.
B. Maximum ratio: at most ONE out of every four scenes may be a pure isolated product hero-shot. All other scenes must show the product in use / in context / in a human's hands / in an environment.
C. Every aiPrompt MUST explicitly describe HOW the product is embedded in the scene (e.g. "in the hands of a jogging woman at sunrise", "on the kitchen counter next to a cooking family", "in the backpack of a hiker overlooking the valley", "on the desk while she takes a video call").
D. ANTI-PATTERNS — strictly avoid these phrasings unless writing the single allowed hero scene: "product floating", "product rotating on white", "product on pedestal", "isolated product shot", "product hero on gradient", "product spinning in empty space", "product on plain background".

AI prompt requirements (CRITICAL — every aiPrompt MUST contain ALL of these):
1. SUBJECT: a person or life situation (per Rule A) — concrete, with role/age/mood, in a specific environment. Product is mentioned as part of the scene, not as the subject itself.
2. ACTION: what the person is doing AND how they interact with the product
3. CAMERA: angle + movement (e.g. "low angle slow dolly-in", "overhead static", "handheld whip pan")
4. LENS: focal length or framing (e.g. "shot on 35mm anamorphic", "macro lens", "85mm portrait")
5. LIGHTING: direction + quality + color temp (e.g. "golden hour key from camera left, soft fill")
6. MOOD/STYLE: cinematic look (e.g. "shallow depth of field, filmic grain, muted Kodak Portra palette")
7. TONE-DRIVEN LOOK for "${briefing.tone}" → ${toneLook}
8. ENVIRONMENT: explicit real-world setting (kitchen, sidewalk, café, bedroom, gym, office, park...) — never "studio" or "white background" except for the single allowed hero scene
9. Length: minimum 50 words per aiPrompt — aim for 60-80
10. Always end aiPrompt with: ", no on-screen text, no captions, no subtitles, no watermarks, no logos, no isolated product on plain background, no floating product, no product rotating in empty space" (CRITICAL — prevents AI from burning text or generating isolated product shots)
11. Never include any quoted on-screen text in the aiPrompt itself

${sceneTypeHints}

🚨 CHARACTER CONSISTENCY CONSTRAINT (CRITICAL — technical limitation):
Each scene is generated INDEPENDENTLY by a separate AI video model call (Hailuo / Kling / Sora). There is NO character/face consistency between scenes — the model cannot remember a person from a previous scene. Therefore:
- NEVER reference "the same person", "she from before", "he again", "the woman from scene 1", "our protagonist returns"
- NEVER use pronouns or phrases that imply continuity across scenes ("she continues", "he then…", "later that day she…", "now smiling at the camera")
- Each scene MUST describe its human subject FRESH and SELF-CONTAINED — re-state age, gender, appearance, clothing, ethnicity hints, setting — as if the viewer has never seen them before
- If a recurring TYPE of person is desired (e.g. always a young professional woman), describe the ARCHETYPE generically in each scene (e.g. "a young professional woman in business casual, late 20s, warm smile") — but never claim it's the same individual
- Treat the storyboard as a MONTAGE / MOOD-BOARD of standalone shots that share a vibe, NOT as a continuous narrative with one persistent protagonist
- Variation between scenes' people is expected and fine — do not try to lock identity

Write text overlays separately (in ${langLabel}) — they're rendered as a distinct layer on top of the video.`;

    const labels = (() => {
      switch (category) {
        case "corporate-ad":
          return { name: "Company", desc: "Industry / Mission", list: "Core messages", audience: "Target audience" };
        case "storytelling":
          return { name: "Story title", desc: "Logline / Setting", list: "Key scenes / Beats", audience: "Protagonist & conflict (+ target emotion)" };
        case "custom":
          return { name: "Title", desc: "Creative brief (follow literally, scene-by-scene)", list: "Style hints", audience: "" };
        default:
          return { name: "Product", desc: "Description", list: "USPs", audience: "Target audience" };
      }
    })();

    const userPrompt = `Create a storyboard for a ${category} video.

${labels.name}: ${briefing.productName}
${labels.desc}: ${briefing.productDescription || "Not provided"}
${labels.list}: ${briefing.usps.length > 0 ? briefing.usps.join(", ") : "Not provided"}
${labels.audience ? `${labels.audience}: ${briefing.targetAudience || "Not provided"}\n` : ""}Tone: ${briefing.tone}
Duration: ${briefing.duration} seconds
Aspect Ratio: ${briefing.aspectRatio}

Structure to follow:
${structure}

🚨 INTEGRATION REQUIREMENT (non-negotiable): The product must appear *within* real-world scenes — used by people, in real environments, in lifestyle moments. The product is part of the story, not the story itself. Avoid isolated product shots entirely, except for AT MOST ONE hero scene if the briefing genuinely calls for a clean beauty-shot. Every other scene must feature a human or life situation with the product integrated naturally.

🚨 INDEPENDENCE REQUIREMENT (non-negotiable): Every scene is rendered by a SEPARATE AI generation with no memory of other scenes. Describe each human subject FROM SCRATCH in each scene — no "same person", no "she/he from before", no continuity pronouns. Treat each scene as a standalone shot in a montage. If you want a recurring type, describe the archetype generically in every scene rather than claiming identity continuity.

Generate the storyboard using the create_storyboard function.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_storyboard",
              description: "Create a structured video storyboard with scenes",
              parameters: {
                type: "object",
                properties: {
                  scenes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sceneType: {
                          type: "string",
                          enum: ["hook", "problem", "solution", "demo", "social-proof", "cta", "custom"],
                        },
                        durationSeconds: {
                          type: "number",
                          description: "Duration in seconds (3-15)",
                        },
                        aiPrompt: {
                          type: "string",
                          description: "Detailed English prompt for AI video generation. Describe camera angle, subject, motion, lighting, mood.",
                        },
                        stockKeywords: {
                          type: "string",
                          description: "Comma-separated English keywords for stock video search fallback",
                        },
                        textOverlayText: {
                          type: "string",
                          description: `Short overlay text in ${langLabel} (max 8 words). Empty string if no text needed.${category === 'storytelling' ? ' 🚨 For category="storytelling": MUST always be an empty string "". No exceptions.' : ''}`,
                        },
                        textPosition: {
                          type: "string",
                          enum: ["top", "center", "bottom", "bottom-left", "bottom-right"],
                        },
                        textAnimation: {
                          type: "string",
                          enum: ["none", "fade-in", "scale-bounce", "slide-left", "slide-right", "word-by-word", "glow-pulse"],
                        },
                        transitionType: {
                          type: "string",
                          enum: ["none", "fade", "crossfade", "wipe", "slide", "zoom"],
                        },
                      },
                      required: ["sceneType", "durationSeconds", "aiPrompt", "stockKeywords", "textOverlayText", "textPosition", "textAnimation", "transitionType"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["scenes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_storyboard" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI Gateway error:", response.status, errText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No structured output from AI");
    }

    let parsed: { scenes: any[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error("Failed to parse AI storyboard output");
    }

    // Map AI output to ComposerScene format
    const scenes = parsed.scenes.map((s: any, index: number) => ({
      id: `scene_${Date.now()}_${index}`,
      projectId: "",
      orderIndex: index,
      sceneType: s.sceneType || "custom",
      durationSeconds: Math.max(3, Math.min(15, s.durationSeconds || 5)),
      clipSource: "ai-hailuo",
      aiPrompt: s.aiPrompt || "",
      stockKeywords: s.stockKeywords || "",
      clipStatus: "pending",
      textOverlay: {
        text: s.textOverlayText || "",
        position: s.textPosition || "bottom",
        animation: s.textAnimation || "fade-in",
        fontSize: 48,
        color: "#FFFFFF",
      },
      transitionType: s.transitionType || "fade",
      transitionDuration: 0.5,
      retryCount: 0,
      costEuros: 1.2, // Default Hailuo cost
    }));

    return new Response(JSON.stringify({ scenes, sceneCount: scenes.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("compose-video-storyboard error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
