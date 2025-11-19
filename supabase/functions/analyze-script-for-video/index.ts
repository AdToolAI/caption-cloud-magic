import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeScriptRequest {
  scriptText: string;
  imageCount: number;
  targetDuration?: number;
  existingSegments?: Array<{ text: string }>;
}

interface WordTiming {
  word: string;
  start: number;
  duration: number;
}

interface ScriptSegment {
  text: string;
  duration: number;
  subtitle: string;
  imageIndex: number;
  startTime: number;
  wordTimings?: WordTiming[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { scriptText, imageCount, targetDuration, existingSegments }: AnalyzeScriptRequest = await req.json();

    if (!scriptText || !imageCount) {
      return new Response(
        JSON.stringify({ error: 'scriptText and imageCount are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('[analyze-script] Analyzing script', { 
      scriptLength: scriptText.length, 
      imageCount,
      targetDuration,
      hasExistingSegments: !!existingSegments
    });

    // Helper function to generate word-level timings
    const generateWordTimings = (text: string, segmentDuration: number): WordTiming[] => {
      const words = text.split(/\s+/).filter(w => w.trim().length > 0);
      if (words.length === 0) return [];
      
      const avgDurationPerWord = segmentDuration / words.length;
      
      return words.map((word, index) => ({
        word: word.replace(/[.,!?;:]$/, ''), // Remove trailing punctuation
        start: index * avgDurationPerWord,
        duration: avgDurationPerWord
      }));
    };

    // Call Lovable AI to analyze and segment the script
    const prompt = `Du bist ein professioneller Video-Editor. Analysiere das folgende Werbeskript und teile es in genau ${imageCount} Segmente auf.

Skript:
"""
${scriptText}
"""

KRITISCH WICHTIG - Text-Extraktion:
Das Script kann verschiedene nicht-sprechbare Elemente enthalten, die du KOMPLETT IGNORIEREN musst:

1. Strukturelemente: "HOOK:", "HOOK (30s gesamt):", "HAUPTTEIL:", "CALL-TO-ACTION:"
2. Beschreibungen in Klammern: "(Visuell: ...)", "(Hintergrund: ...)", "(Musik: ...)", "(30s gesamt)"
3. Beschreibende Sätze über das Video-Format: "Eine dynamische Abfolge...", "Im Hintergrund läuft..."
4. Jegliche Meta-Informationen über Bildauswahl, Musik, visuelle Effekte

**EXTRAHIERE NUR DEN TATSÄCHLICH ZU SPRECHENDEN TEXT!**

Konkrete Beispiele:

Beispiel 1:
Input: "HOOK (30s gesamt): Sie suchen nach hochwertigen Produkten? Entdecken Sie unsere Neuheiten in Aktion."
→ text: "Sie suchen nach hochwertigen Produkten? Entdecken Sie unsere Neuheiten in Aktion."
(Entferne: "HOOK (30s gesamt):")

Beispiel 2:
Input: "HAUPTTEIL: Eine dynamische und schnelle Abfolge von professionellen Produktbildern und kurzen Videoclips, die die Produkte im Detail und in der Anwendung zeigen. Im Hintergrund läuft eine moderne und unaufdringliche Musik."
→ text: "" (LEER - dies ist reine Beschreibung, KEIN sprechbarer Text!)
Oder falls es danach noch sprechbaren Text gibt, nur diesen verwenden.

Beispiel 3:
Input: "Unsere Produkte vereinen Design und Qualität. (Visuell: Close-up Shots der Produkte) Überzeugen Sie sich selbst!"
→ text: "Unsere Produkte vereinen Design und Qualität. Überzeugen Sie sich selbst."
(Entferne: "(Visuell: Close-up Shots der Produkte)")

Beispiel 4:
Input: "CALL-TO-ACTION: Sichere dir jetzt bis zum 30.11.2025 15 % Rabatt auf deinen gesamten Einkauf!"
→ text: "Sichere dir jetzt bis zum 30.11.2025 15 % Rabatt auf deinen gesamten Einkauf!"
(Entferne: "CALL-TO-ACTION:")

Für jedes Segment musst du folgendes bestimmen:
1. **text**: NUR der tatsächlich zu sprechende Text (bereinigt wie oben erklärt)
2. **duration**: Optimale Dauer in Sekunden (basierend auf Textlänge, ca. 150 Wörter/Minute Sprechgeschwindigkeit)
3. **subtitle**: Kurzer, prägnanter Untertitel (maximal 6 Wörter, der die Hauptaussage zusammenfasst)
4. **imageIndex**: Welches Bild (0 bis ${imageCount - 1}) am besten zu diesem Textsegment passt

Wichtige Regeln:
- Wenn ein Segment NUR Beschreibungen enthält (keine sprechbaren Inhalte), überspringe es oder fasse benachbarte Segmente zusammen
- Die Segmente sollten logisch aufeinander aufbauen (Intro → Hauptteil → Call-to-Action)
- Verteile die Bilder gleichmäßig (jedes Bild wird genau einmal verwendet)
- Die Gesamtdauer aller Segmente sollte zwischen 15-25 Sekunden liegen
- Kurze Segmente (2-4s) für einfache Aussagen, längere (5-7s) für komplexere Inhalte
- Untertitel sollten werbewirksam und einprägsam sein
- subtitle MUSS IMMER vorhanden sein (niemals leer oder null)

Antworte NUR mit einem JSON-Objekt in diesem exakten Format (kein zusätzlicher Text):
{
  "segments": [
    {
      "text": "Vollständiger sprechbarer Text für Segment 1...",
      "duration": 4.5,
      "subtitle": "Kurzer Titel",
      "imageIndex": 0
    }
  ]
}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Du bist ein Video-Editor. Antworte IMMER nur mit validem JSON, ohne zusätzlichen Text.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[analyze-script] Lovable AI error:', aiResponse.status, errorText);
      throw new Error(`Lovable AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('[analyze-script] Raw AI response:', content);

    // Parse JSON from AI response (handle markdown code blocks if present)
    let analysisResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        analysisResult = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('[analyze-script] Failed to parse AI response:', content);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Validate and enhance segments
    if (!analysisResult.segments || !Array.isArray(analysisResult.segments)) {
      throw new Error('Invalid segments in AI response');
    }

    // Calculate start times and ensure we have exactly imageCount segments
    let segments: ScriptSegment[] = analysisResult.segments.slice(0, imageCount);
    
    // If we got fewer segments than images, distribute remaining images
    if (segments.length < imageCount) {
      const remaining = imageCount - segments.length;
      for (let i = 0; i < remaining; i++) {
        const lastSegment = segments[segments.length - 1];
        segments.push({
          text: lastSegment?.text || 'Weitere Informationen...',
          duration: 4,
          subtitle: 'Mehr erfahren',
          imageIndex: segments.length,
        } as ScriptSegment);
      }
    }

    // Calculate start times and generate word timings + ENSURE subtitles exist
    let currentTime = 0;
    segments = segments.map((segment, index) => {
      const text = String(segment.text || '').trim();
      const duration = Math.max(2, Math.min(10, Number(segment.duration) || 5));
      
      // CRITICAL: Always generate subtitle - multiple fallback strategies
      let subtitle = String(segment.subtitle || '').trim();
      if (!subtitle || subtitle.length === 0) {
        // Fallback 1: Extract first 4-6 words from text
        const words = text.split(/\s+/).filter(w => w.length > 0);
        subtitle = words.slice(0, Math.min(6, words.length)).join(' ');
        
        // Fallback 2: If still too long, take first sentence
        if (subtitle.length > 50) {
          const firstSentence = text.split(/[.!?]/)[0];
          subtitle = firstSentence.length <= 50 ? firstSentence : subtitle.slice(0, 47) + '...';
        }
        
        console.log(`[analyze-script] Generated subtitle for segment ${index}: "${subtitle}"`);
      }
      
      const wordTimings = generateWordTimings(text, duration);
      
      const enhancedSegment = {
        text,
        duration,
        subtitle,
        startTime: currentTime,
        imageIndex: index, // Ensure sequential image usage
        wordTimings
      };
      currentTime += duration;
      return enhancedSegment;
    });

    const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);

    console.log('[analyze-script] Analysis complete', {
      segmentCount: segments.length,
      totalDuration,
      hasWordTimings: (segments[0]?.wordTimings?.length ?? 0) > 0,
      segments: segments.map(s => ({ 
        imageIndex: s.imageIndex, 
        duration: s.duration, 
        subtitle: s.subtitle,
        wordCount: s.wordTimings?.length ?? 0
      }))
    });

    return new Response(
      JSON.stringify({
        segments,
        totalDuration,
        voiceoverNeeded: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[analyze-script] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
