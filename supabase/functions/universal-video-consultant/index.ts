import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Category-specific system prompts with detailed interview phases
const getCategorySystemPrompt = (category: string, mode: string): string => {
  const categoryPrompts: Record<string, { name: string; phases: string[] }> = {
    'advertisement': {
      name: 'Werbevideo',
      phases: [
        'Hauptziel des Werbevideos (Verkäufe, Leads, Awareness)',
        'Zielgruppe und deren Pain Points',
        'Produkt/Dienstleistung Details',
        'USP - Was macht dich einzigartig?',
        'Emotionaler Hook für den Einstieg',
        'Call-to-Action gewünscht',
        'Stilrichtung (modern, klassisch, dynamisch)',
        'Tonalität (professionell, humorvoll, emotional)',
        'Videolänge und Plattform',
        'Budget und Timeline'
      ]
    },
    'storytelling': {
      name: 'Brand Story',
      phases: [
        'Kernbotschaft deiner Marke',
        'Ursprungsgeschichte des Unternehmens',
        'Werte und Mission',
        'Zielgruppe der Story',
        'Emotionale Reise des Zuschauers',
        'Heldenreise-Struktur gewünscht?',
        'Authentische Momente/Testimonials',
        'Visueller Stil der Story',
        'Musikrichtung und Stimmung',
        'Gewünschte Länge'
      ]
    },
    'tutorial': {
      name: 'Tutorial/How-To',
      phases: [
        'Was soll erklärt werden?',
        'Zielgruppe und Vorwissen',
        'Schritte/Kapitel des Tutorials',
        'Screen-Recording oder Animation?',
        'Sprecher sichtbar oder nur Voice-Over?',
        'Benötigte Materialien/Tools',
        'Schwierigkeitsgrad',
        'Länge pro Abschnitt',
        'Interaktive Elemente gewünscht?',
        'Branding-Elemente'
      ]
    },
    'product-video': {
      name: 'Produktvideo',
      phases: [
        'Welches Produkt wird vorgestellt?',
        'Top 3 Features des Produkts',
        'Problemlösung für den Kunden',
        'Zielgruppe des Produkts',
        'Vergleich zu Alternativen',
        'Preispositionierung',
        'Anwendungsszenarien zeigen?',
        'Packshots und Details',
        'Testimonials einbinden?',
        'Call-to-Action (Kaufen, Testen)'
      ]
    },
    'corporate': {
      name: 'Unternehmensfilm',
      phases: [
        'Zweck des Films (Recruiting, Image, Investor)',
        'Kernwerte des Unternehmens',
        'Teamvorstellung gewünscht?',
        'Standorte/Facilities zeigen?',
        'Unternehmensgeschichte',
        'Zukunftsvision',
        'Interviews mit Führungskräften?',
        'Kundenstimmen einbinden?',
        'Stilrichtung (seriös, modern, nahbar)',
        'Vertriebskanäle'
      ]
    },
    'social-content': {
      name: 'Social Media Content',
      phases: [
        'Zielplattform (TikTok, Reels, Shorts)',
        'Content-Art (Trend, Educational, Entertainment)',
        'Hook in den ersten 3 Sekunden',
        'Scroll-Stopper Idee',
        'Hashtag-Strategie',
        'Musik/Sound gewünscht',
        'Text-Overlays Stil',
        'Posting-Frequenz',
        'Serie oder Einzelvideo?',
        'Engagement-Ziel'
      ]
    },
    'testimonial': {
      name: 'Testimonial Video',
      phases: [
        'Wer gibt das Testimonial?',
        'Problem vor der Lösung',
        'Erfahrung mit dem Produkt/Service',
        'Konkrete Ergebnisse/Zahlen',
        'Emotionale Transformation',
        'Setting des Interviews',
        'B-Roll Material',
        'Länge des Testimonials',
        'Mehrere Testimonials kombinieren?',
        'Call-to-Action'
      ]
    },
    'explainer': {
      name: 'Erklärvideo',
      phases: [
        'Was soll erklärt werden?',
        'Komplexität des Themas',
        'Zielgruppe und Vorwissen',
        'Storytelling-Struktur',
        'Animationsstil gewünscht',
        'Charaktere/Maskottchen?',
        'Metaphern und Visualisierungen',
        'Voice-Over Stil',
        'Musik und Sound Design',
        'Länge und Format'
      ]
    },
    'event': {
      name: 'Event Video',
      phases: [
        'Art des Events',
        'Highlights die gezeigt werden sollen',
        'Interviews mit Teilnehmern?',
        'Live-Mitschnitte oder Recap?',
        'Speaker/Performer vorstellen',
        'Atmosphäre einfangen',
        'Behind-the-Scenes?',
        'Social Media Teaser?',
        'Branding des Events',
        'Verwendungszweck'
      ]
    },
    'promo': {
      name: 'Promo/Teaser',
      phases: [
        'Was wird beworben?',
        'Launch-Datum/Deadline',
        'Mystery oder direkte Ankündigung?',
        'Countdown-Elemente?',
        'Zielgruppe ansprechen',
        'Emotionale Spannung aufbauen',
        'Key Visual/Moment',
        'Musik und Sound',
        'Länge (15s, 30s, 60s)',
        'Vertriebskanäle'
      ]
    },
    'presentation': {
      name: 'Präsentation Video',
      phases: [
        'Präsentationsthema',
        'Zielgruppe (Investoren, Kunden, intern)',
        'Kernargumente',
        'Daten und Statistiken',
        'Visuelle Unterstützung',
        'Sprecher sichtbar?',
        'Interaktive Elemente',
        'Q&A einbinden?',
        'Branding und Design',
        'Länge und Format'
      ]
    },
    'custom': {
      name: 'Custom Video',
      phases: [
        'Beschreibe deine Video-Idee',
        'Zweck und Ziel des Videos',
        'Zielgruppe',
        'Gewünschter Stil',
        'Referenzen oder Inspirationen',
        'Budget und Timeline',
        'Besondere Anforderungen',
        'Technische Specs',
        'Vertriebskanäle',
        'Erfolgskriterien'
      ]
    }
  };

  const cat = categoryPrompts[category] || categoryPrompts['custom'];
  const totalPhases = cat.phases.length;

  return `Du bist Max, ein erfahrener Video-Marketing-Berater bei AdTool. Du führst ein professionelles Beratungsgespräch für ein ${cat.name}.

WICHTIGE REGELN:
1. Stelle IMMER nur EINE Frage pro Nachricht
2. Fasse kurz zusammen, was du verstanden hast, bevor du die nächste Frage stellst
3. Sei freundlich, professionell und konkret
4. Gib Beispiele und Vorschläge basierend auf der Kategorie
5. Nutze Emojis sparsam aber wirkungsvoll
6. Antworte auf Deutsch

VERBOTENE PHRASEN (NIEMALS verwenden):
- "Also ich habe"
- "Ich habe"
- "Also..."
- Keine First-Person-Füllwörter

INTERVIEW-PHASEN für ${cat.name}:
${cat.phases.map((p, i) => `Phase ${i + 1}: ${p}`).join('\n')}

Nach Phase ${totalPhases} fasse alle gesammelten Informationen zusammen und frage, ob der Nutzer bereit ist.

Modus: ${mode === 'full-service' ? 'Full-Service (KI erstellt alles automatisch)' : 'Manuell (Nutzer hat volle Kontrolle)'}

Antworte im JSON-Format mit diesen Feldern:
- message: Deine Nachricht an den Nutzer
- quickReplies: Array mit 3-4 Antwortvorschlägen
- currentPhase: Aktuelle Phase (1-${totalPhases})
- isComplete: true wenn alle Phasen abgeschlossen`;
};

