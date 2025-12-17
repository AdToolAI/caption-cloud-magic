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
- Du stellst gezielte, tiefgehende Fragen um wirklich zu verstehen was der Kunde braucht
- Du gibst konkrete, actionable Empfehlungen

## WICHTIG: 16-Phasen Beratungsablauf (Loft-Film Deep-Dive + Hailuo Animation)
Führe den Nutzer durch ALLE 16 Phasen in der richtigen Reihenfolge. Stelle PRO NACHRICHT nur 1-2 Fragen.

### Phase 1: Ziel & Erfolg
- "Was ist dein Hauptziel mit diesem Erklärvideo?"
- "Wie definierst du Erfolg? (z.B. mehr Website-Besuche, Verkäufe, Anfragen)"
- Quick Replies: ['Mehr Verkäufe', 'Brand Awareness', 'Kundenschulung', 'Lead-Generierung', 'Produkt erklären']

### Phase 2: Das EINE Hauptproblem (KRITISCH!)
- "Was ist das EINE Hauptproblem, das dein Produkt löst?"
- "Beschreibe das Problem so, dass jeder es sofort versteht."
- Dies wird zum emotionalen Kern des Videos!

### Phase 3: Emotionaler Hook
- "Welche Emotion soll der Zuschauer beim Anschauen fühlen?"
- Quick Replies: ['Erleichterung', 'Begeisterung', 'Neugier', 'Vertrauen', 'Dringlichkeit', 'Hoffnung']

### Phase 4: Produkt Deep-Dive
- "Was ist dein Produkt/Service genau? Beschreibe es in 2-3 Sätzen."
- "Was sind die 3 wichtigsten Vorteile für deine Kunden?"
- "Was unterscheidet dich von der Konkurrenz (dein USP)?"

### Phase 5: Zahlen & Statistiken (Glaubwürdigkeit!)
- "Hast du konkrete Zahlen/Statistiken? Z.B. '87% sparen 3h/Woche' oder '500+ zufriedene Kunden'"
- "Welche messbaren Ergebnisse erzielen deine Kunden?"
- Diese Zahlen machen das Video überzeugend!

### Phase 6: Zielgruppe verstehen
- "Wer ist dein idealer Kunde? (Alter, Beruf, Branche)"
- "Was sind deren größte Probleme/Pain Points, die du löst?"
- Quick Replies: ['B2B Entscheider', 'B2C Konsumenten', 'Startups', 'Enterprise', 'Freelancer', 'KMU']

### Phase 7: Konkurrenz & Inspiration
- "Welche Marken oder Unternehmen inspirieren dich visuell?"
- "Gibt es Erklärvideos die dir besonders gut gefallen? (Links gerne!)"

### Phase 8: Markenfarben (Hex-Codes!)
- "Welche Markenfarben hast du? Bitte als Hex-Code (#XXXXXX) oder beschreibe die Farben genau."
- "Primärfarbe, Sekundärfarbe, Akzentfarbe?"
- Quick Replies: ['Gold & Dunkelblau', 'Rot & Weiß', 'Grün & Grau', 'Violett & Rosa', 'Ich habe keine festen Farben']

### Phase 9: Visueller Stil
Zeige die 6 Stil-Optionen:
- **Flat Design**: Modern & klar - perfekt für Tech/SaaS
- **Isometrisch**: 3D-Perspektive für Workflows
- **Whiteboard**: Handgezeichnet für Tutorials
- **Comic**: Lebendige Charaktere für B2C
- **Corporate**: Seriös für Enterprise/Finance
- **Modern 3D**: Premium Glassmorphism
- **Custom**: "Keiner passt - ich möchte einen eigenen Stil"

### Phase 10: Animations-Qualität (EMPFOHLEN: Premium KI-Animation!)
- "Für garantierte 95%+ Loft-Film-Qualität empfehle ich Premium KI-Animationen mit Hailuo 2.3!"
- Erkläre: Premium KI-Animation = echte Charakterbewegung, Lip-Sync zur Stimme, lebendige Szenen (~150 zusätzliche Credits, aber Loft-Film-Niveau garantiert)
- "Standard (Ken Burns)" ist schneller aber ohne bewegte Figuren
- Quick Replies: ['✨ Premium KI-Animation (empfohlen)', 'Standard (Ken Burns - schneller)', 'Was ist der Unterschied?']

### Phase 11: Charakter-Wunsch
- "Soll ein Charakter/Maskottchen im Video vorkommen?"
- Wenn ja: "Beschreibe den Charakter (Geschlecht, Alter, Aussehen, Kleidung)"
- Quick Replies: ['Ja, mit Charakter', 'Nein, ohne Charakter', 'Bin mir unsicher']

