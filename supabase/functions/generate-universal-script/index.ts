import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Multi-stage JSON repair for malformed AI output
function tryRepairJson(raw: string): object | null {
  // Stage 1: Direct parse
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.log('[JSON-Repair] Stage 1 (direct) failed:', (e as Error).message);
  }

  let cleaned = raw;

  // Stage 2: Clean common AI issues
  // Remove markdown code block wrappers
  cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
  // Remove control characters except newlines and tabs
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Remove single-line comments
  cleaned = cleaned.replace(/\/\/[^\n]*/g, '');

  try {
    const result = JSON.parse(cleaned);
    console.log('[JSON-Repair] Stage 2 (clean) succeeded');
    return result;
  } catch (e) {
    console.log('[JSON-Repair] Stage 2 (clean) failed:', (e as Error).message);
  }

  // Stage 3: Extract JSON block via regex (first { to last })
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = cleaned.substring(firstBrace, lastBrace + 1);
    // Re-apply trailing comma fix on extracted block
    const extractedCleaned = extracted.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
    try {
      const result = JSON.parse(extractedCleaned);
      console.log('[JSON-Repair] Stage 3 (regex extract) succeeded');
      return result;
    } catch (e) {
      console.log('[JSON-Repair] Stage 3 (regex extract) failed:', (e as Error).message);
    }
  }

  return null;
}

async function retryAiForValidJson(
  apiKey: string,
  malformedContent: string,
  originalSystemPrompt: string
): Promise<object | null> {
  console.log('[JSON-Repair] Stage 4: Retrying AI for valid JSON...');
  const retryPrompt = `Dein letzter Output war kein valides JSON. Hier ist der fehlerhafte Output:

---
${malformedContent.substring(0, 3000)}
---

Bitte gib EXAKT denselben Inhalt als VALIDES JSON zurück. NUR das JSON-Objekt, keine Erklärungen, kein Markdown. Achte auf:
- Keine Trailing Commas
- Alle Strings korrekt escaped (Anführungszeichen mit \\")
- Keine Kommentare im JSON`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: originalSystemPrompt },
          { role: 'user', content: retryPrompt }
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('[JSON-Repair] Retry AI call failed:', response.status);
      return null;
    }

    const data = await response.json();
    const retryContent = data.choices?.[0]?.message?.content;
    if (!retryContent) return null;

    const result = tryRepairJson(retryContent);
    if (result) {
      console.log('[JSON-Repair] Stage 4 (AI retry) succeeded');
    } else {
      console.error('[JSON-Repair] Stage 4 (AI retry) also produced invalid JSON');
    }
    return result;
  } catch (e) {
    console.error('[JSON-Repair] Retry error:', e);
    return null;
  }
}

// Storytelling structure templates
const STORYTELLING_STRUCTURES: Record<string, { name: string; structure: string[] }> = {
  '3-act': {
    name: '3-Akt-Struktur',
    structure: ['Einleitung/Setup', 'Hauptteil/Konflikt', 'Auflösung/Schluss']
  },
  'hero-journey': {
    name: 'Heldenreise',
    structure: ['Gewöhnliche Welt', 'Ruf zum Abenteuer', 'Weigerung', 'Mentor trifft Held', 'Überschreiten der Schwelle', 'Prüfungen', 'Tiefster Punkt', 'Belohnung', 'Rückkehr', 'Transformation']
  },
  'aida': {
    name: 'AIDA',
    structure: ['Attention (Aufmerksamkeit)', 'Interest (Interesse)', 'Desire (Verlangen)', 'Action (Handlung)']
  },
  'problem-solution': {
    name: 'Problem-Lösung',
    structure: ['Problem vorstellen', 'Schmerzpunkte vertiefen', 'Lösung präsentieren', 'Benefits zeigen', 'CTA']
  },
  'feature-showcase': {
    name: 'Feature-Showcase',
    structure: ['Einleitung', 'Feature 1', 'Feature 2', 'Feature 3', 'Zusammenfassung', 'CTA']
  },
  'testimonial-arc': {
    name: 'Testimonial-Arc',
    structure: ['Vorstellung der Person', 'Problem beschreiben', 'Entdeckung der Lösung', 'Transformation', 'Empfehlung']
  },
  'before-after': {
    name: 'Vorher-Nachher',
    structure: ['Situation vorher', 'Der Wendepunkt', 'Situation nachher', 'Wie es funktioniert', 'CTA']
  },
  'comparison': {
    name: 'Vergleich',
    structure: ['Einleitung', 'Option A vorstellen', 'Option B vorstellen', 'Direkter Vergleich', 'Gewinner/Empfehlung']
  },
  'list-format': {
    name: 'Listenformat',
    structure: ['Hook', 'Punkt 1', 'Punkt 2', 'Punkt 3', 'Punkt 4', 'Punkt 5', 'Zusammenfassung']
  },
  'hook-value-cta': {
    name: 'Hook-Value-CTA',
    structure: ['Starker Hook', 'Wert liefern', 'Mehr Wert', 'CTA']
  }
};

