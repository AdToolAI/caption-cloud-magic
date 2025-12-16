import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExplainerBriefing {
  productDescription: string;
  targetAudience: string;
  style: string;
  tone: string;
  duration: string;
  language: string;
  productName?: string;
  // ✅ NEW: 15-Phase Interview Consultation Data
  coreProblem?: string;
  emotionalHook?: string;
  statsAndNumbers?: string[];
  brandColors?: { primary: string; secondary: string; accent: string };
  ctaText?: string;
  ctaUrl?: string;
  introHookSentence?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { briefing } = await req.json() as { briefing: ExplainerBriefing };
    
    if (!briefing?.productDescription) {
      throw new Error('Product description is required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Calculate target duration in seconds
    const durationMap: Record<string, number> = {
      '30': 30,
      '60': 60,
      '90': 90,
      '120': 120,
    };
    const targetDuration = durationMap[briefing.duration] || 60;
    const sceneDuration = Math.floor(targetDuration / 5); // 5 scenes

    // ✅ Extract product name for use in script
    const productName = briefing.productName || 
                        briefing.productDescription?.split(/[\s,.:;!?]+/).slice(0, 3).join(' ') || 
                        'das Produkt';

    // ✅ PHASE 1: Use 15-Phase Interview Data
    const coreProblem = briefing.coreProblem || 'ein häufiges Problem';
    const emotionalHook = briefing.emotionalHook || 'neugierig und interessiert';
    const statsAndNumbers = briefing.statsAndNumbers?.length ? briefing.statsAndNumbers.join(', ') : '';
    const ctaText = briefing.ctaText || 'Jetzt starten';
    const ctaUrl = briefing.ctaUrl || '';
    const introHookSentence = briefing.introHookSentence || '';
    const brandColors = briefing.brandColors || { primary: '#F5C76A', secondary: '#0f172a', accent: '#22d3ee' };

    const systemPrompt = `Du bist ein professioneller Drehbuchautor für Erklärvideos im Stil von Loft-Film und Kurzgesagt.
Du erstellst strukturierte, emotionale und überzeugende Drehbücher im 5-Akt-Format.

========== KRITISCH: PRODUKTNAME ==========
Der Produktname ist: "${productName}"
Verwende diesen Namen EXAKT in allen Szenen. 
NIEMALS "[Dein Produktname]", "[Produktname]" oder andere Platzhalter verwenden!
Schreibe immer den echten Namen: "${productName}"

========== KRITISCH: 15-PHASEN INTERVIEW DATEN NUTZEN ==========
${introHookSentence ? `📢 INTRO HOOK SATZ (ERSTEN SATZ DES VOICEOVERS EXAKT SO STARTEN):
"${introHookSentence}"` : ''}

${coreProblem ? `❌ DAS EINE HAUPTPROBLEM (in Problem-Szene verwenden):
"${coreProblem}"` : ''}

${emotionalHook ? `💝 EMOTIONALE ANSPRACHE (diese Emotion erzeugen):
"${emotionalHook}"` : ''}

${statsAndNumbers ? `📊 STATISTIKEN/ZAHLEN (in Proof-Szene einbauen als animierte Overlay-Texte):
${statsAndNumbers}` : ''}

${ctaText ? `🚀 EXAKTER CTA-TEXT (in CTA-Szene WÖRTLICH verwenden):
"${ctaText}"${ctaUrl ? ` - Link: ${ctaUrl}` : ''}` : ''}

🎨 MARKENFARBEN für Konsistenz:
- Primär: ${brandColors.primary}
- Sekundär: ${brandColors.secondary}
- Akzent: ${brandColors.accent}

========== KRITISCH: VERBOTENE PHRASEN IM VOICEOVER (ABSOLUT VERBOTEN!) ==========
❌ NIEMALS "Also ich habe" - STRENGSTENS VERBOTEN!
❌ NIEMALS "Ich habe" am Satzanfang
❌ NIEMALS "Also..." als Satzanfang
❌ NIEMALS in der ersten Person ("ich", "mein", "mir") sprechen
❌ NIEMALS generische Füllwörter (quasi, sozusagen, eigentlich, grundsätzlich, irgendwie)
❌ NIEMALS Fragen an sich selbst ("Was mache ich jetzt?", "Kennst du das?")
❌ NIEMALS leere Phrasen ("Das Ding ist...", "Es ist halt so...")
❌ NIEMALS rhetorische Fragen ohne Bezug zum Produkt

✅ IMMER direkt zum Produkt/Thema/Problem sprechen
✅ IMMER professionellen Sprecher-Ton verwenden (wie Dokumentarfilm/Kurzgesagt)
✅ IMMER klaren Bezug zum Produkt "${productName}" haben
✅ Jeder Satz muss KONKRETEN inhaltlichen Mehrwert bieten
✅ Sprich die Zielgruppe DIREKT an ("Du kennst das Problem...", "Mit ${productName} kannst du...")
✅ Verwende POWER-WÖRTER: revolutionär, spielend, automatisch, sofort, mühelos

WICHTIGE REGELN:
- Schreibe im "${briefing.tone}" Ton
- Zielgruppe: ${briefing.targetAudience}
- Sprache: ${briefing.language === 'de' ? 'Deutsch' : briefing.language === 'en' ? 'Englisch' : briefing.language}
- Gesamtdauer: ${targetDuration} Sekunden (ca. ${sceneDuration} Sekunden pro Szene)
- Visueller Stil: ${briefing.style}

STRUKTUR (Loft-Film Methode) - NUTZE DIE INTERVIEW-DATEN!:
1. HOOK (Akt 1): ${introHookSentence ? `BEGINNE MIT: "${introHookSentence}"` : 'Emotionaler Einstieg, der sofort Aufmerksamkeit erregt'}
2. PROBLEM (Akt 2): ${coreProblem ? `DAS EINE HAUPTPROBLEM: "${coreProblem}"` : 'Das Problem der Zielgruppe klar und relatable darstellen'}
3. LÖSUNG (Akt 3): ${productName} als Lösung präsentieren
4. BEWEIS (Akt 4): ${statsAndNumbers ? `STATISTIKEN EINBAUEN: ${statsAndNumbers}` : 'Konkrete Features, Vorteile oder Social Proof'}
5. CTA (Akt 5): ${ctaText ? `EXAKTER CTA: "${ctaText}"` : 'Klarer Call-to-Action mit Dringlichkeit'}

========== TRANSITION-TYPEN FÜR PROFESSIONELLE ÜBERGÄNGE ==========
Weise jeder Szene einen transitionType zu:
- "morph" = Weiche Überblendung mit Formwandlung (hook → problem)
- "wipe" = Horizontaler Wipe-Effekt (feature → proof)
- "zoom" = Zoom-In auf nächste Szene (problem → solution)
- "dissolve" = Eleganter Auflöse-Effekt (proof → cta)
- "fade" = Standard Fade (default)

========== SOUND EFFECTS FÜR SZENEN ==========
Weise jeder Szene einen soundEffectType zu:
- "whoosh" = Übergangs-Sound
- "pop" = Icon/Element erscheint
- "success" = Erfolgs-Sound (solution, cta)
- "alert" = Aufmerksamkeits-Sound (hook, problem)
- "none" = Kein Sound

========== VERBOTEN in visualDescription ==========
❌ KEINE Preise, Währungen, falsche Zahlen, oder Phantasie-Text
❌ KEINE Tabellen, Listen, Aufzählungen oder Preisvergleiche
❌ KEINE Phantasie-Sprachen oder unleserliche Zeichen (Lorem Ipsum, Gibberish)
❌ KEINE Natur-Szenen (Bäume, Wälder, Sonnenuntergänge) für Business-Produkte

========== ERLAUBT in visualDescription ==========
✅ Produktnamen wie "${productName} Logo" oder "SaaS Dashboard"
✅ Einfache Labels wie "Schritt 1", "Vorher/Nachher"
✅ Call-to-Actions wie "${ctaText}" Button
✅ Kurze Schlagworte die zum Kontext passen
${statsAndNumbers ? `✅ Die Statistiken als große animierte Zahlen: ${statsAndNumbers}` : ''}

========== KRITISCH FÜR visualDescription ==========
- Beschreibe flache 2D-Vektor-Illustrationen wie Kurzgesagt/Loft-Film
- Verwende geometrische Formen, abstrakte Icons und Symbole
- KEINE detaillierten Gesichter - nur einfache stilisierte Figuren
- Fokus auf: Business-Metaphern, Diagramme, Infografiken, abstrakte Konzepte
- Immer DIREKT relevant zum Business-Thema
- KORREKTER kontextueller Text ist ERLAUBT (Produktnamen, CTAs, Labels)
- Nutze die MARKENFARBEN: ${brandColors.primary}, ${brandColors.secondary}, ${brandColors.accent}

Für jede Szene liefere:
- title: Kurzer Szenentitel
- voiceover: Sprechertext (natürlich, nicht zu werblich)
- visualDescription: EINFACHE Beschreibung für 2D-Vektor-Illustration mit MARKENFARBEN
- duration: Dauer in Sekunden
- mood: Stimmung der Szene
- keyElements: Array mit 3-5 visuellen Schlüsselelementen
- transitionType: Art des Übergangs zur nächsten Szene (morph, wipe, zoom, dissolve, fade)
- soundEffectType: Sound-Effekt für diese Szene (whoosh, pop, success, alert, none)
${statsAndNumbers ? `- statsOverlay: Falls Statistiken in dieser Szene, Array mit den Zahlen die animiert eingeblendet werden sollen` : ''}`;

    const userPrompt = `Erstelle ein professionelles Erklärvideo-Drehbuch für folgendes Produkt/Service:

${briefing.productDescription}

Generiere genau 5 Szenen im Loft-Film Stil. Antworte NUR mit einem validen JSON-Objekt.`;

    console.log('Generating explainer script with Lovable AI...');

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
              name: 'create_explainer_script',
              description: 'Creates a structured 5-act explainer video script with professional transitions and sound effects',
              parameters: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Title of the explainer video'
                  },
                  summary: {
                    type: 'string',
                    description: 'Brief summary of the video concept (1-2 sentences)'
                  },
                  scenes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        act: { type: 'number', description: 'Act number 1-5' },
                        title: { type: 'string' },
                        voiceover: { type: 'string', description: 'Natural voiceover text for this scene' },
                        visualDescription: { type: 'string', description: 'Detailed description of visual elements with brand colors' },
                        duration: { type: 'number', description: 'Duration in seconds' },
                        mood: { type: 'string', enum: ['curious', 'frustrated', 'hopeful', 'confident', 'excited', 'relieved', 'inspired'] },
                        keyElements: {
                          type: 'array',
                          items: { type: 'string' },
                          description: '3-5 key visual elements for this scene'
                        },
                        // ✅ NEW: Professional transitions
                        transitionType: { 
                          type: 'string', 
                          enum: ['morph', 'wipe', 'zoom', 'dissolve', 'fade'],
                          description: 'Type of transition to next scene'
                        },
                        // ✅ NEW: Sound effects
                        soundEffectType: {
                          type: 'string',
                          enum: ['whoosh', 'pop', 'success', 'alert', 'none'],
                          description: 'Sound effect for this scene'
                        },
                        // ✅ NEW: Stats overlay for animated numbers
                        statsOverlay: {
                          type: 'array',
                          items: { type: 'string' },
                          description: 'Statistics/numbers to animate as overlays in this scene'
                        }
                      },
                      required: ['id', 'act', 'title', 'voiceover', 'visualDescription', 'duration', 'mood', 'keyElements', 'transitionType', 'soundEffectType']
                    }
                  },
                  totalDuration: {
                    type: 'number',
                    description: 'Total video duration in seconds'
                  }
                },
                required: ['title', 'summary', 'scenes', 'totalDuration']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'create_explainer_script' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
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
    console.log('AI response received');

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error('No tool call in response:', JSON.stringify(data));
      throw new Error('Invalid AI response format');
    }

    const script = JSON.parse(toolCall.function.arguments);
    
    // Add IDs if missing
    script.scenes = script.scenes.map((scene: any, index: number) => ({
      ...scene,
      id: scene.id || `scene-${index + 1}`,
      act: scene.act || index + 1
    }));

    console.log('Script generated successfully:', script.title);

    return new Response(
      JSON.stringify({ script }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating explainer script:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
