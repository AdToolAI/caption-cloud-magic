import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 22-phase interview structure for each category - comprehensive briefing for filmreifes Skript
const CATEGORY_PHASES: Record<string, { name: string; phases: string[] }> = {
  'advertisement': {
    name: 'Werbevideo',
    phases: [
      'Hauptziel des Videos (Verkäufe steigern, Leads generieren, Brand Awareness)',
      'Das EINE Hauptproblem, das dein Produkt/Service löst (emotional beschreiben!)',
      'Der wichtigste Nutzen für deine Kunden',
      'Produkt/Service Deep-Dive: Was genau ist es? (2-3 Sätze)',
      'Top 3 Features/Vorteile deines Angebots',
      'USP: Was macht dich EINZIGARTIG gegenüber der Konkurrenz?',
      'Konkrete Zahlen/Statistiken zur Glaubwürdigkeit (z.B. "500+ zufriedene Kunden")',
      'Zielgruppe Details: Alter, Beruf, Branche, Interessen',
      'Pain Points der Zielgruppe: Welche Frustrationen haben sie?',
      'Emotionaler Hook: Welche Emotion soll das Video auslösen?',
      'Konkurrenz & Inspiration: Kennst du Referenz-Videos die dir gefallen?',
      'Markenfarben: Hex-Codes deiner Brand Colors',
      'Visueller Stil: Modern, Klassisch, Dynamisch, Minimalistisch?',
      'Tonalität: Professionell, Humorvoll, Emotional, Provokant?',
      'Animations-Qualität: Premium KI-Generierung oder Standard-Templates?',
      'Charakter/Maskottchen: Soll eine animierte Figur vorkommen?',
      'Audio: Sprache (DE/EN), Stimme (männlich/weiblich), Sprechstil',
      'Hintergrundmusik: Welcher Stil? (Corporate, Upbeat, Emotional, Cinematic)',
      'Format: 16:9 (YouTube), 9:16 (TikTok/Reels), 1:1 (Instagram)?',
      'Videolänge: 30s, 60s, 90s oder 120s?',
      'Der Intro-Hook: Was passiert in den ersten 3 Sekunden um Aufmerksamkeit zu gewinnen?',
      'Exakter CTA-Text und URL: Was sollen Zuschauer am Ende tun?'
    ]
  },
  'storytelling': {
    name: 'Brand Story',
    phases: [
      'Die Kernbotschaft deiner Marke in einem Satz',
      'Ursprungsgeschichte: Wie ist dein Unternehmen entstanden?',
      'Das EINE Problem, das zur Gründung geführt hat',
      'Deine Mission: Warum existiert dein Unternehmen?',
      'Deine Vision: Wo wollt ihr in 5 Jahren stehen?',
      'Top 3 Werte, die dein Unternehmen ausmachen',
      'Wer ist der "Held" der Story? (Gründer, Kunde, Team)',
      'Die größte Herausforderung auf dem Weg zum Erfolg',
      'Der Wendepunkt: Wann wurde aus der Idee Realität?',
      'Emotionale Höhepunkte: Welche Momente berühren?',
      'Authentische Kundengeschichten oder Testimonials',
      'Team-Vorstellung gewünscht? Wer sollte gezeigt werden?',
      'Visuelle Metaphern: Welche Bilder passen zur Story?',
      'Markenfarben und visuelle Identität',
      'Musik-Stil: Episch, Emotional, Inspirierend?',
      'Voice-Over Stil: Warm, Professionell, Persönlich?',
      'Format und Plattformen für die Veröffentlichung',
      'Gewünschte Videolänge (60s, 90s, 2min, 3min+)',
      'B-Roll Material: Was soll gezeigt werden?',
      'Der perfekte Einstieg: Wie beginnt die Story?',
      'Der emotionale Höhepunkt: Was ist der Climax?',
      'Das Finale: Wie endet die Story? Welcher CTA?'
    ]
  },
  'tutorial': {
    name: 'Tutorial/How-To',
    phases: [
      'Was genau soll erklärt/gezeigt werden?',
      'Zielgruppe: Anfänger, Fortgeschrittene oder Experten?',
      'Vorwissen: Was müssen Zuschauer bereits können?',
      'Lernziel: Was können Zuschauer nach dem Video?',
      'Schritte/Kapitel: Wie ist das Tutorial strukturiert?',
      'Schwierigkeitsgrad: Einfach, Mittel, Komplex?',
      'Screen-Recording, Animation oder Mix?',
      'Sprecher sichtbar oder nur Voice-Over?',
      'Benötigte Tools/Materialien die gezeigt werden',
      'Häufige Fehler die vermieden werden sollten',
      'Pro-Tipps und Shortcuts für Fortgeschrittene',
      'Interaktive Elemente: Quiz, Pausen, Übungen?',
      'Zoom-Effekte für wichtige Details?',
      'Text-Overlays und Beschriftungen',
      'Markenfarben und Branding-Elemente',
      'Voice-Over Stil: Lehrerhaft, Freundlich, Technisch?',
      'Hintergrundmusik: Ja/Nein? Welcher Stil?',
      'Format: Horizontal oder Vertical?',
      'Länge pro Abschnitt/Kapitel',
      'Gesamtlänge des Tutorials',
      'Intro: Wie stellst du das Thema vor?',
      'Outro: CTA, weitere Ressourcen, nächste Schritte'
    ]
  },
  'product-video': {
    name: 'Produktvideo',
    phases: [
      'Welches Produkt wird vorgestellt? Name und Art',
      'Produktkategorie und Branche',
      'Das EINE Hauptproblem das es löst',
      'Top 3 Features des Produkts',
      'Technische Spezifikationen wenn relevant',
      'Preispositionierung: Premium, Mittelklasse, Budget?',
      'USP: Was macht dieses Produkt einzigartig?',
      'Zielgruppe: Wer kauft dieses Produkt?',
      'Anwendungsszenarien: Wann/Wie wird es genutzt?',
      'Vorher-Nachher: Transformation durch das Produkt',
      'Social Proof: Bewertungen, Awards, Testimonials',
      'Vergleich zu Alternativen/Konkurrenz',
      'Packshot-Anforderungen: 360°, Details, Explosionszeichnung?',
      'Lifestyle-Szenen: Produkt in Aktion zeigen?',
      'Markenfarben und Produktdesign-Stil',
      'Visueller Stil: Clean, Luxus, Dynamisch?',
      'Voice-Over oder Text-Only?',
      'Musik-Stil passend zum Produkt',
      'Format für welche Plattform?',
      'Videolänge: 15s, 30s, 60s?',
      'Hook: Wie wird Interesse geweckt?',
      'CTA: Kaufen, Testen, Mehr erfahren?'
    ]
  },
  'corporate': {
    name: 'Unternehmensfilm',
    phases: [
      'Hauptzweck: Recruiting, Imagefilm, Investoren-Pitch?',
      'Kernbotschaft über das Unternehmen',
      'Gründungsjahr und Unternehmensgeschichte',
      'Branche und Marktposition',
      'Mitarbeiterzahl und Standorte',
      'Top 3 Unternehmenswerte',
      'Mission Statement',
      'Vision und Zukunftspläne',
      'Besondere Errungenschaften und Meilensteine',
      'Team-Vorstellung: Wer sollte gezeigt werden?',
      'Interviews mit Führungskräften gewünscht?',
      'Standorte/Facilities die gezeigt werden sollen',
      'Arbeitsatmosphäre und Unternehmenskultur',
      'Kundenstimmen einbinden?',
      'Soziale Verantwortung/Nachhaltigkeit',
      'Markenfarben und Corporate Design',
      'Stilrichtung: Seriös, Modern, Nahbar?',
      'Voice-Over oder Interview-Stil?',
      'Musik: Corporate, Inspirierend, Modern?',
      'Format und Hauptplattform',
      'Videolänge: 90s, 2min, 3min+?',
      'CTA: Bewerben, Kontaktieren, Kennenlernen?'
    ]
  },
  'social-content': {
    name: 'Social Media Content',
    phases: [
      'Zielplattform: TikTok, Instagram Reels, YouTube Shorts?',
      'Content-Art: Trend, Educational, Entertainment, Behind-the-Scenes?',
      'Thema/Botschaft des Videos',
      'Zielgruppe auf dieser Plattform',
      'Hook in den ersten 1-3 Sekunden - was stoppt den Scroll?',
      'Scroll-Stopper Idee: Überraschung, Frage, Kontroverse?',
      'Storytelling-Bogen trotz kurzer Länge',
      'Text-Overlays: Ja/Nein? Welcher Stil?',
      'Trending Audio/Sound verwenden oder eigene Musik?',
      'Hashtag-Strategie: Welche Hashtags?',
      'Caption-Stil für das Posting',
      'Interaktions-Aufforderung: Kommentar, Share, Follow?',
      'Serie oder Einzelvideo? Wiederkehrendes Format?',
      'Markenfarben und Wiedererkennungswert',
      'Face-to-Camera oder nur Produkt/Animation?',
      'Schnittgeschwindigkeit: Schnell, Medium, Langsam?',
      'Transitions: Trendy, Clean, Kreativ?',
      'Untertitel: Ja/Nein? Animiert?',
      'Optimal Posting-Zeit berücksichtigen?',
      'Videolänge: 15s, 30s, 60s?',
      'Der perfekte Einstieg-Hook?',
      'CTA am Ende: Follow, Link in Bio, Kommentar?'
    ]
  },
  'testimonial': {
    name: 'Testimonial Video',
    phases: [
      'Wer gibt das Testimonial? Name, Position, Unternehmen',
      'Beziehung zum Produkt/Service: Kunde, Partner, Mitarbeiter?',
      'Problem VOR der Nutzung des Produkts/Service',
      'Wie wurde das Problem bisher gelöst (oder nicht)?',
      'Der Entscheidungsmoment: Warum dieses Produkt?',
      'Die Erfahrung während der Nutzung',
      'Konkrete Ergebnisse: Zahlen, Zeitersparnis, ROI',
      'Emotionale Transformation: Wie fühlt sich der Kunde jetzt?',
      'Überraschende Benefits die nicht erwartet wurden',
      'Würde der Kunde weiterempfehlen? Warum?',
      'Lieblingszitat oder Kernaussage',
      'Setting des Interviews: Büro, Zuhause, Neutral?',
      'Kleidung und Erscheinung des Sprechers',
      'B-Roll Material: Produkt in Aktion, Arbeitsplatz?',
      'Zusätzliche Testimonials kombinieren?',
      'Markenfarben und Branding-Elemente',
      'Lower Thirds: Name, Position, Unternehmen?',
      'Musik: Dezent im Hintergrund oder ohne?',
      'Format: Horizontal oder auch Vertical?',
      'Länge: 30s, 60s, 90s?',
      'Hook: Stärkstes Statement am Anfang?',
      'CTA: Was sollen Zuschauer nach dem Video tun?'
    ]
  },
  'explainer': {
    name: 'Erklärvideo',
    phases: [
      'Was genau soll erklärt werden?',
      'Komplexität des Themas: Einfach, Mittel, Komplex?',
      'Zielgruppe: Wer soll es verstehen?',
      'Vorwissen: Was wissen Zuschauer bereits?',
      'Das EINE Hauptproblem das angesprochen wird',
      'Die Lösung: Wie löst dein Produkt/Service das Problem?',
      'Top 3 Vorteile der Lösung',
      'Storytelling-Struktur: Problem-Lösung-Benefit?',
      'Metaphern und Analogien zur Vereinfachung',
      'Animationsstil: Flat Design, Isometric, Whiteboard, 3D?',
      'Charaktere/Maskottchen: Ja/Nein? Welcher Typ?',
      'Farbpalette und Markenfarben',
      'Icon-Stil und visuelle Sprache',
      'Voice-Over: Männlich/Weiblich? Tonalität?',
      'Sprache: Deutsch, Englisch, Mehrsprachig?',
      'Musik: Stil und Stimmung',
      'Sound Design: Whooshes, Pops, Transitions?',
      'Text-Elemente: Bullet Points, Keywords?',
      'Format: 16:9, 9:16, 1:1?',
      'Videolänge: 60s, 90s, 120s?',
      'Hook: Wie startet das Video?',
      'CTA: Was ist die gewünschte Handlung?'
    ]
  },
  'event': {
    name: 'Event Video',
    phases: [
      'Art des Events: Konferenz, Launch, Feier, Messe?',
      'Name und Datum des Events',
      'Hauptzielgruppe des Event-Videos',
      'Zweck: Recap, Teaser für nächstes Jahr, Dokumentation?',
      'Highlights die unbedingt gezeigt werden müssen',
      'Keynote Speaker/Performers vorstellen?',
      'Interviews mit Teilnehmern gewünscht?',
      'Behind-the-Scenes Material?',
      'Networking-Momente und Atmosphäre',
      'Branding des Events: Farben, Logo, Motto',
      'Sponsoren die sichtbar sein sollen?',
      'Live-Mitschnitte oder professionelle Aufnahmen?',
      'Drohnenaufnahmen oder Special Shots?',
      'Zeitraffer für Auf-/Abbau?',
      'Musik: Event-Musik oder eigener Soundtrack?',
      'Voice-Over oder nur Musik/O-Töne?',
      'Text-Overlays: Speaker-Namen, Zahlen, Quotes?',
      'Format für welche Plattform?',
      'Videolänge: Teaser (30s), Recap (2-3min)?',
      'Social Media Cutdowns benötigt?',
      'Der emotionale Höhepunkt des Events?',
      'CTA: Tickets fürs nächste Jahr, Follow, Newsletter?'
    ]
  },
  'promo': {
    name: 'Promo/Teaser',
    phases: [
      'Was wird beworben? Produkt, Event, Launch, Sale?',
      'Launch-Datum oder Deadline',
      'Mystery-Teaser oder direkte Ankündigung?',
      'Das EINE Hauptversprechen',
      'Spannung aufbauen: Wie?',
      'Countdown-Elemente gewünscht?',
      'Exklusivität betonen? Limited Edition, Early Access?',
      'Zielgruppe die erreicht werden soll',
      'Emotionen: Aufregung, Neugier, FOMO?',
      'Key Visual/Moment der im Gedächtnis bleibt',
      'Markenfarben und visuelle Identität',
      'Stilrichtung: Cinematic, Dynamisch, Elegant?',
      'Schnittgeschwindigkeit: Schnell, Build-up?',
      'Musik: Dramatic, Upbeat, Electronic?',
      'Sound Design: Transitions, Impacts?',
      'Voice-Over oder Text-Only?',
      'Text-Animations-Stil',
      'Format: Wo wird der Teaser ausgespielt?',
      'Videolänge: 15s, 30s, 45s?',
      'Der perfekte Hook in Sekunde 1',
      'Das große Reveal: Wann und wie?',
      'CTA: Save the Date, Pre-Order, Link?'
    ]
  },
  'presentation': {
    name: 'Präsentation Video',
    phases: [
      'Präsentationsthema und Titel',
      'Zielgruppe: Investoren, Kunden, Intern, Öffentlich?',
      'Hauptziel der Präsentation',
      'Kernthese in einem Satz',
      'Top 3 Argumente/Punkte',
      'Daten, Statistiken, Belege',
      'Visualisierung: Charts, Grafiken, Infografiken?',
      'Storytelling-Element einbauen?',
      'Case Studies oder Beispiele',
      'Sprecher sichtbar (Picture-in-Picture) oder nur Slides?',
      'Interaktive Elemente oder linear?',
      'Q&A Section am Ende?',
      'Slide-Design und Markenfarben',
      'Animations-Stil für Übergänge',
      'Voice-Over: Live aufgenommen oder nachvertont?',
      'Tonalität: Formell, Casual, Inspirierend?',
      'Hintergrundmusik dezent einsetzen?',
      'Text-Highlights und Bullet Points',
      'Format: 16:9 Standard oder angepasst?',
      'Videolänge: 5min, 10min, 15min+?',
      'Der perfekte Einstieg: Wie beginnst du?',
      'CTA: Kontakt, Follow-up, Entscheidung?'
    ]
  },
  'custom': {
    name: 'Custom Video',
    phases: [
      'Beschreibe deine Video-Idee in 2-3 Sätzen',
      'Welches Ziel soll das Video erreichen?',
      'Wer ist die Zielgruppe?',
      'Welches Problem löst oder welche Botschaft vermittelt es?',
      'Gibt es Referenzen oder Inspirationen?',
      'Gewünschter visueller Stil?',
      'Real-Footage, Animation oder Mix?',
      'Charaktere oder Sprecher involviert?',
      'Storytelling-Struktur: Linear, Non-linear?',
      'Emotionale Wirkung: Was sollen Zuschauer fühlen?',
      'Markenfarben und Branding-Elemente',
      'Musik-Stil und Stimmung',
      'Voice-Over gewünscht? Welche Art?',
      'Sound Design Anforderungen',
      'Text-Elemente und Typografie',
      'Besondere visuelle Effekte?',
      'Format für welche Plattform(en)?',
      'Gewünschte Videolänge',
      'Budget-Rahmen für Produktion',
      'Timeline: Bis wann wird es benötigt?',
      'Der perfekte Einstieg ins Video?',
      'CTA und gewünschte Handlung am Ende'
    ]
  }
};

