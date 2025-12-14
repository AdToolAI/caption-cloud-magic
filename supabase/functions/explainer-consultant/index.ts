import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const SYSTEM_PROMPT = `Du bist Lisa, eine erfahrene Video-Marketing-Beraterin bei AdTool - dem führenden KI-Tool für Erklärvideos. Du hilfst Nutzern, das perfekte Erklärvideo zu planen mit derselben Qualität wie Loft-Film (€5.000-15.000 Agentur).

## Deine Persönlichkeit
- Freundlich, professionell und enthusiastisch
- Du bist Expertin für Erklärvideos und Marketing
- Du stellst gezielte Fragen um wirklich zu verstehen was der Kunde braucht
- Du gibst konkrete, actionable Empfehlungen

## WICHTIG: 10-Phasen Beratungsablauf
Führe den Nutzer durch alle Phasen in der richtigen Reihenfolge. Stelle PRO NACHRICHT nur 1-2 Fragen.

### Phase 1: Ziel & Erfolg (Frage 1-2)
- "Was ist dein Hauptziel mit diesem Erklärvideo?"
- "Wie definierst du Erfolg? (z.B. mehr Website-Besuche, Verkäufe, Anfragen)"
- Quick Replies: ['Mehr Verkäufe', 'Brand Awareness', 'Kundenschulung', 'Lead-Generierung', 'Produkt erklären']

### Phase 2: Produkt Deep-Dive (Frage 3-4)
- "Was ist dein Produkt/Service genau? Beschreibe es in 2-3 Sätzen."
- "Was sind die 3 wichtigsten Vorteile für deine Kunden?"
- "Was unterscheidet dich von der Konkurrenz (dein USP)?"

### Phase 3: Zielgruppe verstehen (Frage 5-6)
- "Wer ist dein idealer Kunde? (Alter, Beruf, Branche)"
- "Was sind deren größte Probleme/Pain Points, die du löst?"
- "Welche Einwände hören sie typischerweise?"
- Quick Replies: ['B2B Entscheider', 'B2C Konsumenten', 'Startups', 'Enterprise', 'Freelancer']

### Phase 4: Konkurrenz & Inspiration (Frage 7)
- "Welche Marken oder Unternehmen inspirieren dich visuell?"
- "Gibt es Erklärvideos die dir besonders gut gefallen?"

### Phase 5: Visueller Stil (Frage 8)
Zeige die 6 Stil-Optionen und frage welcher am besten passt:
- **Flat Design**: Modern & klar - perfekt für Tech/SaaS
- **Isometrisch**: 3D-Perspektive für Workflows
- **Whiteboard**: Handgezeichnet für Tutorials
- **Comic**: Lebendige Charaktere für B2C
- **Corporate**: Seriös für Enterprise/Finance
- **Modern 3D**: Premium Glassmorphism
- **Custom**: "Keiner passt - ich möchte einen eigenen Stil"

### Phase 6: Custom Style Definition (NUR wenn "Custom" gewählt)
- "Beschreibe deinen Wunsch-Stil in eigenen Worten"
- "Welche Farben soll das Video haben? (Markenfarben?)"
- "Zeig mir gerne Links zu Videos/Bildern die dich inspirieren"

### Phase 7: Charakter-Wunsch (Frage 9)
- "Soll ein Charakter/Maskottchen im Video vorkommen?"
- Wenn ja: "Beschreibe den Charakter (Geschlecht, Alter, Aussehen, Kleidung)"
- Quick Replies: ['Ja, mit Charakter', 'Nein, ohne Charakter', 'Bin mir unsicher']

### Phase 8: Audio-Vorlieben (Frage 10-11)
- "Welche Sprache soll das Video haben?" 
- "Männliche oder weibliche Stimme?"
- "Wie soll die Stimme klingen?" - Quick Replies: ['Freundlich', 'Professionell', 'Energetisch', 'Ruhig']
- "Welche Hintergrundmusik passt am besten?" - Quick Replies: ['Upbeat', 'Entspannt', 'Cinematic', 'Keine Musik']

### Phase 9: Format & Länge (Frage 12)
- "Welches Format brauchst du hauptsächlich?"
- Quick Replies: ['16:9 (YouTube/Website)', '9:16 (TikTok/Reels)', '1:1 (Social Feed)', 'Alle 3 Formate']
- "Welche Länge? 30s (Teaser), 60s (Standard), 90s (Ausführlich), 120s (Detail)"

### Phase 10: Finale Zusammenfassung & Modus-Wahl
Zeige eine strukturierte Empfehlung:
"""
📋 **Meine Empfehlung für dein Erklärvideo:**

🎨 **Visueller Stil**: [Stil] - weil [Begründung]
🎭 **Tonalität**: [Ton] - passend zu [Zielgruppe]
⏱️ **Länge**: [X] Sekunden - ideal für [Plattform]
🗣️ **Stimme**: [Sprache], [Geschlecht], [Stil]
🎵 **Musik**: [Musikstil]
👤 **Charakter**: [Ja/Nein + Details]

📊 **Marketing-Strategie:**
1. [Tipp 1]
2. [Tipp 2]
3. [Tipp 3]

Jetzt hast du zwei Optionen:

🤖 **Full-Service KI-Modus**: Ich erstelle das komplette Video automatisch für dich (~5-10 Minuten). Du lehnst dich zurück und bekommst ein fertiges Loft-Film-Qualitäts-Video.

✋ **Manueller Modus**: Du gehst Schritt für Schritt durch und hast volle Kontrolle über jedes Detail.

Was möchtest du?
"""

## Stil-Empfehlungslogik
- B2B SaaS / Tech → "modern-3d" oder "flat-design"
- Enterprise / Finance / Banking → "corporate"
- Consumer App / B2C → "comic" oder "flat-design"
- Tutorials / Schulung → "whiteboard"
- Premium / Luxury → "modern-3d"
- Startup / Kreativ → "isometric" oder "comic"

## Antwort-Regeln
- Maximal 3-4 Sätze pro Abschnitt
- EINE klare Frage pro Nachricht (außer am Ende)
- Biete Quick-Reply-Optionen an wo sinnvoll
- Nutze **fett** für wichtige Begriffe
- Zeige echtes Interesse am Projekt
- Sei enthusiastisch aber nicht übertrieben

## Bei Schritt 10 (Finale Zusammenfassung)
Wenn du alle Infos hast, zeige die strukturierte Empfehlung und biete die Modus-Wahl an.
Beende mit "Was möchtest du? Full-Service oder Manuell?"`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Determine progress based on conversation
    const userMessages = messages.filter((m: any) => m.role === 'user');
    const messageCount = userMessages.length;
    
    // Map conversation progress to phases (12 questions total)
    const progress = Math.min(Math.round((messageCount / 12) * 100), 100);
    
    // Determine current phase
    let currentPhase = 1;
    if (messageCount >= 2) currentPhase = 2;
    if (messageCount >= 4) currentPhase = 3;
    if (messageCount >= 6) currentPhase = 4;
    if (messageCount >= 7) currentPhase = 5;
    if (messageCount >= 8) currentPhase = 7;
    if (messageCount >= 10) currentPhase = 8;
    if (messageCount >= 11) currentPhase = 9;
    if (messageCount >= 12) currentPhase = 10;

    // Build AI messages
    const aiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m: any) => ({
        role: m.role,
        content: m.content
      }))
    ];

    // Add phase-specific instruction
    if (currentPhase >= 9 && messageCount >= 11) {
      aiMessages.push({
        role: 'system',
        content: `Der Nutzer hat ${messageCount} Fragen beantwortet. Du bist jetzt in Phase 10.
        
        WICHTIG: Gib jetzt deine finale strukturierte Empfehlung mit allen Details:
        - Empfohlener Stil und Begründung
        - Tonalität passend zur Zielgruppe
        - Video-Länge für die Plattform
        - Stimme (Sprache, Geschlecht, Stil)
        - Musik-Empfehlung
        - Charakter Ja/Nein
        - 3 Marketing-Strategie-Tipps
        
        Biete dann die Wahl an: "Full-Service KI-Modus" oder "Manueller Modus"
        
        Wenn der Nutzer "Full-Service" oder "Automatisch" oder "KI" wählt, setze isComplete: true und modeChoice: "full-service"
        Wenn der Nutzer "Manuell" oder "Selbst" wählt, setze isComplete: true und modeChoice: "manual"`
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

    // Check for completion and mode choice
    const isComplete = aiResponse.toLowerCase().includes('full-service') && 
                       (aiResponse.toLowerCase().includes('manuell') || aiResponse.toLowerCase().includes('manual'));
    
    // Check if user chose a mode
    const lastUserMessage = userMessages[userMessages.length - 1]?.content?.toLowerCase() || '';
    let modeChoice: 'full-service' | 'manual' | null = null;
    let finalComplete = false;
    
    if (lastUserMessage.includes('full-service') || lastUserMessage.includes('automatisch') || 
        lastUserMessage.includes('ki modus') || lastUserMessage.includes('mach alles')) {
      modeChoice = 'full-service';
      finalComplete = true;
    } else if (lastUserMessage.includes('manuell') || lastUserMessage.includes('selbst') || 
               lastUserMessage.includes('schritt für schritt')) {
      modeChoice = 'manual';
      finalComplete = true;
    }

    // Parse recommendation
    let recommendation = null;
    if (currentPhase >= 9 || finalComplete) {
      recommendation = parseExtendedRecommendation(messages, aiResponse);
    }

    // Generate context-aware quick replies
    const quickReplies = generateQuickReplies(aiResponse, messageCount, currentPhase);

    return new Response(JSON.stringify({
      message: aiResponse,
      progress,
      currentPhase,
      isComplete: finalComplete,
      modeChoice,
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

function parseExtendedRecommendation(messages: any[], aiResponse: string): any {
  const allContent = messages.map((m: any) => m.content).join(' ').toLowerCase();
  const userMessages = messages.filter((m: any) => m.role === 'user');
  
  // Determine style
  let style = 'flat-design';
  let isCustomStyle = false;
  let customStyleDescription = '';
  
  if (allContent.includes('custom') || allContent.includes('eigenen stil') || allContent.includes('individuell')) {
    style = 'custom';
    isCustomStyle = true;
    // Extract custom description from user messages
    const customMsg = userMessages.find((m: any) => 
      m.content.toLowerCase().includes('stil') || m.content.toLowerCase().includes('design')
    );
    customStyleDescription = customMsg?.content || '';
  } else if (allContent.includes('enterprise') || allContent.includes('finance') || allContent.includes('bank')) {
    style = 'corporate';
  } else if (allContent.includes('tech') || allContent.includes('saas') || allContent.includes('software') || allContent.includes('premium')) {
    style = 'modern-3d';
  } else if (allContent.includes('consumer') || allContent.includes('b2c') || allContent.includes('app') || allContent.includes('spaß')) {
    style = 'comic';
  } else if (allContent.includes('tutorial') || allContent.includes('erklär') || allContent.includes('schulung')) {
    style = 'whiteboard';
  } else if (allContent.includes('workflow') || allContent.includes('prozess') || allContent.includes('startup')) {
    style = 'isometric';
  }

  // Determine tone
  let tone = 'professional';
  if (allContent.includes('freundlich') || allContent.includes('warm') || allContent.includes('friendly')) {
    tone = 'friendly';
  } else if (allContent.includes('energie') || allContent.includes('dynamisch') || allContent.includes('energetisch')) {
    tone = 'energetic';
  } else if (allContent.includes('spaß') || allContent.includes('kreativ') || allContent.includes('spielerisch')) {
    tone = 'playful';
  } else if (allContent.includes('seriös') || allContent.includes('ernst')) {
    tone = 'serious';
  }

  // Determine duration
  let duration = 60;
  if (allContent.includes('30 sek') || allContent.includes('teaser') || allContent.includes('kurz')) {
    duration = 30;
  } else if (allContent.includes('90 sek') || allContent.includes('ausführlich')) {
    duration = 90;
  } else if (allContent.includes('120') || allContent.includes('2 min') || allContent.includes('detail')) {
    duration = 120;
  }

  // Extract target audience
  const targetAudience = [];
  if (allContent.includes('b2b')) targetAudience.push('B2B Entscheider');
  if (allContent.includes('marketing')) targetAudience.push('Marketing Manager');
  if (allContent.includes('startup')) targetAudience.push('Startups');
  if (allContent.includes('enterprise')) targetAudience.push('Enterprise');
  if (allContent.includes('entwickler') || allContent.includes('developer')) targetAudience.push('Entwickler');
  if (allContent.includes('freelancer')) targetAudience.push('Freelancer');
  if (allContent.includes('kmu') || allContent.includes('mittelstand')) targetAudience.push('KMU');
  if (targetAudience.length === 0) targetAudience.push('Allgemeine Zielgruppe');

  // Audio preferences
  let voiceGender: 'male' | 'female' = 'female';
  let voiceStyle = 'friendly';
  let musicStyle = 'upbeat';
  
  if (allContent.includes('männlich') || allContent.includes('male')) voiceGender = 'male';
  if (allContent.includes('professionell')) voiceStyle = 'professional';
  if (allContent.includes('energetisch')) voiceStyle = 'energetic';
  if (allContent.includes('ruhig') || allContent.includes('calm')) voiceStyle = 'calm';
  
  if (allContent.includes('entspannt') || allContent.includes('relaxed')) musicStyle = 'relaxed';
  if (allContent.includes('cinematic') || allContent.includes('episch')) musicStyle = 'cinematic';
  if (allContent.includes('keine musik') || allContent.includes('no music')) musicStyle = 'none';

  // Character preferences
  let hasCharacter = false;
  let characterDescription = '';
  if (allContent.includes('mit charakter') || allContent.includes('maskottchen') || allContent.includes('figur')) {
    hasCharacter = true;
    const charMsg = userMessages.find((m: any) => 
      m.content.toLowerCase().includes('charakter') || m.content.toLowerCase().includes('figur')
    );
    characterDescription = charMsg?.content || '';
  }

  // Format preferences
  let primaryFormat: '16:9' | '9:16' | '1:1' = '16:9';
  let exportAllFormats = false;
  if (allContent.includes('9:16') || allContent.includes('tiktok') || allContent.includes('reels')) {
    primaryFormat = '9:16';
  } else if (allContent.includes('1:1') || allContent.includes('quadrat')) {
    primaryFormat = '1:1';
  }
  if (allContent.includes('alle 3') || allContent.includes('alle formate')) {
    exportAllFormats = true;
  }

  // Product summary
  const productSummary = userMessages.length > 2 ? userMessages[1].content.slice(0, 300) : '';

  // Extract pain points
  const painPoints = [];
  if (allContent.includes('zeit')) painPoints.push('Zeitmangel');
  if (allContent.includes('komplex')) painPoints.push('Komplexität');
  if (allContent.includes('kosten')) painPoints.push('Hohe Kosten');
  if (allContent.includes('aufwand')) painPoints.push('Hoher Aufwand');

  return {
    recommendedStyle: style,
    recommendedTone: tone,
    recommendedDuration: duration,
    targetAudience,
    productSummary,
    isCustomStyle,
    customStyleDescription,
    audioPreferences: {
      language: 'de',
      voiceGender,
      voiceStyle,
      musicStyle,
    },
    characterPreferences: {
      hasCharacter,
      appearance: characterDescription,
    },
    primaryFormat,
    exportAllFormats,
    productDetails: {
      painPointsSolved: painPoints,
    },
    strategyTips: [
      'Auf der Website als Hero-Video einbetten für +40% Conversion',
      'In E-Mail-Marketing-Kampagnen einsetzen für höhere Click-Rates',
      'Bei Sales-Präsentationen nutzen um komplexe Produkte schnell zu erklären',
      'Auf LinkedIn als Thought Leadership Content teilen',
      'Als Teil des Onboardings für neue Kunden verwenden'
    ],
    platformTips: [
      'LinkedIn: Als Thought Leadership Content mit kurzem Teaser-Text',
      'YouTube: Mit SEO-optimiertem Titel und ausführlicher Beschreibung',
      'Website: Als Hero-Video above-the-fold auf der Startseite'
    ]
  };
}

function generateQuickReplies(aiResponse: string, questionCount: number, currentPhase: number): string[] {
  const lowerResponse = aiResponse.toLowerCase();
  
  // Phase 1: Goal
  if (currentPhase === 1) {
    return ['Mehr Verkäufe generieren', 'Brand Awareness steigern', 'Kundenschulung', 'Lead-Generierung', 'Produkt erklären'];
  }
  
  // Phase 2: Product
  if (currentPhase === 2 && (lowerResponse.includes('produkt') || lowerResponse.includes('service'))) {
    return ['SaaS / Software', 'Physisches Produkt', 'Dienstleistung', 'Mobile App', 'Beratung'];
  }
  
  // Phase 3: Target audience
  if (currentPhase === 3) {
    return ['B2B Unternehmen', 'B2C Konsumenten', 'Startups', 'Enterprise', 'KMU'];
  }
  
  // Phase 4: Competition
  if (currentPhase === 4 && lowerResponse.includes('inspir')) {
    return ['Apple / Premium', 'Google / Modern', 'Startup-Stil', 'Corporate / Seriös', 'Keine spezielle'];
  }
  
  // Phase 5: Style
  if (currentPhase === 5 || lowerResponse.includes('stil')) {
    return ['Flat Design', 'Isometrisch', 'Whiteboard', 'Comic', 'Corporate', 'Modern 3D', 'Custom Stil'];
  }
  
  // Phase 7: Character
  if (currentPhase === 7 || lowerResponse.includes('charakter')) {
    return ['Ja, mit Charakter', 'Nein, ohne Charakter', 'Bin mir unsicher'];
  }
  
  // Phase 8: Audio
  if (currentPhase === 8) {
    if (lowerResponse.includes('stimme') || lowerResponse.includes('männlich') || lowerResponse.includes('weiblich')) {
      return ['Weiblich', 'Männlich'];
    }
    if (lowerResponse.includes('musik')) {
      return ['Upbeat', 'Entspannt', 'Cinematic', 'Corporate', 'Keine Musik'];
    }
    return ['Freundlich', 'Professionell', 'Energetisch', 'Ruhig'];
  }
  
  // Phase 9: Format
  if (currentPhase === 9) {
    return ['16:9 (YouTube/Website)', '9:16 (TikTok/Reels)', '1:1 (Social)', 'Alle 3 Formate'];
  }
  
  // Phase 10: Mode choice
  if (currentPhase === 10 || lowerResponse.includes('full-service') || lowerResponse.includes('manuell')) {
    return ['🤖 Full-Service KI-Modus', '✋ Manueller Modus'];
  }
  
  return [];
}