### Phase 12: Audio-Vorlieben
- "Welche Sprache soll das Video haben?" 
- "Männliche oder weibliche Stimme?"
- "Wie soll die Stimme klingen?" - Quick Replies: ['Freundlich', 'Professionell', 'Energetisch', 'Ruhig']
- "Welche Hintergrundmusik passt?" - Quick Replies: ['Upbeat', 'Entspannt', 'Cinematic', 'Keine Musik']

### Phase 13: Format & Länge
- "Welches Format brauchst du hauptsächlich?"
- Quick Replies: ['16:9 (YouTube/Website)', '9:16 (TikTok/Reels)', '1:1 (Social Feed)', 'Alle 3 Formate']
- "Welche Länge? 30s (Teaser), 60s (Standard), 90s (Ausführlich), 120s (Detail)"

### Phase 14: Der Intro-Hook (Die ersten 3 Sekunden!)
- "Wie lautet dein Intro-Hook-Satz? Das ist der ERSTE Satz, der sofort Aufmerksamkeit fängt!"
- "Beispiele: 'Stell dir vor, du könntest...' oder 'Das größte Problem bei X ist...' oder '90% aller Y machen diesen Fehler...'"
- Dies entscheidet, ob Zuschauer weiterschauen!

### Phase 15: Exakter CTA-Text
- "Was ist dein exakter CTA-Text? Z.B. 'Jetzt kostenlos testen' oder 'Demo anfordern'"
- "Welche URL soll im CTA erscheinen?"
- Quick Replies: ['Jetzt kostenlos testen', 'Demo anfordern', 'Mehr erfahren', 'Jetzt kaufen']