// Get category config with fallback
const getCategoryConfig = (category: string) => {
  return CATEGORY_PHASES[category] || CATEGORY_PHASES['custom'];
};

// Generate comprehensive system prompt for 22 phases
const getCategorySystemPrompt = (category: string, mode: string, currentPhase: number): string => {
  const cat = getCategoryConfig(category);
  const totalPhases = 22;

  let phaseInstructions = '';
  if (currentPhase < 22) {
    phaseInstructions = `
Du bist aktuell in PHASE ${currentPhase}/22.
Die aktuelle Frage behandelt: "${cat.phases[currentPhase - 1] || 'Letzte Details'}"

NÄCHSTE SCHRITTE:
${cat.phases.slice(currentPhase, currentPhase + 3).map((p, i) => `- Phase ${currentPhase + i + 1}: ${p}`).join('\n')}
`;
  } else {
    phaseInstructions = `
Du bist in PHASE 22/22 - FINALE ZUSAMMENFASSUNG!
Fasse ALLE gesammelten Informationen strukturiert zusammen und frage ob der Nutzer bereit ist, das Video zu erstellen.
`;
  }

  return `Du bist Max, ein erfahrener Video-Marketing-Berater und Kreativdirektor bei AdTool.
Du führst ein VOLLSTÄNDIGES 22-Phasen Beratungsgespräch für ein professionelles ${cat.name}.

═══════════════════════════════════════════════════════════════
KRITISCH - ABSOLUTE PFLICHT:
═══════════════════════════════════════════════════════════════

1. Du MUSST ALLE 22 PHASEN durchlaufen - KEINE AUSNAHMEN!
2. Du darfst NIEMALS vor Phase 22 abschließen oder zusammenfassen
3. Stelle PRO NACHRICHT nur EINE Frage aus der aktuellen Phase
4. Gehe erst zur nächsten Phase wenn die aktuelle beantwortet ist
5. Auch wenn der Nutzer "weiter" oder "fertig" sagt - du musst alle Phasen abfragen!

VERBOTEN:
- Vorzeitige Zusammenfassungen vor Phase 22
- Überspringen von Phasen
- Mehrere Fragen gleichzeitig
- Abschließen ohne alle Informationen

═══════════════════════════════════════════════════════════════

${phaseInstructions}

INTERVIEW-PHASEN FÜR ${cat.name.toUpperCase()}:
${cat.phases.map((p, i) => `${i + 1}. ${p}`).join('\n')}

DEIN VERHALTEN:
- Sei freundlich, professionell und ein echter Experte
- Fasse kurz zusammen was du verstanden hast
- Gib konkrete Beispiele und Vorschläge
- Nutze passende Emojis sparsam (🎬 🎯 🎨 💡)
- Antworte IMMER auf Deutsch
- Biete Quick-Reply-Optionen an

VERBOTENE PHRASEN:
- "Also ich habe", "Ich habe", "Also..."
- Unnötige Füllwörter
- First-Person Narrative ohne Kontext

RESPONSE FORMAT (IMMER als JSON):
{
  "message": "Deine Nachricht mit Zusammenfassung + nächste Frage",
  "quickReplies": ["Option 1", "Option 2", "Option 3", "Option 4"],
  "currentPhase": ${currentPhase},
  "isComplete": ${currentPhase >= 22}
}

Modus: ${mode === 'full-service' ? 'Full-Service (KI erstellt alles automatisch nach Briefing)' : 'Manuell (Nutzer hat volle Kontrolle über jeden Schritt)'}`;
};

