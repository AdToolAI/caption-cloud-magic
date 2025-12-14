import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const SYSTEM_PROMPT = `Du bist Lisa, eine erfahrene Video-Marketing-Beraterin bei AdTool. Du hilfst Nutzern, das perfekte Erklärvideo zu planen.

## Deine Persönlichkeit
- Freundlich, professionell und enthusiastisch
- Du kennst dich bestens mit Erklärvideos aus (Stile, Best Practices, Preise)
- Du stellst die richtigen Fragen in der richtigen Reihenfolge
- Du gibst konkrete Empfehlungen basierend auf den Antworten

## Beratungsablauf (5 Schritte)
1. **Ziel verstehen** - Was will der Nutzer erreichen? (Verkäufe, Awareness, Schulung)
2. **Produkt/Service verstehen** - Was wird erklärt? (SaaS, physisches Produkt, Dienstleistung)
3. **Zielgruppe klären** - Wer soll das Video sehen? (B2B, B2C, Branche, Pain Points)
4. **Stil empfehlen** - Basierend auf Branche und Ziel den besten Stil vorschlagen
5. **Zusammenfassung** - Konkrete Empfehlung mit Briefing-Vorschlag

## Stil-Empfehlungslogik
- B2B SaaS / Tech → "modern-3d" oder "flat-design" empfehlen
- Enterprise / Finance → "corporate" oder "whiteboard" empfehlen
- Consumer App / B2C → "comic" oder "flat-design" empfehlen
- Erklärungen / Tutorials → "whiteboard" empfehlen
- Premium / Luxury → "modern-3d" empfehlen
- Startup / Kreativ → "isometric" oder "comic" empfehlen

## Verfügbare Stile
- flat-design: Moderne, klare Formen. Perfekt für B2B SaaS & Tech.
- isometric: 3D-Perspektive für technische Prozesse und Workflows.
- whiteboard: Handgezeichneter Marker-Stil für Erklärungen.
- comic: Lebendige Farben und ausdrucksstarke Charaktere für B2C.
- corporate: Seriös und professionell für Enterprise und Finance.
- modern-3d: Glassmorphism und Gradients für Premium-Produkte.

## Tonalitäten
- professional: Seriös, sachlich, vertrauenswürdig
- friendly: Warm, einladend, zugänglich
- energetic: Dynamisch, begeisternd, motivierend
- serious: Fundiert, wichtig, dringend
- playful: Kreativ, humorvoll, leicht

## Video-Längen
- 30 Sekunden: Social Media, Teaser
- 60 Sekunden: Standard Erklärvideo
- 90 Sekunden: Ausführliche Erklärung
- 120 Sekunden: Detaillierte Produktdemo

## Antwortregel
- Halte deine Antworten kurz und fokussiert (max 3-4 Sätze pro Abschnitt)
- Stelle immer EINE klare Frage pro Nachricht
- Biete Quick-Reply-Optionen an wo sinnvoll
- Nutze Markdown für Formatierung (**fett** für wichtige Begriffe)
- Zeige echtes Interesse an dem Projekt des Nutzers

## Wichtig bei Schritt 5 (Zusammenfassung)
Wenn du alle Infos hast, gib eine strukturierte Empfehlung mit:
- Empfohlener Stil und warum
- Empfohlene Tonalität
- Empfohlene Länge
- Marketing-Strategie-Tipps (wo Video einsetzen)
- Sage "Ich übertrage jetzt meine Empfehlung in das Briefing-Formular..."`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Determine progress based on conversation length
    const userMessages = messages.filter((m: any) => m.role === 'user');
    const progress = Math.min(userMessages.length * 20, 100);

    // Check if we should complete the consultation
    const isNearCompletion = userMessages.length >= 4;

    // Build the messages for the AI
    const aiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m: any) => ({
        role: m.role,
        content: m.content
      }))
    ];

    // Add completion instruction if near end
    if (isNearCompletion) {
      aiMessages.push({
        role: 'system',
        content: `Der Nutzer hat bereits ${userMessages.length} Fragen beantwortet. 
        Wenn du genug Informationen hast (Ziel, Produkt, Zielgruppe), gib jetzt deine finale Empfehlung.
        Beende deine Nachricht mit: "Ich übertrage jetzt meine Empfehlung in das Briefing-Formular..."
        
        Extrahiere dann im JSON-Format:
        - recommendedStyle: einer von [flat-design, isometric, whiteboard, comic, corporate, modern-3d]
        - recommendedTone: einer von [professional, friendly, energetic, serious, playful]
        - recommendedDuration: 30, 60, 90 oder 120
        - targetAudience: Array von Zielgruppen
        - productSummary: Kurze Zusammenfassung des Produkts
        - strategyTips: Array von 3-5 Marketing-Tipps
        - platformTips: Array von 3 Plattform-Empfehlungen`
      });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: aiMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || '';

    // Check if this is the final recommendation
    const isComplete = aiResponse.includes('übertrage') && aiResponse.includes('Briefing');
    
    // Parse recommendation if complete
    let recommendation = null;
    if (isComplete) {
      // Extract recommendation from the response
      recommendation = parseRecommendation(aiResponse, messages);
    }

    // Generate quick replies based on context
    const quickReplies = generateQuickReplies(aiResponse, userMessages.length);

    return new Response(JSON.stringify({
      message: aiResponse,
      progress,
      isComplete,
      recommendation,
      quickReplies
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Explainer consultant error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function parseRecommendation(aiResponse: string, messages: any[]): any {
  // Extract information from conversation
  const allContent = messages.map((m: any) => m.content).join(' ').toLowerCase();
  
  // Determine style based on keywords
  let style = 'flat-design';
  if (allContent.includes('enterprise') || allContent.includes('finance') || allContent.includes('bank')) {
    style = 'corporate';
  } else if (allContent.includes('tech') || allContent.includes('saas') || allContent.includes('software')) {
    style = 'modern-3d';
  } else if (allContent.includes('consumer') || allContent.includes('b2c') || allContent.includes('app')) {
    style = 'comic';
  } else if (allContent.includes('tutorial') || allContent.includes('erklär') || allContent.includes('schulung')) {
    style = 'whiteboard';
  } else if (allContent.includes('workflow') || allContent.includes('prozess')) {
    style = 'isometric';
  }

  // Determine tone
  let tone = 'professional';
  if (allContent.includes('freundlich') || allContent.includes('warm')) {
    tone = 'friendly';
  } else if (allContent.includes('energie') || allContent.includes('dynamisch')) {
    tone = 'energetic';
  } else if (allContent.includes('spaß') || allContent.includes('kreativ')) {
    tone = 'playful';
  }

  // Determine duration
  let duration = 60;
  if (allContent.includes('kurz') || allContent.includes('teaser') || allContent.includes('social')) {
    duration = 30;
  } else if (allContent.includes('ausführlich') || allContent.includes('detail')) {
    duration = 90;
  } else if (allContent.includes('lang') || allContent.includes('komplett')) {
    duration = 120;
  }

  // Extract target audience hints
  const targetAudience = [];
  if (allContent.includes('b2b')) targetAudience.push('B2B Entscheider');
  if (allContent.includes('marketing')) targetAudience.push('Marketing Manager');
  if (allContent.includes('startup')) targetAudience.push('Startups');
  if (allContent.includes('enterprise')) targetAudience.push('Enterprise');
  if (allContent.includes('entwickler') || allContent.includes('developer')) targetAudience.push('Entwickler');
  if (targetAudience.length === 0) targetAudience.push('Allgemeine Zielgruppe');

  // Extract product summary from user messages
  const userMessages = messages.filter((m: any) => m.role === 'user');
  const productSummary = userMessages.length > 1 ? userMessages[1].content.slice(0, 200) : '';

  return {
    recommendedStyle: style,
    recommendedTone: tone,
    recommendedDuration: duration,
    targetAudience,
    productSummary,
    strategyTips: [
      'Auf der Website als Hero-Video einbetten',
      'In E-Mail-Marketing-Kampagnen einsetzen',
      'Bei Sales-Präsentationen nutzen',
      'Auf Social Media als Awareness-Content teilen',
      'Als Teil des Onboardings für neue Kunden'
    ],
    platformTips: [
      'LinkedIn: Als Thought Leadership Content posten',
      'YouTube: Mit SEO-optimiertem Titel und Beschreibung',
      'Website: Als Hero-Video auf der Startseite'
    ]
  };
}

function generateQuickReplies(aiResponse: string, questionCount: number): string[] {
  const lowerResponse = aiResponse.toLowerCase();
  
  // Goal question
  if (lowerResponse.includes('ziel') && questionCount < 1) {
    return ['Mehr Verkäufe generieren', 'Brand Awareness steigern', 'Kundenschulung', 'Produkt erklären'];
  }
  
  // Product type question
  if ((lowerResponse.includes('produkt') || lowerResponse.includes('service')) && questionCount < 2) {
    return ['SaaS / Software', 'Physisches Produkt', 'Dienstleistung', 'Mobile App'];
  }
  
  // Target audience question
  if (lowerResponse.includes('zielgruppe') && questionCount < 3) {
    return ['B2B Unternehmen', 'Endverbraucher (B2C)', 'Startups', 'Enterprise'];
  }
  
  // Industry question
  if (lowerResponse.includes('branche') && questionCount < 4) {
    return ['Tech / IT', 'Finance', 'E-Commerce', 'Healthcare', 'Andere'];
  }
  
  // Style confirmation
  if (lowerResponse.includes('stil') || lowerResponse.includes('design')) {
    return ['Klingt perfekt!', 'Zeig mir Alternativen', 'Erzähl mir mehr'];
  }
  
  // Final confirmation
  if (lowerResponse.includes('übertrage') || lowerResponse.includes('briefing')) {
    return ['Perfekt, weiter!', 'Noch Änderungen'];
  }
  
  return [];
}