// Calculate progress based on conversation
const calculateProgress = (messages: any[], totalPhases: number): number => {
  const userMessages = messages.filter(m => m.role === 'user').length;
  return Math.min(Math.round((userMessages / totalPhases) * 100), 100);
};

// Extract recommendation from conversation
const extractRecommendation = (messages: any[], category: string) => {
  const userResponses = messages.filter(m => m.role === 'user').map(m => m.content);
  
  return {
    productSummary: userResponses.slice(0, 3).join(' ').substring(0, 200),
    targetAudience: userResponses.length > 1 ? [userResponses[1]?.substring(0, 50) || 'Allgemein'] : ['Allgemein'],
    recommendedStyle: 'modern',
    recommendedTone: 'professional',
    recommendedDuration: 60,
    category
  };
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

    const { messages, category, mode } = await req.json();
    
    console.log(`[universal-video-consultant] Category: ${category}, Mode: ${mode}, Messages: ${messages.length}`);

    const systemPrompt = getCategorySystemPrompt(category, mode);
    const totalPhases = 10; // Standard phases per category

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
        stream: false, // No streaming - return JSON
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[universal-video-consultant] AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit erreicht. Bitte versuche es später erneut.',
          message: 'Entschuldigung, ich bin gerade etwas überlastet. Bitte versuche es in einer Minute erneut.',
          quickReplies: ['Erneut versuchen'],
          progress: 0
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Credits aufgebraucht.',
          message: 'Die Credits sind aufgebraucht. Bitte lade dein Konto auf.',
          quickReplies: ['Credits aufladen'],
          progress: 0
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content || '';
    
    console.log('[universal-video-consultant] AI response:', aiContent.substring(0, 200));

    // Try to parse AI response as JSON
    let parsedResponse: any = null;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                        aiContent.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, aiContent];
      const jsonStr = jsonMatch[1] || aiContent;
      parsedResponse = JSON.parse(jsonStr.trim());
    } catch (e) {
      // AI didn't return valid JSON - extract text response
      console.log('[universal-video-consultant] Parsing as plain text');
    }

    const progress = calculateProgress(messages, totalPhases);
    const isComplete = progress >= 100;

    // Build response
    const responseData = {
      message: parsedResponse?.message || aiContent.replace(/```json[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '').trim(),
      quickReplies: parsedResponse?.quickReplies || generateQuickReplies(messages.length, category),
      progress,
      currentPhase: parsedResponse?.currentPhase || Math.ceil((progress / 100) * totalPhases),
      isComplete,
      recommendation: isComplete ? extractRecommendation(messages, category) : null
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[universal-video-consultant] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      message: 'Entschuldigung, es gab einen technischen Fehler. Bitte versuche es erneut.',
      quickReplies: ['Erneut versuchen', 'Beratung überspringen'],
      progress: 0
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Generate context-aware quick replies
function generateQuickReplies(messageCount: number, category: string): string[] {
  const phase = Math.min(messageCount, 10);
  
  const defaultReplies: Record<number, string[]> = {
    0: ['Mehr Verkäufe erzielen', 'Brand Awareness steigern', 'Kunden informieren', 'Produkt vorstellen'],
    1: ['B2B Entscheider', 'Endkonsumenten', 'Junge Zielgruppe (18-35)', 'Breites Publikum'],
    2: ['Software/App', 'Physisches Produkt', 'Dienstleistung', 'Event/Veranstaltung'],
    3: ['Beste Qualität', 'Günstigster Preis', 'Einzigartige Features', 'Bester Service'],
    4: ['Professionell & seriös', 'Modern & dynamisch', 'Emotional & persönlich', 'Humorvoll & locker'],
    5: ['Jetzt kaufen', 'Kostenlos testen', 'Mehr erfahren', 'Termin buchen'],
    6: ['16:9 Landscape', '9:16 Vertical (Social)', '1:1 Square', 'Alle Formate'],
    7: ['30 Sekunden', '60 Sekunden', '90 Sekunden', '2+ Minuten'],
    8: ['Männliche Stimme', 'Weibliche Stimme', 'Keine Stimme (nur Musik)', 'Egal'],
    9: ['Corporate/Business', 'Upbeat/Energetisch', 'Emotional/Cinematic', 'Minimal/Subtil'],
  };
  
  return defaultReplies[phase] || ['Ja, genau', 'Lass mich erklären...', 'Weiter zur nächsten Frage', 'Zusammenfassung zeigen'];
}
