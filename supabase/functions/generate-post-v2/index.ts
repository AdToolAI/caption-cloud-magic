import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      workspaceId,
      brief,
      mediaUrl,
      mediaType = 'image',
      platforms = ["instagram"],
      languages = ["de"],
      stylePreset = "clean",
      toneOverride,
      brandKitId,
      ctaInput,
      options = {},
    } = await req.json();

    console.log("[generate-post-v2] Input:", { brief, platforms, languages, stylePreset, brandKitId });

    // JWT Token manuell dekodieren und validieren
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Keine Authentifizierung gefunden");
    }

    const token = authHeader.replace("Bearer ", "");
    
    // JWT dekodieren (ohne externe Library)
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      
      const userId = payload.sub;
      if (!userId) {
        throw new Error("Ungültiges Token: keine User ID");
      }
      
      console.log("[generate-post-v2] Authenticated user:", userId);

      // Supabase Client mit Service Role Key (für DB-Operationen)
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // 1. Brand-Kit laden
      let brandData: any = null;
      if (brandKitId) {
        const { data } = await supabaseClient
          .from("brand_kits")
          .select("*")
          .eq("id", brandKitId)
          .eq("user_id", userId) // Sicherheit: Nur User's eigene Brand Kits
          .single();
        brandData = data;
      }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY nicht konfiguriert");

    // 2. System-Prompt mit Brand-Regeln
    let systemPrompt = `Du bist ein Experte für Social Media Content. Erstelle hochwertige Posts.`;
    
    if (brandData) {
      const brandTone = brandData.brand_tone || "professionell";
      const brandVoice = brandData.brand_voice || {};
      const alwaysWords = brandData.keywords || [];
      const neverWords = brandData.brand_emotions?.filter((e: any) => e.avoid) || [];
      
      systemPrompt += `\n\nBRAND-REGELN:
- Tonfall: ${toneOverride || brandTone}
- Emojis: ${brandVoice.emojiUse || "moderat verwenden"}
- Immer verwenden: ${alwaysWords.join(", ")}
- Niemals verwenden: ${neverWords.join(", ")}
- Brand-Treue: ${options.brandFidelity || 80}%`;
    }

    systemPrompt += `\n\nPLATTFORM-LIMITS:
- Instagram: max 30 Hashtags, 2200 Zeichen
- Facebook: flexibel, ~5 Hashtags empfohlen
- LinkedIn: 3-5 Hashtags, professioneller Ton

AUSGABE (JSON):
{
  "hooks": {
    "A": "Neugier-Hook (Frage oder Kontrast, ≤80 Zeichen)",
    "B": "Nutzen-Hook (klare Aussage, ≤80 Zeichen)",
    "C": "Zahlen-Hook (mit Zahl/Statistik, ≤80 Zeichen)"
  },
  "caption": "Hauptcaption (authentisch, Mehrwert, Emojis)",
  "captionB": "${options.abVariant ? "Zweite Variante für A/B-Test" : ""}",
  "hashtags": {
    "reach": ["populäre Tags + 1-2 Brand"],
    "niche": ["thematisch eng + 1 Brand"],
    "brand": ["Brand + Produkt/Serie + Community"]
  },
  "altText": "${options.altText ? "Barrierefreie Bildbeschreibung" : ""}",
  "scores": {
    "hook": 85,
    "hookTip": "Konkreter Verbesserungsvorschlag",
    "cta": 78,
    "ctaTip": "Konkreter Verbesserungsvorschlag"
  },
  "warnings": ["Eventuell Trigger-Wörter oder Claims"]
}`;

    // 3. User-Prompt
    let userPrompt = `Brief: ${brief}\n\nPlattformen: ${platforms.join(", ")}\nSprachen: ${languages.join(", ")}\nStil: ${stylePreset}`;
    
    if (ctaInput) {
      userPrompt += `\nCTA: ${ctaInput}`;
    }

    if (mediaUrl) {
      if (mediaType === 'video') {
        userPrompt += `\nVideo URL: ${mediaUrl}\n(Video-Analyse wird nicht durchgeführt, bitte generiere Inhalte basierend auf dem Brief)`;
      } else {
        userPrompt += `\nBild URL: ${mediaUrl}`;
      }
    }

    if (options.localize && languages.length > 1) {
      userPrompt += `\n\nErstelle für jede Sprache eine angepasste Version mit lokalen Schreibweisen und Währungen.`;
    }

    // 3.5. UTM-Link-Generierung
    let utmLink = null;
    let utmData = null;
    if (options.utm && ctaInput) {
      const urlMatch = ctaInput.match(/https?:\/\/[^\s]+/);
      const baseUrl = urlMatch ? urlMatch[0] : "https://example.com";
      const campaign = brief.substring(0, 30).replace(/\s+/g, '_').toLowerCase();
      const source = platforms[0] || 'social';
      
      utmLink = `${baseUrl}?utm_source=${source}&utm_medium=social&utm_campaign=${campaign}`;
      utmData = {
        source,
        medium: 'social',
        campaign,
        url: utmLink
      };
      
      userPrompt += `\n\nUTM-Link für Tracking: ${utmLink}`;
    }

    console.log("[generate-post-v2] Calling Lovable AI...");

    // 4. AI-Call mit Tool Calling für strukturierte Ausgabe
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_post",
            description: "Generiere Social Media Post mit Hooks, Caption und Hashtags",
            parameters: {
              type: "object",
              properties: {
                hooks: {
                  type: "object",
                  properties: {
                    A: { type: "string" },
                    B: { type: "string" },
                    C: { type: "string" },
                  },
                  required: ["A", "B", "C"],
                },
                caption: { type: "string" },
                captionB: { type: "string" },
                hashtags: {
                  type: "object",
                  properties: {
                    reach: { type: "array", items: { type: "string" } },
                    niche: { type: "array", items: { type: "string" } },
                    brand: { type: "array", items: { type: "string" } },
                  },
                  required: ["reach", "niche", "brand"],
                },
                altText: { type: "string" },
                scores: {
                  type: "object",
                  properties: {
                    hook: { type: "number" },
                    hookTip: { type: "string" },
                    cta: { type: "number" },
                    ctaTip: { type: "string" },
                  },
                },
                warnings: { type: "array", items: { type: "string" } },
              },
              required: ["hooks", "caption", "hashtags", "scores"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_post" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[generate-post-v2] AI Error:", aiResponse.status, errorText);
      throw new Error(`AI API Fehler: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("[generate-post-v2] AI Response received");

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("Keine Tool-Antwort von AI erhalten");
    }

    const result = JSON.parse(toolCall.function.arguments);

    // 4.5. Multi-Language Generation
    let multiLangResults: Record<string, any> = {};
    if (languages.length > 1) {
      console.log('[generate-post-v2] Generating multi-language outputs for:', languages);
      
      // First language is already generated
      multiLangResults[languages[0]] = {
        hooks: result.hooks,
        caption: result.caption,
        caption_b: result.captionB,
        hashtags: result.hashtags,
        alt_text: result.altText,
        scores: result.scores
      };

      // Generate for additional languages
      for (let i = 1; i < languages.length; i++) {
        const lang = languages[i];
        const langPrompt = `${userPrompt}\n\nWICHTIG: Generiere ALLE Inhalte in ${lang.toUpperCase()} Sprache. Passe Währungssymbole (€/$£), Redewendungen und kulturelle Referenzen entsprechend an.`;
        
        try {
          const langAiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: langPrompt },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "generate_post",
                  description: "Generiere Social Media Post mit Hooks, Caption und Hashtags",
                  parameters: {
                    type: "object",
                    properties: {
                      hooks: {
                        type: "object",
                        properties: {
                          A: { type: "string" },
                          B: { type: "string" },
                          C: { type: "string" },
                        },
                        required: ["A", "B", "C"],
                      },
                      caption: { type: "string" },
                      captionB: { type: "string" },
                      hashtags: {
                        type: "object",
                        properties: {
                          reach: { type: "array", items: { type: "string" } },
                          niche: { type: "array", items: { type: "string" } },
                          brand: { type: "array", items: { type: "string" } },
                        },
                        required: ["reach", "niche", "brand"],
                      },
                      altText: { type: "string" },
                      scores: {
                        type: "object",
                        properties: {
                          hook: { type: "number" },
                          hookTip: { type: "string" },
                          cta: { type: "number" },
                          ctaTip: { type: "string" },
                        },
                      },
                      warnings: { type: "array", items: { type: "string" } },
                    },
                    required: ["hooks", "caption", "hashtags", "scores"],
                  },
                },
              }],
              tool_choice: { type: "function", function: { name: "generate_post" } },
            }),
          });

          if (langAiResponse.ok) {
            const langAiData = await langAiResponse.json();
            const langToolCall = langAiData.choices?.[0]?.message?.tool_calls?.[0];
            if (langToolCall) {
              const langResult = JSON.parse(langToolCall.function.arguments);
              multiLangResults[lang] = {
                hooks: langResult.hooks,
                caption: langResult.caption,
                caption_b: langResult.captionB,
                hashtags: langResult.hashtags,
                alt_text: langResult.altText,
                scores: langResult.scores
              };
            }
          } else {
            console.error(`[generate-post-v2] Language ${lang} generation failed:`, langAiResponse.statusText);
          }
        } catch (langError) {
          console.error(`[generate-post-v2] Error generating ${lang}:`, langError);
        }
      }
    }

    // Prepare ai_output_json with multi-language support
    const aiOutputJson = {
      ...result,
      languages: Object.keys(multiLangResults).length > 0 ? multiLangResults : undefined
    };

      // 5. Draft speichern
      const { data: draft, error: draftError } = await supabaseClient
        .from("post_drafts")
        .insert({
          user_id: userId,
        brand_kit_id: brandKitId,
        brief,
        media_url: mediaUrl,
        media_type: mediaType,
        platforms,
        languages,
        style_preset: stylePreset,
        tone_override: toneOverride,
        cta_input: ctaInput,
        options,
        hooks: result.hooks,
        caption: result.caption,
        caption_b: result.captionB || null,
        hashtags: result.hashtags,
        alt_text: result.altText || null,
        scores: result.scores,
        compliance: { warnings: result.warnings || [] },
        ai_output_json: aiOutputJson,
        utm: utmData,
        utm_link: utmLink,
      })
      .select()
      .single();

    if (draftError) {
      console.error("[generate-post-v2] Draft save error:", draftError);
      throw draftError;
    }

    console.log("[generate-post-v2] Draft saved:", draft.id);

    // Save to content_items for Planner/Media Library
    if (workspaceId) {
      const contentItemData = {
        workspace_id: workspaceId,
        type: mediaType as 'image' | 'video',
        title: result.hooks?.A || brief.substring(0, 100),
        caption: result.caption,
        media_id: draft.id,
        thumb_url: mediaUrl,
        targets: platforms,
        tags: [],
        source: 'ai_generator',
        source_id: draft.id,
      };

      const { error: contentError } = await supabaseClient
        .from("content_items")
        .insert(contentItemData);

      if (contentError) {
        console.warn("[generate-post-v2] Content item creation warning:", contentError);
        // Not critical - draft still exists
      } else {
        console.log("[generate-post-v2] Content item created for planner");
      }
    }

      return new Response(
        JSON.stringify({
          success: true,
          draft,
          result,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (jwtError: any) {
      console.error("[generate-post-v2] JWT decode error:", jwtError);
      return new Response(
        JSON.stringify({ error: "Token-Validierung fehlgeschlagen" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error: any) {
    console.error("[generate-post-v2] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
