import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CoPilotContext {
  currentStep: number;
  scenesCount: number;
  hasTransitions: boolean;
  videoDuration: number;
  hasEffects: boolean;
  hasAudio: boolean;
  scenes?: Array<{ mood?: string; description?: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { message, context, type } = await req.json() as {
      message: string;
      context: CoPilotContext;
      type: 'chat' | 'suggestions' | 'command';
    };

    const systemPrompt = `Du bist ein KI-Assistent für Video-Bearbeitung im Director's Cut Editor. 
Du hilfst Benutzern bei der professionellen Videobearbeitung.

Aktueller Kontext:
- Schritt: ${context.currentStep} von 11
- Szenen: ${context.scenesCount}
- Übergänge: ${context.hasTransitions ? 'Ja' : 'Nein'}
- Videodauer: ${context.videoDuration.toFixed(1)}s
- Effekte: ${context.hasEffects ? 'Ja' : 'Nein'}
- Audio: ${context.hasAudio ? 'Ja' : 'Nein'}

${context.scenes ? `Szenen-Details: ${JSON.stringify(context.scenes.slice(0, 3))}` : ''}

Verfügbare Befehle die du erkennen kannst:
- "analyze_scenes" - Szenen analysieren
- "generate_transitions" - KI-Übergänge generieren
- "apply_style:<style>" - Style anwenden (cinematic, vintage, etc.)
- "adjust_volume:<value>" - Lautstärke anpassen (0-200)
- "split_scene" - Aktuelle Szene teilen
- "delete_scene" - Aktuelle Szene löschen
- "duplicate_scene" - Aktuelle Szene duplizieren
- "export" - Zum Export gehen

Antworte auf Deutsch, prägnant und hilfreich. Bei Befehls-Anfragen, gib das erkannte Kommando zurück.`;

    const userPrompt = type === 'suggestions' 
      ? `Generiere 2-3 proaktive, kontextbezogene Tipps für den aktuellen Bearbeitungsstand. 
         Format als JSON Array: [{"type": "tip|warning|optimization|creative", "title": "...", "description": "...", "action": "command_name|null", "priority": "low|medium|high"}]`
      : type === 'command'
      ? `Analysiere diese Benutzereingabe und extrahiere den Befehl: "${message}"
         Antworte mit JSON: {"command": "command_name", "params": {...}, "response": "Bestätigungstext"}`
      : message;

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
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit erreicht. Bitte versuche es später erneut.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Try to parse JSON responses
    let parsedContent = content;
    try {
      // Check if response contains JSON
      const jsonMatch = content.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Keep as string if not valid JSON
    }

    return new Response(JSON.stringify({ 
      response: parsedContent,
      type,
      raw: content,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Director Cut CoPilot error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