// Animation mappings per scene type for intelligent defaults
const SCENE_ANIMATION_GUIDE = `
ANIMATIONS PRO SZENEN-TYP (WICHTIG - befolge diese Regeln!):

hook/intro Szene:
- animation: "popIn" oder "flyIn" (aufmerksamkeitsstark)
- textAnimation: "glowPulse" oder "bounceIn"
- soundEffect: "whoosh"
- showCharacter: true, characterPosition: "right", characterGesture: "pointing"

problem Szene:
- animation: "kenBurns" mit kenBurnsDirection: "in" (Dramatik)
- textAnimation: "typewriter" (Spannung aufbauen)
- soundEffect: "alert"
- showCharacter: true, characterPosition: "left", characterGesture: "thinking"

solution Szene:
- animation: "morphIn" oder "parallax" (Transformation zeigen)
- textAnimation: "splitReveal" (Enthüllung)
- soundEffect: "success"
- showCharacter: true, characterPosition: "right", characterGesture: "celebrating"

feature/benefit Szene:
- animation: "parallax" oder "slideUp" (Tiefe)
- textAnimation: "bounceIn" (Energie)
- soundEffect: "pop"
- statsOverlay: Zahlen/Fakten als Array z.B. ["85% Erfolgsrate", "+200% ROI"]
- showCharacter: false (Fokus auf Fakten)

proof/testimonial Szene:
- animation: "fadeIn" oder "slideUp" (seriös)
- textAnimation: "highlight" (Betonung)
- soundEffect: "success"
- statsOverlay: Bewertungen, Zahlen
- showCharacter: false

cta Szene:
- animation: "bounce" oder "popIn" (Handlungsaufforderung)
- textAnimation: "waveIn" oder "glowPulse" (Dynamik)
- soundEffect: "success"
- showCharacter: true, characterPosition: "right", characterGesture: "pointing"
- beatAligned: true (musikalischer Höhepunkt)
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { briefing } = await req.json();
    
    if (!briefing) {
      throw new Error('Briefing is required');
    }

    console.log(`[generate-universal-script] Category: ${briefing.category}, Structure: ${briefing.storytellingStructure}`);

    const structure = STORYTELLING_STRUCTURES[briefing.storytellingStructure] || STORYTELLING_STRUCTURES['problem-solution'];
    const scenesCount = structure.structure.length;
    const sceneDuration = Math.floor(briefing.videoDuration / scenesCount);

    const systemPrompt = `Du bist ein erfahrener Drehbuchautor für professionelle, animierte Videos. Erstelle ein Drehbuch mit VOLLSTÄNDIGEN ANIMATIONS-ANWEISUNGEN.

STORYTELLING-STRUKTUR: ${structure.name}
SZENEN: ${structure.structure.join(' → ')}

${SCENE_ANIMATION_GUIDE}