// Calculate progress and current phase
const calculatePhaseInfo = (messages: any[]) => {
  const userMessages = messages.filter(m => m.role === 'user').length;
  const currentPhase = Math.min(userMessages + 1, 22);
  const progress = Math.round((userMessages / 22) * 100);
  return { currentPhase, progress: Math.min(progress, 100) };
};

// Context-aware quick replies based on AI message content
function getContextAwareQuickReplies(aiMessage: string, phase: number, category: string): string[] {
  const messageLower = aiMessage.toLowerCase();
  
  // Format/Aspect Ratio questions
  if (messageLower.includes('format') || messageLower.includes('16:9') || messageLower.includes('9:16') || messageLower.includes('aspect')) {
    return ['16:9 für YouTube/Website', '9:16 für TikTok/Reels', '1:1 für Instagram', 'Alle drei Formate'];
  }
  
  // Duration/Length questions
  if (messageLower.includes('länge') || messageLower.includes('sekunden') || messageLower.includes('dauer') || messageLower.includes('lang soll')) {
    return ['30 Sekunden', '60 Sekunden', '90 Sekunden', '2 Minuten'];
  }
  
  // Style/Visual questions
  if (messageLower.includes('stil') || messageLower.includes('visuell') || messageLower.includes('design') || messageLower.includes('aussehen')) {
    return ['Modern & minimalistisch', 'Dynamisch & energetisch', 'Elegant & premium', 'Verspielt & bunt'];
  }
  
  // Tone/Voice questions
  if (messageLower.includes('tonalität') || messageLower.includes('ton ') || messageLower.includes('stimmung')) {
    return ['Professionell & seriös', 'Locker & humorvoll', 'Emotional & berührend', 'Direkt & überzeugend'];
  }
  
  // Music questions
  if (messageLower.includes('musik') || messageLower.includes('hintergrund') || messageLower.includes('sound')) {
    return ['Corporate & Business', 'Upbeat & energetisch', 'Emotional & cinematic', 'Minimal & subtil'];
  }
  
  // Voice/Speaker questions
  if (messageLower.includes('stimme') || messageLower.includes('sprecher') || messageLower.includes('voice')) {
    return ['Männliche Stimme, professionell', 'Weibliche Stimme, freundlich', 'Keine Stimme, nur Musik', 'Deutsch UND Englisch'];
  }
  
  // CTA questions
  if (messageLower.includes('cta') || messageLower.includes('call to action') || messageLower.includes('handlung') || messageLower.includes('am ende')) {
    return ['Jetzt kaufen + Shop-Link', 'Kostenlos testen + Demo', 'Mehr erfahren + Website', 'Termin buchen + Kalender'];
  }
  
  // Hook/Intro questions
  if (messageLower.includes('hook') || messageLower.includes('einstieg') || messageLower.includes('anfang') || messageLower.includes('ersten sekunden')) {
    return ['Provokante Frage stellen', 'Überraschendes Statement', 'Problem direkt zeigen', 'Ich hab eine Idee...'];
  }
  
  // Target audience questions
  if (messageLower.includes('zielgruppe') || messageLower.includes('publikum') || messageLower.includes('wer soll')) {
    return ['B2B Entscheider', 'Endkonsumenten 25-45', 'Junge Zielgruppe 18-30', 'Lass mich beschreiben...'];
  }
  
  // Problem/Pain point questions
  if (messageLower.includes('problem') || messageLower.includes('pain') || messageLower.includes('herausforderung') || messageLower.includes('frustration')) {
    return ['Zeitdruck & Stress', 'Hohe Kosten', 'Komplizierte Prozesse', 'Mehrere Pain Points...'];
  }
  
  // Emotion questions
  if (messageLower.includes('emotion') || messageLower.includes('gefühl') || messageLower.includes('fühlen')) {
    return ['Erleichterung & Freude', 'Vertrauen & Sicherheit', 'Begeisterung & Wow', 'Neugier & Interesse'];
  }
  
  // Character questions
  if (messageLower.includes('charakter') || messageLower.includes('maskottchen') || messageLower.includes('figur')) {
    return ['Ja, ein Maskottchen', 'Nein, keine Charaktere', 'Vielleicht dezent', 'Was passt besser?'];
  }
  
  // Color questions
  if (messageLower.includes('farbe') || messageLower.includes('color') || messageLower.includes('hex') || messageLower.includes('markenfarben')) {
    return ['Blau & Weiß', 'Schwarz & Gold (#F5C76A)', 'Grün & Naturtöne', 'Ich schicke die Hex-Codes'];
  }
  
  // Animation quality questions
  if (messageLower.includes('animation') || messageLower.includes('qualität') || messageLower.includes('premium')) {
    return ['Premium KI-Generierung', 'Standard-Templates', 'Mix aus beiden', 'Was empfiehlst du?'];
  }
  
  // Goal questions
  if (messageLower.includes('ziel') || messageLower.includes('erreichen') || messageLower.includes('hauptziel')) {
    return ['Mehr Verkäufe erzielen', 'Leads generieren', 'Brand Awareness steigern', 'Produkt vorstellen'];
  }
  
  // Fallback to phase-based replies
  return generateQuickReplies(phase, category);
}