### Phase 16: Finale Zusammenfassung & Modus-Wahl
Zeige eine strukturierte Empfehlung mit ALLEN gesammelten Informationen:
"""
📋 **Meine Empfehlung für dein Loft-Film-Niveau Erklärvideo:**

🎯 **Kernproblem**: [Das EINE Problem]
💡 **Emotionaler Hook**: [Gewünschte Emotion]
📊 **Zahlen/Stats**: [Statistiken für Glaubwürdigkeit]

🎨 **Visueller Stil**: [Stil] - weil [Begründung]
🎭 **Tonalität**: [Ton] - passend zu [Zielgruppe]
⏱️ **Länge**: [X] Sekunden - ideal für [Plattform]
🎨 **Markenfarben**: [Farben mit Hex]
🗣️ **Stimme**: [Sprache], [Geschlecht], [Stil]
🎵 **Musik**: [Musikstil]
👤 **Charakter**: [Ja/Nein + Details]

🎬 **Intro-Hook**: "[Der erste Satz]"
🔗 **CTA**: "[CTA-Text]" → [URL]

📊 **Marketing-Strategie:**
1. [Tipp 1]
2. [Tipp 2]
3. [Tipp 3]

Jetzt hast du zwei Optionen:

🤖 **Full-Service KI-Modus**: Ich erstelle das komplette Video automatisch (~5-10 Minuten). Du bekommst ein fertiges Loft-Film-Qualitäts-Video.

✋ **Manueller Modus**: Du gehst Schritt für Schritt durch mit voller Kontrolle über jedes Detail.

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
- Bei Phase 15 ALLE gesammelten Infos zusammenfassen`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Determine progress based on conversation (16 phases now with Animation Quality)
    const userMessages = messages.filter((m: any) => m.role === 'user');
    const messageCount = userMessages.length;
    
    // Map conversation progress to 16 phases
    const progress = Math.min(Math.round((messageCount / 16) * 100), 100);
    
    // Determine current phase (16 phases with Animation Quality at 9.5)
    let currentPhase = 1;
    if (messageCount >= 1) currentPhase = 2;   // Core Problem
    if (messageCount >= 2) currentPhase = 3;   // Emotional Hook
    if (messageCount >= 3) currentPhase = 4;   // Product Deep-Dive
    if (messageCount >= 4) currentPhase = 5;   // Stats & Numbers
    if (messageCount >= 5) currentPhase = 6;   // Target Audience
    if (messageCount >= 6) currentPhase = 7;   // Competition
    if (messageCount >= 7) currentPhase = 8;   // Brand Colors
    if (messageCount >= 8) currentPhase = 9;   // Visual Style
    if (messageCount >= 9) currentPhase = 10;  // Animation Quality (Hailuo 2.3) - NEW!
    if (messageCount >= 10) currentPhase = 11; // Character
    if (messageCount >= 11) currentPhase = 12; // Audio
    if (messageCount >= 12) currentPhase = 13; // Format & Length
    if (messageCount >= 13) currentPhase = 14; // Intro Hook
    if (messageCount >= 14) currentPhase = 15; // CTA
    if (messageCount >= 15) currentPhase = 16; // Final Summary

    // Build AI messages
    const aiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m: any) => ({
        role: m.role,
        content: m.content
      }))
    ];

    // Add phase-specific instruction for final phase (now Phase 16)
    if (currentPhase >= 15 && messageCount >= 14) {
      aiMessages.push({
        role: 'system',
        content: `Der Nutzer hat ${messageCount} Fragen beantwortet. Du bist jetzt in Phase 15 (Finale Zusammenfassung).
        
        WICHTIG: Gib jetzt deine finale strukturierte Empfehlung mit ALLEN gesammelten Details:
        - Das EINE Kernproblem
        - Emotionaler Hook / gewünschte Emotion
        - Zahlen/Statistiken für Glaubwürdigkeit
        - Empfohlener Stil und Begründung
        - Markenfarben (mit Hex-Codes wenn angegeben)
        - Tonalität passend zur Zielgruppe
        - Video-Länge für die Plattform
        - Stimme (Sprache, Geschlecht, Stil)
        - Musik-Empfehlung
        - Charakter Ja/Nein
        - Der Intro-Hook-Satz (erste 3 Sekunden!)
        - Der exakte CTA-Text und URL
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

  // 🎬 NEW: Extract Core Problem (Phase 2)
  let coreProblem = '';
  const problemMsg = userMessages.find((m: any, idx: number) => idx >= 1 && idx <= 2);
  if (problemMsg) coreProblem = problemMsg.content.slice(0, 200);

  // 🎬 NEW: Extract Emotional Hook (Phase 3)
  let emotionalHook = '';
  if (allContent.includes('erleichterung')) emotionalHook = 'Erleichterung';
  else if (allContent.includes('begeisterung')) emotionalHook = 'Begeisterung';
  else if (allContent.includes('neugier')) emotionalHook = 'Neugier';
  else if (allContent.includes('vertrauen')) emotionalHook = 'Vertrauen';
  else if (allContent.includes('dringlichkeit')) emotionalHook = 'Dringlichkeit';
  else if (allContent.includes('hoffnung')) emotionalHook = 'Hoffnung';

  // 🎬 NEW: Extract Stats & Numbers (Phase 5)
  const statsAndNumbers: string[] = [];
  const percentMatch = allContent.match(/(\d+%[^.]*)/g);
  if (percentMatch) statsAndNumbers.push(...percentMatch.slice(0, 3));
  const numberMatch = allContent.match(/(\d+\+?\s*(kunden|nutzer|user|prozent|mal|x\s*schneller))/gi);
  if (numberMatch) statsAndNumbers.push(...numberMatch.slice(0, 3));

  // 🎬 NEW: Extract Brand Colors (Phase 8)
  const brandColors: { primary?: string; secondary?: string; accent?: string } = {};
  const hexMatch = allContent.match(/#[0-9a-fA-F]{6}/g);
  if (hexMatch) {
    if (hexMatch[0]) brandColors.primary = hexMatch[0];
    if (hexMatch[1]) brandColors.secondary = hexMatch[1];
    if (hexMatch[2]) brandColors.accent = hexMatch[2];
  }
  // Named colors
  if (allContent.includes('gold')) brandColors.primary = brandColors.primary || '#F5C76A';
  if (allContent.includes('dunkelblau') || allContent.includes('navy')) brandColors.secondary = brandColors.secondary || '#0f172a';
  if (allContent.includes('cyan') || allContent.includes('türkis')) brandColors.accent = brandColors.accent || '#22d3ee';

  // 🎬 NEW: Extract Intro Hook (Phase 13)
  let introHookSentence = '';
  const hookMsg = userMessages.find((m: any) => 
    m.content.toLowerCase().includes('stell dir vor') ||
    m.content.toLowerCase().includes('das größte problem') ||
    m.content.toLowerCase().includes('% aller') ||
    m.content.length > 30 && userMessages.indexOf(m) >= 11
  );
  if (hookMsg) introHookSentence = hookMsg.content.slice(0, 150);

  // 🎬 NEW: Extract CTA (Phase 14)
  let ctaText = '';
  let ctaUrl = '';
  if (allContent.includes('jetzt kostenlos testen')) ctaText = 'Jetzt kostenlos testen';
  else if (allContent.includes('demo anfordern')) ctaText = 'Demo anfordern';
  else if (allContent.includes('mehr erfahren')) ctaText = 'Mehr erfahren';
  else if (allContent.includes('jetzt kaufen')) ctaText = 'Jetzt kaufen';
  else if (allContent.includes('jetzt starten')) ctaText = 'Jetzt starten';
  // Extract URL
  const urlMatch = allContent.match(/([a-zA-Z0-9-]+\.(com|de|io|ai|co|net)[^\s]*)/);
  if (urlMatch) ctaUrl = urlMatch[0];

  // 🎬 Phase 6: Animation Quality Detection - DEFAULT TO PREMIUM for 95%+ Loft-Film Quality
  // Hailuo 2.3 is now ENABLED BY DEFAULT for guaranteed premium quality
  let animationQuality: 'standard' | 'premium' | 'animated' = 'premium';
  let enableHailuoAnimation = true; // ✅ DEFAULT: true for 95%+ quality
  
  // User can OPT-OUT to standard if they explicitly choose "Standard"
  if (allContent.includes('standard') && (allContent.includes('ken burns') || allContent.includes('standard animation'))) {
    animationQuality = 'standard';
    enableHailuoAnimation = false;
  }
  
  // Explicit premium/KI-Animation confirmations
  if (allContent.includes('ki-animation') || allContent.includes('premium animation') || 
      allContent.includes('hailuo') || allContent.includes('lip-sync') ||
      allContent.includes('echte bewegung') || allContent.includes('premium')) {
    animationQuality = 'premium';
    enableHailuoAnimation = true;
  }

  return {
    recommendedStyle: style,
    recommendedTone: tone,
    recommendedDuration: duration,
    targetAudience,
    productSummary,
    isCustomStyle,
    customStyleDescription,
    // 🎬 NEW: Loft-Film Deep-Dive Fields
    coreProblem,
    emotionalHook,
    statsAndNumbers,
    brandColors,
    introHookSentence,
    ctaText,
    ctaUrl,
    preferredFont: 'poppins', // Default to modern 2028 font
    // ✅ Phase 1: Animation Quality from Interview
    animationQuality,
    enableHailuoAnimation,
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
  
  // Phase 3: Emotional Hook
  if (currentPhase === 3) {
    return ['Erleichterung', 'Begeisterung', 'Neugier', 'Vertrauen', 'Dringlichkeit', 'Hoffnung'];
  }
  
  // Phase 6: Target Audience
  if (currentPhase === 6) {
    return ['B2B Entscheider', 'B2C Konsumenten', 'Startups', 'Enterprise', 'KMU', 'Freelancer'];
  }
  
  // Phase 8: Brand Colors
  if (currentPhase === 8) {
    return ['Gold & Dunkelblau', 'Rot & Weiß', 'Grün & Grau', 'Violett & Rosa', 'Ich habe keine festen Farben'];
  }
  
  // Phase 9: Style
  if (currentPhase === 9 || lowerResponse.includes('stil')) {
    return ['Flat Design', 'Isometrisch', 'Whiteboard', 'Comic', 'Corporate', 'Modern 3D'];
  }
  
  // Phase 10: Animation Quality (Hailuo 2.3) - PREMIUM DEFAULT
  if (currentPhase === 10 || lowerResponse.includes('animation') || lowerResponse.includes('ki-animation') || lowerResponse.includes('hailuo')) {
    return ['✨ Premium KI-Animation (empfohlen)', 'Standard (Ken Burns - schneller)', 'Was ist der Unterschied?'];
  }
  
  // Phase 11: Character
  if (currentPhase === 11 || lowerResponse.includes('charakter')) {
    return ['Ja, mit Charakter', 'Nein, ohne Charakter', 'Bin mir unsicher'];
  }
  
  // Phase 12: Audio
  if (currentPhase === 12) {
    if (lowerResponse.includes('stimme')) return ['Weiblich', 'Männlich'];
    if (lowerResponse.includes('musik')) return ['Upbeat', 'Entspannt', 'Cinematic', 'Keine Musik'];
    return ['Freundlich', 'Professionell', 'Energetisch', 'Ruhig'];
  }
  
  // Phase 13: Format
  if (currentPhase === 13) {
    return ['16:9 (YouTube/Website)', '9:16 (TikTok/Reels)', '1:1 (Social)', 'Alle 3 Formate'];
  }
  
  // Phase 15: CTA
  if (currentPhase === 15) {
    return ['Jetzt kostenlos testen', 'Demo anfordern', 'Mehr erfahren', 'Jetzt kaufen'];
  }
  
  // Phase 16: Mode choice
  if (currentPhase === 16 || lowerResponse.includes('full-service') || lowerResponse.includes('manuell')) {
    return ['🤖 Full-Service KI-Modus', '✋ Manueller Modus'];
  }
  
  return [];
}
