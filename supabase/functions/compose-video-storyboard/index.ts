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

  storytelling: `NARRATIVE STORYTELLING — 3-act emotional arc, NO ad copy. Treat "productName" as the STORY TITLE, "productDescription" as the logline/setting, "usps" as key beats/scenes, "targetAudience" as the protagonist + conflict (parsed from "Protagonist: X | Conflict: Y") combined with the target emotion. Build a real story with character, tension and emotional payoff. Avoid sales language entirely. Text overlays should be poetic/cinematic (a single line of dialogue, a date, a place, a feeling) — never marketing copy.
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

    const systemPrompt = `You are a professional video ad storyboard director. You create structured scene-by-scene storyboards for short-form video ads.

Rules:
- Each scene must be 3-15 seconds
- Total duration must be approximately ${briefing.duration} seconds
- Create ${targetSceneCount} scenes (±1)
- Write all AI video prompts in English (they're for AI video generation)
- Write text overlays in ${langLabel}
- Each scene needs a clear, detailed AI generation prompt describing the visual
- Include stock search keywords as fallback for each scene
- Text overlays should be short, punchy ad copy (max 8 words)`;

    const userPrompt = `Create a storyboard for a ${category} video ad.

Product: ${briefing.productName}
Description: ${briefing.productDescription || "Not provided"}
USPs: ${briefing.usps.length > 0 ? briefing.usps.join(", ") : "Not provided"}
Target Audience: ${briefing.targetAudience || "General audience"}
Tone: ${briefing.tone}
Duration: ${briefing.duration} seconds
Aspect Ratio: ${briefing.aspectRatio}

Structure to follow:
${structure}

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
                          description: `Short overlay text in ${langLabel} (max 8 words). Empty string if no text needed.`,
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