REGELN:
1. Erstelle genau ${scenesCount} Szenen entsprechend der Struktur
2. Jede Szene hat ~${sceneDuration} Sekunden
3. Schreibe den Sprechertext (voiceover) für jede Szene
4. Beschreibe die visuelle Darstellung jeder Szene (für KI-Bildgenerierung)
5. Der Text muss natürlich klingen und zum Vorlesen geeignet sein
6. Keine Füllwörter wie "Also", "Ich habe", etc.
7. WICHTIG: Füge für JEDE Szene die passenden Animations-Parameter hinzu!

AUSGABEFORMAT (JSON):
{
  "title": "Videotitel",
  "totalDuration": ${briefing.videoDuration},
  "scenes": [
    {
      "sceneNumber": 1,
      "sceneType": "hook|problem|solution|feature|proof|cta|intro|benefit|testimonial",
      "title": "Szenen-Titel (kurz, prägnant)",
      "voiceover": "Der gesprochene Text für diese Szene...",
      "visualDescription": "Beschreibung des Bildes: Was sieht man? Welche Elemente? Welcher Stil?",
      "durationSeconds": ${sceneDuration},
      
      "animation": "popIn|flyIn|kenBurns|parallax|morphIn|fadeIn|slideUp|bounce",
      "kenBurnsDirection": "in|out|left|right",
      "textAnimation": "typewriter|glowPulse|splitReveal|bounceIn|waveIn|fadeWords|highlight",
      "soundEffect": "whoosh|pop|success|alert|none",
      
      "showCharacter": true|false,
      "characterPosition": "left|right",
      "characterGesture": "pointing|thinking|celebrating|waving|idle",
      
      "statsOverlay": ["Statistik 1", "Statistik 2"] | null,
      "beatAligned": true|false,
      
      "transitionIn": "fade|slide|zoom|morph",
      "transitionOut": "fade|slide|zoom|morph"
    }
  ],
  "summary": "Kurze Zusammenfassung des Videos"
}

WICHTIG: Jede Szene MUSS die Animations-Parameter enthalten! Wähle passende Animationen basierend auf dem Szenen-Typ.`;

    const userPrompt = `Erstelle ein ${briefing.category}-Video-Drehbuch mit VOLLSTÄNDIGEN ANIMATIONS-ANWEISUNGEN:

**Projekt:** ${briefing.projectName || 'Video-Projekt'}
**Unternehmen:** ${briefing.companyName || '-'}
**Produkt/Service:** ${briefing.productName || '-'}
**Beschreibung:** ${briefing.productDescription || '-'}

**Zielgruppe:** ${briefing.targetAudience || 'Allgemein'}
**Kernproblem:** ${briefing.coreProblem || '-'}
**Lösung:** ${briefing.solution || '-'}
**USPs:** ${briefing.uniqueSellingPoints?.join(', ') || '-'}

**Kernbotschaft:** ${briefing.keyMessage || '-'}
**Gewünschte Aktion:** ${briefing.desiredAction || '-'}
**CTA-Text:** ${briefing.ctaText || '-'}

**Visueller Stil:** ${briefing.visualStyle || 'modern-3d'}
**Emotionaler Ton:** ${briefing.emotionalTone || 'professionell'}
**Markenfarben:** ${briefing.brandColors?.join(', ') || 'Standard'}

**Videolänge:** ${briefing.videoDuration} Sekunden
**Format:** ${briefing.aspectRatio || '16:9'}

${briefing.hasCharacter ? `**Charakter:** ${briefing.characterName || 'Protagonist'} - ${briefing.characterDescription || 'Sympathische Figur'}` : '**Charakter:** Aktiviere showCharacter für relevante Szenen (hook, problem, solution, cta)'}

**Zusätzliche Infos:** ${JSON.stringify(briefing.categorySpecific || {})}