// Generate phase-specific quick replies (fallback)
function generateQuickReplies(phase: number, category: string): string[] {
  const phaseReplies: Record<number, string[]> = {
    1: ['Mehr Verkäufe erzielen', 'Leads generieren', 'Brand Awareness steigern', 'Produkt vorstellen'],
    2: ['Zeitersparnis beim Kunden', 'Kostenreduktion', 'Qualitätsverbesserung', 'Lass mich erklären...'],
    3: ['Effizienz & Produktivität', 'Kosteneinsparung', 'Bessere Ergebnisse', 'Einfache Bedienung'],
    4: ['Software/App', 'Physisches Produkt', 'Dienstleistung', 'Lass mich beschreiben...'],
    5: ['Einfache Bedienung', 'Beste Qualität', 'Zeitersparnis', 'Alle oben genannten'],
    6: ['Einzigartige Technologie', 'Bester Service', 'Günstigster Preis', 'Lass mich erklären...'],
    7: ['500+ Kunden', '10+ Jahre Erfahrung', 'Award-Winner', 'Keine konkreten Zahlen'],
    8: ['B2B Entscheider', 'Endkonsumenten 25-45', 'Junge Zielgruppe 18-30', 'Lass mich beschreiben...'],
    9: ['Zeitdruck & Stress', 'Hohe Kosten', 'Komplizierte Prozesse', 'Mehrere Pain Points...'],
    10: ['Erleichterung & Freude', 'Vertrauen & Sicherheit', 'Begeisterung & Wow', 'Neugier & Interesse'],
    11: ['Ja, ich habe Beispiele', 'Nein, überrasche mich', 'Ähnlich wie Apple-Werbung', 'Modern & dynamisch'],
    12: ['Blau & Weiß', 'Schwarz & Gold (#F5C76A)', 'Grün & Naturtöne', 'Ich schicke die Hex-Codes'],
    13: ['Modern & minimalistisch', 'Dynamisch & energetisch', 'Elegant & premium', 'Verspielt & bunt'],
    14: ['Professionell & seriös', 'Locker & humorvoll', 'Emotional & berührend', 'Direkt & überzeugend'],
    15: ['Premium KI-Generierung', 'Standard-Templates', 'Mix aus beiden', 'Was empfiehlst du?'],
    16: ['Ja, ein Maskottchen', 'Nein, keine Charaktere', 'Vielleicht dezent', 'Was passt besser?'],
    17: ['Männliche Stimme, professionell', 'Weibliche Stimme, freundlich', 'Keine Stimme, nur Musik', 'Deutsch UND Englisch'],
    18: ['Corporate & Business', 'Upbeat & energetisch', 'Emotional & cinematic', 'Minimal & subtil'],
    19: ['16:9 für YouTube/Website', '9:16 für TikTok/Reels', '1:1 für Instagram', 'Alle drei Formate'],
    20: ['30 Sekunden', '60 Sekunden', '90 Sekunden', '2 Minuten'],
    21: ['Provokante Frage stellen', 'Überraschendes Statement', 'Problem direkt zeigen', 'Ich hab eine Idee...'],
    22: ['Jetzt kaufen + Shop-Link', 'Kostenlos testen + Demo', 'Mehr erfahren + Website', 'Termin buchen + Kalender'],
  };
  
  return phaseReplies[phase] || ['Ja, genau so', 'Lass mich erklären...', 'Weiter zur nächsten Frage', 'Ich brauche Hilfe dabei'];
}

