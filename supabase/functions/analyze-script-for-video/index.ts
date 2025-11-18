import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeScriptRequest {
  scriptText: string;
  imageCount: number;
  targetDuration?: number;
}

interface ScriptSegment {
  text: string;
  duration: number;
  subtitle: string;
  imageIndex: number;
  startTime: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { scriptText, imageCount, targetDuration }: AnalyzeScriptRequest = await req.json();

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
      targetDuration 
    });

    // Call Lovable AI to analyze and segment the script
    const prompt = `Du bist ein professioneller Video-Editor. Analysiere das folgende Werbeskript und teile es in genau ${imageCount} Segmente auf.

Skript:
"""
${scriptText}
"""

Für jedes Segment musst du folgendes bestimmen:
1. **text**: Der Text für dieses Segment (wird später als Voiceover verwendet)
2. **duration**: Optimale Dauer in Sekunden (basierend auf Textlänge, ca. 150 Wörter/Minute Sprechgeschwindigkeit)
3. **subtitle**: Kurzer, prägnanter Untertitel (maximal 6 Wörter, der die Hauptaussage zusammenfasst)
4. **imageIndex**: Welches Bild (0 bis ${imageCount - 1}) am besten zu diesem Textsegment passt

Wichtige Regeln:
- Die Segmente sollten logisch aufeinander aufbauen (Intro → Hauptteil → Call-to-Action)
- Verteile die Bilder gleichmäßig (jedes Bild wird genau einmal verwendet)
- Die Gesamtdauer aller Segmente sollte zwischen 15-25 Sekunden liegen
- Kurze Segmente (2-4s) für einfache Aussagen, längere (5-7s) für komplexere Inhalte
- Untertitel sollten werbewirksam und einprägsam sein

Antworte NUR mit einem JSON-Objekt in diesem exakten Format (kein zusätzlicher Text):
{
  "segments": [
    {
      "text": "Vollständiger Text für Segment 1...",
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

    // Calculate start times
    let currentTime = 0;
    segments = segments.map((segment, index) => {
      const enhancedSegment = {
        ...segment,
        startTime: currentTime,
        imageIndex: index, // Ensure sequential image usage
      };
      currentTime += segment.duration;
      return enhancedSegment;
    });

    const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);

    console.log('[analyze-script] Analysis complete', {
      segmentCount: segments.length,
      totalDuration,
      segments: segments.map(s => ({ 
        imageIndex: s.imageIndex, 
        duration: s.duration, 
        subtitle: s.subtitle 
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