WICHTIG: Füge für JEDE Szene passende animation, textAnimation, soundEffect, und Character-Parameter hinzu!`;

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
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-universal-script] AI error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No script content generated');
    }

    // Parse JSON from response with multi-stage repair
    let script = tryRepairJson(content);
    
    // Stage 4: AI retry if all local repairs failed
    if (!script) {
      console.warn('[generate-universal-script] All local JSON repairs failed, attempting AI retry...');
      script = await retryAiForValidJson(LOVABLE_API_KEY, content, systemPrompt);
    }
    
    if (!script) {
      console.error('[generate-universal-script] JSON parse failed after all repair stages. Raw content length:', content.length);
      throw new Error('Failed to parse script JSON after repair attempts');
    }
    
    console.log('[generate-universal-script] Script JSON parsed successfully');

    // Add timing and ensure animation defaults
    let currentTime = 0;
    script.scenes = script.scenes.map((scene: any, index: number) => {
      // Ensure animation defaults based on scene type
      const sceneType = scene.sceneType || 'content';
      
      const sceneWithTiming = {
        ...scene,
        startTime: currentTime,
        endTime: currentTime + scene.durationSeconds,
        // Ensure all animation fields have values
        animation: scene.animation || getDefaultAnimation(sceneType),
        kenBurnsDirection: scene.kenBurnsDirection || 'in',
        textAnimation: scene.textAnimation || getDefaultTextAnimation(sceneType),
        soundEffect: scene.soundEffect || getDefaultSoundEffect(sceneType),
        showCharacter: scene.showCharacter ?? shouldShowCharacter(sceneType),
        characterPosition: scene.characterPosition || getDefaultCharacterPosition(sceneType),
        characterGesture: scene.characterGesture || getDefaultCharacterGesture(sceneType),
        statsOverlay: scene.statsOverlay || null,
        beatAligned: scene.beatAligned ?? (sceneType === 'cta'),
        transitionIn: scene.transitionIn || 'fade',
        transitionOut: scene.transitionOut || 'fade',
      };
      currentTime += scene.durationSeconds;
      return sceneWithTiming;
    });

    console.log(`[generate-universal-script] Generated ${script.scenes.length} scenes with full animations, total ${currentTime}s`);

    return new Response(JSON.stringify({ script }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-universal-script] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper functions for intelligent defaults
function getDefaultAnimation(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'popIn',
    'intro': 'flyIn',
    'problem': 'kenBurns',
    'solution': 'morphIn',
    'feature': 'parallax',
    'benefit': 'slideUp',
    'proof': 'fadeIn',
    'testimonial': 'fadeIn',
    'cta': 'bounce',
  };
  return map[sceneType] || 'fadeIn';
}

function getDefaultTextAnimation(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'glowPulse',
    'intro': 'bounceIn',
    'problem': 'typewriter',
    'solution': 'splitReveal',
    'feature': 'bounceIn',
    'benefit': 'highlight',
    'proof': 'highlight',
    'testimonial': 'fadeWords',
    'cta': 'waveIn',
  };
  return map[sceneType] || 'fadeWords';
}

function getDefaultSoundEffect(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'whoosh',
    'intro': 'whoosh',
    'problem': 'alert',
    'solution': 'success',
    'feature': 'pop',
    'benefit': 'pop',
    'proof': 'success',
    'testimonial': 'none',
    'cta': 'success',
  };
  return map[sceneType] || 'none';
}

function shouldShowCharacter(sceneType: string): boolean {
  return ['hook', 'problem', 'solution', 'cta', 'intro'].includes(sceneType);
}

function getDefaultCharacterPosition(sceneType: string): string {
  return sceneType === 'problem' ? 'left' : 'right';
}

function getDefaultCharacterGesture(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'pointing',
    'intro': 'waving',
    'problem': 'thinking',
    'solution': 'celebrating',
    'feature': 'pointing',
    'benefit': 'celebrating',
    'proof': 'idle',
    'testimonial': 'idle',
    'cta': 'pointing',
  };
  return map[sceneType] || 'idle';
}
