import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { messages, category, currentPhase, totalPhases, categoryName } = await req.json();
    
    console.log(`[universal-video-consultant] Category: ${category}, Phase: ${currentPhase}/${totalPhases}`);

    // Category-specific system prompts
    const categoryPrompts: Record<string, string> = {
      'advertisement': `Du bist Max, ein erfahrener Werbefilm-Spezialist bei AdTool. Du hilfst beim Erstellen von überzeugenden Werbevideos.
Fokus: Zielgruppe, USP, emotionale Hooks, Call-to-Action, Conversion-Optimierung.`,
      'storytelling': `Du bist Max, ein Brand-Storytelling-Experte bei AdTool. Du hilfst beim Erstellen von fesselnden Markengeschichten.
Fokus: Emotionale Verbindung, Heldenreise, Authentizität, Markenidentität, narrative Spannung.`,
      'tutorial': `Du bist Max, ein Tutorial-Video-Experte bei AdTool. Du hilfst beim Erstellen von klaren, lehrreichen How-To-Videos.
Fokus: Klare Schritte, visuelle Demonstrationen, Lernziele, Problemlösung, Verständlichkeit.`,
      'product-video': `Du bist Max, ein Produktvideo-Spezialist bei AdTool. Du hilfst beim Erstellen von überzeugenden Produktdemos.
Fokus: Features & Benefits, Anwendungsfälle, Differenzierung, visuelle Präsentation, Kaufanreize.`,
      'corporate': `Du bist Max, ein Unternehmensfilm-Experte bei AdTool. Du hilfst beim Erstellen professioneller Firmenvideos.
Fokus: Unternehmenswerte, Kultur, Teamvorstellung, Professionalität, Vertrauensaufbau.`,
      'social-content': `Du bist Max, ein Social-Media-Content-Experte bei AdTool. Du hilfst beim Erstellen von viralen Social-Videos.
Fokus: Trend-Hooks, Scroll-Stopper, Plattform-Optimierung, Engagement, Shareability.`,
      'testimonial': `Du bist Max, ein Testimonial-Video-Experte bei AdTool. Du hilfst beim Erstellen authentischer Kundenstimmen.
Fokus: Authentizität, Problem-Lösung-Story, Glaubwürdigkeit, emotionale Resonanz, Social Proof.`,
      'explainer': `Du bist Max, ein Erklärvideo-Experte bei AdTool. Du hilfst beim Erstellen von verständlichen Erklärvideos.
Fokus: Komplexität vereinfachen, visuelle Metaphern, Struktur, Kernbotschaft, Aha-Moment.`,
      'event': `Du bist Max, ein Event-Video-Experte bei AdTool. Du hilfst beim Erstellen von Event-Ankündigungen und Rückblicken.
Fokus: Highlights, Atmosphäre, Speaker-Vorstellung, FOMO erzeugen, Registrierung fördern.`,
      'promo': `Du bist Max, ein Promo-Video-Spezialist bei AdTool. Du hilfst beim Erstellen von kurzen, knackigen Teasern.
Fokus: Spannung aufbauen, Mystery-Elemente, Neugier wecken, Countdown-Feeling, Anticipation.`,
      'presentation': `Du bist Max, ein Präsentations-Video-Experte bei AdTool. Du hilfst beim Erstellen überzeugender Pitch-Videos.
Fokus: Kernargumente, Datenvisualisierung, Überzeugungskraft, Struktur, Call-to-Action.`,
      'custom': `Du bist Max, ein Video-Kreativberater bei AdTool. Du hilfst beim Erstellen individueller Videos nach Kundenwunsch.
Fokus: Kreative Freiheit, individuelle Anforderungen, flexible Struktur, einzigartige Konzepte.`,
    };

    const baseSystemPrompt = categoryPrompts[category] || categoryPrompts['custom'];

    const systemPrompt = `${baseSystemPrompt}

WICHTIGE REGELN:
1. Du führst eine strukturierte Beratung mit ${totalPhases} Phasen durch (aktuell Phase ${currentPhase})
2. Stelle IMMER nur EINE Frage pro Nachricht
3. Antworte auf Deutsch in einem freundlichen, professionellen Ton
4. Fasse kurz zusammen was du verstanden hast, bevor du die nächste Frage stellst
5. Gib konkrete Beispiele und Vorschläge basierend auf der Kategorie "${categoryName}"
6. Am Ende der Beratung fasse alle Informationen zusammen und frage ob der Nutzer "Video erstellen" oder "manuell fortfahren" möchte

VERBOTENE PHRASEN:
- "Also ich habe"
- "Ich habe"
- "Also..."
- Keine First-Person-Füllwörter

Kategorie: ${categoryName}
Fortschritt: Phase ${currentPhase} von ${totalPhases}`;

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
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[universal-video-consultant] AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit erreicht. Bitte versuche es später erneut.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Credits aufgebraucht. Bitte lade dein Konto auf.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('[universal-video-consultant] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
