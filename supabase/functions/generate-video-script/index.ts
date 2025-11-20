import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScriptRequest {
  topic: string;
  duration: number; // in seconds
  tone?: string;
  target_audience?: string;
  content_type?: 'ad' | 'story' | 'reel' | 'tutorial' | 'testimonial' | 'news';
}

const CONTENT_TYPE_PROMPTS: Record<string, (duration: number, tone: string, target_audience: string) => string> = {
  ad: (duration: number, tone: string, target_audience: string) => `Erstelle ein verkaufsstarkes Werbevideo-Skript:
    Struktur (${duration}s):
    - Hook (0-2s): Aufmerksamkeit fesseln
    - Problem (2-5s): Pain Point zeigen
    - Lösung (5-10s): Produkt/Service präsentieren
    - Social Proof (10-12s): Kurzes Testimonial
    - CTA (12-${duration}s): Klarer Call-to-Action
    
    Ton: ${tone}
    Zielgruppe: ${target_audience}
    
    NUR sprechbarer Text - KEINE Visuell-Beschreibungen!`,
    
  story: (duration: number, tone: string) => `Erstelle ein authentisches Instagram Story-Skript:
    Struktur (${duration}s):
    - Pattern Interrupt (0-1s): Visueller Hook
    - Personal Touch (1-3s): "Hey, ich bin..."
    - Value (3-8s): Wert/Tipp/Story
    - Engagement (8-${duration}s): "Swipe Up / DM mir"
    
    Stil: Conversational, persönlich, direkt
    Kamera: Direkt in die Kamera sprechen
    
    NUR sprechbarer Text - KEINE Visuell-Beschreibungen!`,
    
  reel: (duration: number) => `Erstelle ein virales Reel-Skript:
    Struktur (${duration}s):
    - Pattern Interrupt (0-1s): WTF-Moment
    - Relatability (1-3s): "Du kennst das auch..."
    - Payoff (3-${duration - 2}s): Lösung/Twist
    - Loop Hook (letzten 2s): Anfang wiederholen
    
    Ziel: Hohe Watch-Time, Shares, Saves
    Style: Fast-paced, dynamisch
    
    NUR sprechbarer Text - KEINE Visuell-Beschreibungen!`,
    
  tutorial: (duration: number, tone: string) => `Erstelle ein klares Tutorial-Skript:
    Struktur (${duration}s):
    - Intro (0-3s): "In diesem Video lernst du..."
    - Schritt 1 (3-${Math.floor(duration / 3)}s): Erste Action
    - Schritt 2 (${Math.floor(duration / 3)}-${Math.floor(2 * duration / 3)}s): Zweite Action
    - Schritt 3 (${Math.floor(2 * duration / 3)}-${duration - 5}s): Dritte Action
    - Outro (letzten 5s): Zusammenfassung + Next Steps
    
    Stil: Klar, strukturiert, step-by-step
    Ton: ${tone}
    
    NUR sprechbarer Text - KEINE Visuell-Beschreibungen!`,
    
  testimonial: (duration: number) => `Erstelle ein emotionales Testimonial-Skript:
    Struktur (${duration}s):
    - Problem vorher (0-${Math.floor(duration / 4)}s): "Früher hatte ich..."
    - Lösung (${Math.floor(duration / 4)}-${Math.floor(duration / 2)}s): "Dann habe ich X entdeckt..."
    - Ergebnis (${Math.floor(duration / 2)}-${Math.floor(3 * duration / 4)}s): "Jetzt..."
    - Empfehlung (${Math.floor(3 * duration / 4)}-${duration}s): "Ich kann es nur empfehlen"
    
    Ton: Authentisch, emotional, persönlich
    
    NUR sprechbarer Text - KEINE Visuell-Beschreibungen!`,
    
  news: (duration: number) => `Erstelle ein informatives News-Update-Skript:
    Struktur (${duration}s):
    - Breaking News (0-2s): "BREAKING: ..."
    - Details (2-${Math.floor(duration / 2)}s): Was ist passiert?
    - Auswirkungen (${Math.floor(duration / 2)}-${Math.floor(3 * duration / 4)}s): Was bedeutet das?
    - Next Steps (${Math.floor(3 * duration / 4)}-${duration}s): Was kommt als nächstes?
    
    Stil: Professionell, faktisch, neutral
    
    NUR sprechbarer Text - KEINE Visuell-Beschreibungen!`
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { topic, duration, tone = 'professional', target_audience = 'general', content_type }: ScriptRequest = await req.json();

    if (!topic || !duration) {
      throw new Error('Topic and duration are required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `Du bist ein Experte für Video-Script-Writing. Erstelle prägnante, fesselnde Video-Scripts die perfekt für Social Media Videos sind.`;

    // Use content-type specific prompt if available
    const contentTypePrompt = content_type && CONTENT_TYPE_PROMPTS[content_type]
      ? CONTENT_TYPE_PROMPTS[content_type](duration, tone, target_audience)
      : '';

    const userPrompt = contentTypePrompt || `Erstelle ein ${duration}-Sekunden Video-Script zum Thema: "${topic}"
    
Ton: ${tone}
Zielgruppe: ${target_audience}

Das Script sollte:
- Hook: Starke Aufmerksamkeits-Eröffnung (3-5 Sekunden)
- Hauptteil: Kernbotschaft klar vermitteln (${duration - 10} Sekunden)
- Call-to-Action: Klarer Aufruf zum Handeln (3-5 Sekunden)

WICHTIG - NUR sprechbarer Text:
- Gib NUR Text zurück, der tatsächlich vom Sprecher vorgelesen wird
- KEINE Beschreibungen wie "(Visuell: ...)", "(Hintergrund: ...)", "(Musik: ...)"
- KEINE Meta-Informationen über das Video-Format oder die Bildauswahl
- Der main_content sollte NUR das sein, was der Sprecher sagt, NICHT was im Video zu sehen ist

Beispiele:
❌ FALSCH: "Eine dynamische Abfolge von professionellen Produktbildern zeigt die Produkte im Detail. (Visuell: Montage von 5-6 Bildern)"
✅ RICHTIG: "Entdecken Sie unsere neue Kollektion mit innovativen Designs und hochwertiger Verarbeitung."

❌ FALSCH: "(Hintergrund: Moderne Musik läuft)"
✅ RICHTIG: [Weglassen - keine Erwähnung]

Format: Gib das Script in folgendem JSON-Format zurück:
{
  "hook": "Starke Eröffnung...",
  "main_content": "Kernbotschaft...",
  "cta": "Call-to-Action...",
  "estimated_duration": ${duration}
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'create_video_script',
            description: 'Returns a structured video script',
            parameters: {
              type: 'object',
              properties: {
                hook: { type: 'string', description: 'Opening hook (3-5 seconds)' },
                main_content: { type: 'string', description: 'Main message' },
                cta: { type: 'string', description: 'Call to action (3-5 seconds)' },
                estimated_duration: { type: 'number', description: 'Total duration in seconds' }
              },
              required: ['hook', 'main_content', 'cta', 'estimated_duration'],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'create_video_script' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      throw new Error('AI generation failed');
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('No script generated');
    }

    const script = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({ ok: true, script }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Script generation error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