// Extract comprehensive recommendation from conversation
const extractRecommendation = (messages: any[], category: string) => {
  const userResponses = messages.filter(m => m.role === 'user').map(m => m.content);
  
  return {
    productSummary: userResponses.slice(0, 5).join(' ').substring(0, 500),
    targetAudience: userResponses[7] ? [userResponses[7].substring(0, 100)] : ['Allgemein'],
    painPoints: userResponses[8] ? userResponses[8].substring(0, 200) : '',
    emotionalHook: userResponses[9] ? userResponses[9].substring(0, 100) : 'Interesse wecken',
    visualStyle: userResponses[12] || 'modern',
    tone: userResponses[13] || 'professional',
    duration: parseInt(userResponses[19]) || 60,
    format: userResponses[18] || '16:9',
    hookIdea: userResponses[20] || '',
    ctaText: userResponses[21] || 'Mehr erfahren',
    category
  };
};

// Compress context for later phases to avoid timeout
function compressContext(messages: any[], currentPhase: number): any[] {
  // For phases 1-12, send all messages
  if (currentPhase <= 12 || messages.length <= 15) {
    return messages;
  }
  
  // For later phases, compress: keep first 3 + summary + last 8 messages
  const firstMessages = messages.slice(0, 3);
  const lastMessages = messages.slice(-8);
  
  // Create a summary of the middle messages
  const middleMessages = messages.slice(3, -8);
  const userMiddleResponses = middleMessages
    .filter((m: any) => m.role === 'user')
    .map((m: any) => m.content)
    .join(' | ');
  
  const summaryMessage = {
    role: 'system',
    content: `[ZUSAMMENFASSUNG bisheriger Antworten: ${userMiddleResponses.substring(0, 500)}...]`
  };
  
  console.log(`[universal-video-consultant] Compressed ${messages.length} messages to ${firstMessages.length + 1 + lastMessages.length} for phase ${currentPhase}`);
  
  return [...firstMessages, summaryMessage, ...lastMessages];
}

