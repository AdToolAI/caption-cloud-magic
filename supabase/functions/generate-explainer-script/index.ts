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
    const productName = (briefing as any).productName || 
                        briefing.productDescription?.split(/[\s,.:;!?]+/).slice(0, 3).join(' ') || 
                        'das Produkt';

    const systemPrompt = `Du bist ein professioneller Drehbuchautor für Erklärvideos im Stil von Loft-Film und Kurzgesagt.
Du erstellst strukturierte, emotionale und überzeugende Drehbücher im 5-Akt-Format.

========== KRITISCH: PRODUKTNAME ==========
Der Produktname ist: "${productName}"
Verwende diesen Namen EXAKT in allen Szenen. 
NIEMALS "[Dein Produktname]", "[Produktname]" oder andere Platzhalter verwenden!
Schreibe immer den echten Namen: "${productName}"

========== KRITISCH: VERBOTENE PHRASEN IM VOICEOVER ==========
❌ NIEMALS "Also ich habe" oder "Ich habe" verwenden
❌ NIEMALS "Also..." als Satzanfang verwenden
❌ NIEMALS in der ersten Person ("ich", "mein", "mir") sprechen
❌ NIEMALS generische Füllwörter oder Floskeln
❌ NIEMALS Fragen an sich selbst ("Was mache ich jetzt?")

✅ IMMER direkt zum Produkt/Thema/Problem sprechen
✅ IMMER professionellen Sprecher-Ton verwenden (wie ein Dokumentarfilm)
✅ IMMER klaren Bezug zum Produkt "${productName}" haben
✅ Jeder Satz muss einen klaren inhaltlichen Mehrwert bieten

WICHTIGE REGELN:
- Schreibe im "${briefing.tone}" Ton
- Zielgruppe: ${briefing.targetAudience}
- Sprache: ${briefing.language === 'de' ? 'Deutsch' : briefing.language === 'en' ? 'Englisch' : briefing.language}
- Gesamtdauer: ${targetDuration} Sekunden (ca. ${sceneDuration} Sekunden pro Szene)
- Visueller Stil: ${briefing.style}

STRUKTUR (Loft-Film Methode):
1. HOOK (Akt 1): Emotionaler Einstieg, der sofort Aufmerksamkeit erregt
2. PROBLEM (Akt 2): Das Problem der Zielgruppe klar und relatable darstellen
3. LÖSUNG (Akt 3): ${productName} als Lösung präsentieren
4. BEWEIS (Akt 4): Konkrete Features von ${productName}, Vorteile oder Social Proof
5. CTA (Akt 5): Klarer Call-to-Action für ${productName} mit Dringlichkeit

========== VERBOTEN in visualDescription ==========
❌ KEINE Preise, Währungen, falsche Zahlen, oder Phantasie-Text
❌ KEINE Tabellen, Listen, Aufzählungen oder Preisvergleiche
❌ KEINE Phantasie-Sprachen oder unleserliche Zeichen (Lorem Ipsum, Gibberish)
❌ KEINE Natur-Szenen (Bäume, Wälder, Sonnenuntergänge) für Business-Produkte

========== ERLAUBT in visualDescription ==========
✅ Produktnamen wie "AdTool Logo" oder "SaaS Dashboard"
✅ Einfache Labels wie "Schritt 1", "Vorher/Nachher"
✅ Call-to-Actions wie "Jetzt starten" Button
✅ Kurze Schlagworte die zum Kontext passen

========== STATTDESSEN für Preis/Feature-Szenen ==========
✅ "Drei aufsteigende Podeste mit Bronze, Silber, Gold Sternen"
✅ "Gestapelte Blöcke mit Häkchen-Icons für verschiedene Leistungsstufen"
✅ "Treppe mit drei Stufen, jede leuchtender als die vorherige"
✅ "Wachsende Balkendiagramme mit Erfolgsindikatoren"

========== KRITISCH FÜR visualDescription ==========
- Beschreibe flache 2D-Vektor-Illustrationen wie Kurzgesagt/Loft-Film
- Verwende geometrische Formen, abstrakte Icons und Symbole
- KEINE detaillierten Gesichter - nur einfache stilisierte Figuren
- Fokus auf: Business-Metaphern, Diagramme, Infografiken, abstrakte Konzepte
- Immer DIREKT relevant zum Business-Thema
- KORREKTER kontextueller Text ist ERLAUBT (Produktnamen, CTAs, Labels)

GUTE Beispiele für visualDescription:
- "Einfaches Laptop-Icon mit aufsteigendem Graphen und Pfeil nach oben, AdTool Logo unten"
- "Abstrakte Business-Figur (Silhouette) mit Glühbirne über dem Kopf"
- "Puzzle-Teile die zusammenkommen, leuchtendes Häkchen erscheint, 'Erfolg' Label"
- "Rakete startet von Plattform mit 'Jetzt starten' Button, Sterne und Aufstiegs-Partikel"
- "Dashboard mit drei Balken, der mittlere leuchtet golden"
- "Smartphone-Icon mit Chat-Bubbles und Herz-Reaktionen"

SCHLECHTE Beispiele (VERBOTEN):
- "Preistabelle zeigt $99, $199, $299..." (Falsche erfundene Preise)
- "Baum im Sonnenlicht" (irrelevante Naturszene)
- "Lorem ipsum dolor sit amet" (Gibberish/Phantasie-Text)

Für jede Szene liefere:
- title: Kurzer Szenentitel
- voiceover: Sprechertext (natürlich, nicht zu werblich)
- visualDescription: EINFACHE Beschreibung für 2D-Vektor-Illustration (1-2 Sätze, Icons/Symbole/Metaphern, korrekter Text erlaubt)
- duration: Dauer in Sekunden
- mood: Stimmung der Szene (z.B. "curious", "frustrated", "hopeful", "confident", "excited")
- keyElements: Array mit 3-5 visuellen Schlüsselelementen (Icons, Symbole, abstrakte Formen)`;

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
              description: 'Creates a structured 5-act explainer video script',
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
                        visualDescription: { type: 'string', description: 'Detailed description of visual elements for animation' },
                        duration: { type: 'number', description: 'Duration in seconds' },
                        mood: { type: 'string', enum: ['curious', 'frustrated', 'hopeful', 'confident', 'excited', 'relieved', 'inspired'] },
                        keyElements: {
                          type: 'array',
                          items: { type: 'string' },
                          description: '3-5 key visual elements for this scene'
                        }
                      },
                      required: ['id', 'act', 'title', 'voiceover', 'visualDescription', 'duration', 'mood', 'keyElements']
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
