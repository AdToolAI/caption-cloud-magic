import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UniversalScriptRequest {
  category: string;
  consultationResult: any;
  duration: number;
}

// Category-specific script structures
const SCRIPT_STRUCTURES: Record<string, { acts: string[]; description: string }> = {
  werbevideo: {
    acts: ['hook', 'problem', 'solution', 'proof', 'cta'],
    description: 'Klassischer Werbespot: Aufmerksamkeit → Problem → Lösung → Beweis → Call-to-Action'
  },
  erklaervideo: {
    acts: ['hook', 'problem', 'solution', 'feature', 'cta'],
    description: '5-Akt Erklärvideo: Einleitung → Problem → Lösung → Features → CTA'
  },
  storytelling: {
    acts: ['intro', 'conflict', 'turning_point', 'resolution', 'moral'],
    description: 'Narrative Story: Einleitung → Konflikt → Wendepunkt → Auflösung → Moral'
  },
  'social-media': {
    acts: ['hook', 'content', 'cta'],
    description: 'Social Media Kurzformat: Starker Hook → Content → Call-to-Action'
  },
  tutorial: {
    acts: ['intro', 'overview', 'steps', 'tips', 'summary'],
    description: 'Tutorial: Einleitung → Übersicht → Schritte → Pro-Tipps → Zusammenfassung'
  },
  testimonial: {
    acts: ['intro', 'problem_before', 'discovery', 'transformation', 'recommendation'],
    description: 'Testimonial: Vorstellung → Problem → Entdeckung → Transformation → Empfehlung'
  },
  produktvideo: {
    acts: ['reveal', 'features', 'benefits', 'demo', 'offer'],
    description: 'Produktvorstellung: Reveal → Features → Vorteile → Demo → Angebot'
  },
  imagevideo: {
    acts: ['atmosphere', 'values', 'vision', 'team', 'invitation'],
    description: 'Imagefilm: Atmosphäre → Werte → Vision → Team → Einladung'
  },
  recruiting: {
    acts: ['hook', 'culture', 'opportunity', 'benefits', 'apply'],
    description: 'Recruiting: Hook → Unternehmenskultur → Chancen → Benefits → Bewerbung'
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category, consultationResult, duration } = await req.json() as UniversalScriptRequest;
    
    if (!category || !consultationResult) {
      throw new Error('Category and consultation result are required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const structure = SCRIPT_STRUCTURES[category] || SCRIPT_STRUCTURES.werbevideo;
    const targetDuration = duration || 60;
    const sceneDuration = Math.floor(targetDuration / structure.acts.length);

    // Extract key data from consultation
    const {
      targetAudience = 'Allgemeine Zielgruppe',
      visualStyle = 'modern',
      tone = 'professional',
      ctaText = 'Jetzt starten',
      productName = 'das Produkt',
      coreProblem = '',
      keyBenefits = [],
      emotionalHook = '',
      categorySpecificData = {}
    } = consultationResult;

    const systemPrompt = `Du bist ein professioneller Drehbuchautor für ${category}-Videos.
Du erstellst strukturierte, emotionale und überzeugende Drehbücher.

========== VIDEO-KATEGORIE: ${category.toUpperCase()} ==========
Struktur: ${structure.description}
Akte: ${structure.acts.join(' → ')}

========== KRITISCHE REGELN ==========
- Produktname: "${productName}" - IMMER verwenden, NIEMALS Platzhalter!
- Zielgruppe: ${targetAudience}
- Ton: ${tone}
- Visueller Stil: ${visualStyle}
- Gesamtdauer: ${targetDuration} Sekunden (~${sceneDuration}s pro Szene)

${coreProblem ? `Hauptproblem: ${coreProblem}` : ''}
${emotionalHook ? `Emotionaler Hook: ${emotionalHook}` : ''}
${keyBenefits?.length ? `Hauptvorteile: ${keyBenefits.join(', ')}` : ''}
${ctaText ? `CTA: "${ctaText}"` : ''}

========== VERBOTEN IM VOICEOVER ==========
❌ "Also ich habe" - ABSOLUT VERBOTEN
❌ "Ich habe" am Satzanfang
❌ Füllwörter (quasi, sozusagen, eigentlich)
❌ Erste Person ("ich", "mein")

✅ Direkter, professioneller Sprecherton
✅ Klarer Bezug zum Produkt "${productName}"
✅ Power-Wörter: revolutionär, spielend, automatisch, mühelos

========== VISUAL DESCRIPTION REGELN ==========
- Flache 2D-Vektor-Illustrationen
- Geometrische Formen, abstrakte Icons
- KEINE detaillierten Gesichter
- Business-Metaphern, Diagramme, Infografiken

Für jede Szene liefere:
- id: Szenen-ID
- act: Akt-Nummer
- actType: Typ aus ${JSON.stringify(structure.acts)}
- title: Kurzer Szenentitel
- voiceover: Professioneller Sprechertext
- visualDescription: 2D-Vektor-Illustration Beschreibung
- duration: Dauer in Sekunden
- mood: Stimmung (curious, hopeful, confident, excited, relieved, inspired)
- keyElements: 3-5 visuelle Schlüsselelemente
- transitionType: (morph, wipe, zoom, dissolve, fade)`;

    const userPrompt = `Erstelle ein professionelles ${category}-Drehbuch für:

Produkt/Service: ${productName}
${consultationResult.productDescription || consultationResult.briefingText || ''}

Generiere genau ${structure.acts.length} Szenen. Antworte NUR mit einem validen JSON-Objekt.`;

    console.log(`[generate-universal-script] Generating ${category} script with ${structure.acts.length} acts`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'create_universal_script',
              description: `Creates a structured ${category} video script`,
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Video title' },
                  summary: { type: 'string', description: 'Brief summary (1-2 sentences)' },
                  category: { type: 'string', description: 'Video category' },
                  scenes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        act: { type: 'number' },
                        actType: { type: 'string' },
                        title: { type: 'string' },
                        voiceover: { type: 'string' },
                        visualDescription: { type: 'string' },
                        duration: { type: 'number' },
                        mood: { type: 'string', enum: ['curious', 'frustrated', 'hopeful', 'confident', 'excited', 'relieved', 'inspired'] },
                        keyElements: { type: 'array', items: { type: 'string' } },
                        transitionType: { type: 'string', enum: ['morph', 'wipe', 'zoom', 'dissolve', 'fade'] }
                      },
                      required: ['id', 'act', 'actType', 'title', 'voiceover', 'visualDescription', 'duration', 'mood', 'keyElements', 'transitionType']
                    }
                  },
                  totalDuration: { type: 'number' }
                },
                required: ['title', 'summary', 'category', 'scenes', 'totalDuration']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'create_universal_script' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-universal-script] AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add more credits.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI generation failed: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.error('[generate-universal-script] No tool call in response');
      throw new Error('Invalid AI response format');
    }

    const script = JSON.parse(toolCall.function.arguments);
    
    // Add timing calculations
    let currentTime = 0;
    script.scenes = script.scenes.map((scene: any, index: number) => {
      const sceneDurationCalc = scene.duration || sceneDuration;
      const startTime = currentTime;
      const endTime = currentTime + sceneDurationCalc;
      currentTime = endTime;
      
      return {
        ...scene,
        id: scene.id || `scene-${index + 1}`,
        act: scene.act || index + 1,
        startTime,
        endTime,
        durationSeconds: sceneDurationCalc
      };
    });

    console.log(`[generate-universal-script] Script generated: "${script.title}" with ${script.scenes?.length} scenes`);

    return new Response(
      JSON.stringify({ script }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[generate-universal-script] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