// Parse SSE stream and collect full content
async function parseSSEStream(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Process complete lines
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      
      if (!line || line.startsWith(':')) continue;
      if (!line.startsWith('data: ')) continue;
      
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullContent += content;
        }
      } catch {
        // Incomplete JSON, ignore
      }
    }
  }
  
  return fullContent;
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

    const { messages, category, mode } = await req.json();
    
    const { currentPhase, progress } = calculatePhaseInfo(messages);
    
    console.log(`[universal-video-consultant] Category: ${category}, Mode: ${mode}, Phase: ${currentPhase}/22, Progress: ${progress}%, Messages: ${messages.length}`);

    const systemPrompt = getCategorySystemPrompt(category, mode, currentPhase);
    
    // Compress context for later phases to avoid timeout
    const compressedMessages = compressContext(messages, currentPhase);
    
    // Add phase enforcement for later phases
    const aiMessages = [{ role: 'system', content: systemPrompt }, ...compressedMessages];
    
    if (currentPhase >= 15 && currentPhase < 22) {
      const cat = getCategoryConfig(category);
      const remainingPhases = cat.phases.slice(currentPhase - 1);
      aiMessages.push({
        role: 'system',
        content: `ACHTUNG: Du bist in Phase ${currentPhase}/22. Du MUSST noch diese Themen abfragen:
${remainingPhases.map((p, i) => `- Phase ${currentPhase + i}: ${p}`).join('\n')}

Beende das Gespräch NICHT bevor alle 22 Phasen abgefragt sind!`
      });
    }

    console.log(`[universal-video-consultant] Sending ${aiMessages.length} messages to AI (streaming enabled)`);

    // Use streaming to keep connection alive and prevent timeout
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: aiMessages,
        stream: true, // Enable streaming to prevent timeout
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[universal-video-consultant] AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit erreicht',
          message: 'Entschuldigung, ich bin gerade etwas überlastet. Bitte versuche es in einer Minute erneut. 🕐',
          quickReplies: ['Erneut versuchen'],
          progress,
          currentPhase
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Credits aufgebraucht',
          message: 'Die Credits sind aufgebraucht. Bitte lade dein Konto auf.',
          quickReplies: ['Credits aufladen'],
          progress,
          currentPhase
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    // Parse the SSE stream
    const aiContent = await parseSSEStream(response);
    
    console.log('[universal-video-consultant] AI response length:', aiContent.length);

    // Parse AI response
    let parsedResponse: any = null;
    try {
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                        aiContent.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, aiContent];
      const jsonStr = jsonMatch[1] || aiContent;
      parsedResponse = JSON.parse(jsonStr.trim());
    } catch (e) {
      console.log('[universal-video-consultant] Parsing as plain text');
    }

    const isComplete = currentPhase >= 22 && messages.filter((m: any) => m.role === 'user').length >= 21;

    // ROBUST: Multi-Step JSON/Message Extraction
    let cleanedMessage = parsedResponse?.message;
    
    if (!cleanedMessage) {
      // Step 1: Try to find and parse complete JSON block
      const jsonBlockMatch = aiContent.match(/\{[\s\S]*"message"[\s\S]*\}/);
      if (jsonBlockMatch) {
        try {
          const parsed = JSON.parse(jsonBlockMatch[0]);
          cleanedMessage = parsed.message;
        } catch {
          // JSON parse failed, continue to step 2
        }
      }
      
      // Step 2: Extract message field with proper escape handling
      if (!cleanedMessage) {
        const messageMatch = aiContent.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (messageMatch) {
          cleanedMessage = messageMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
        }
      }
      
      // Step 3: Fallback - clean plain text from any JSON/code artifacts
      if (!cleanedMessage) {
        cleanedMessage = aiContent
          .replace(/```json[\s\S]*?```/g, '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/\{[\s\S]*?\}/g, '')
          .trim();
      }
    }
    
    // KRITISCH: Phase-basierte Quick Replies als PRIMÄR verwenden!
    // AI liefert oft falsche/kontextlose Quick Replies, daher Phase-Mapping priorisieren
    const phaseBasedReplies = generateQuickReplies(currentPhase, category);
    
    // Nur AI-Replies verwenden wenn sie wirklich spezifisch und sinnvoll sind (mind. 4 Optionen)
    const aiReplies = parsedResponse?.quickReplies;
    const useAiReplies = aiReplies && 
                         Array.isArray(aiReplies) && 
                         aiReplies.length >= 4 &&
                         !aiReplies.some((r: string) => r.toLowerCase().includes('weiter') || r.toLowerCase() === 'ja');
    
    const smartQuickReplies = useAiReplies ? aiReplies : phaseBasedReplies;

    // Build response
    const responseData = {
      message: cleanedMessage,
      quickReplies: smartQuickReplies,
      progress,
      currentPhase,
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
      message: 'Entschuldigung, es gab einen technischen Fehler. Bitte versuche es erneut. 🔧',
      quickReplies: ['Erneut versuchen', 'Beratung überspringen'],
      progress: 0,
      currentPhase: 1
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
