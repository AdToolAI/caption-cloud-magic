// ==========================================
// Universal Video Creator - Interview Configurations
// 20-24 Phasen pro Kategorie
// ==========================================

import { CategoryInterviewConfig, InterviewPhase, VideoCategory } from '@/types/universal-video-creator';

// ==========================================
// 1. WERBEVIDEO (22 Phasen)
// ==========================================
export const ADVERTISEMENT_INTERVIEW: CategoryInterviewConfig = {
  category: 'advertisement',
  categoryName: 'Werbevideo',
  categoryDescription: 'Professionelle Werbevideos für Produkte und Dienstleistungen',
  icon: '📺',
  phases: [
    { id: 'ad-1', phase: 1, question: 'Willkommen! Ich bin Max, dein KI-Berater für Werbevideos. Was ist der Name deines Unternehmens oder deiner Marke?', purpose: 'Markenidentifikation', inputType: 'text', required: true },
    { id: 'ad-2', phase: 2, question: 'Welches Produkt oder welche Dienstleistung möchtest du bewerben?', purpose: 'Produktdefinition', inputType: 'text', required: true },
    { id: 'ad-3', phase: 3, question: 'Beschreibe dein Produkt/Service in 2-3 Sätzen. Was macht es besonders?', purpose: 'USP-Erfassung', inputType: 'text', required: true },
    { id: 'ad-4', phase: 4, question: 'Wer ist deine Zielgruppe? Beschreibe deinen idealen Kunden.', purpose: 'Zielgruppenanalyse', inputType: 'text', required: true, quickReplies: ['Junge Erwachsene 18-25', 'Berufstätige 25-45', 'Familien mit Kindern', 'Best Ager 50+', 'B2B Entscheider'] },
    { id: 'ad-5', phase: 5, question: 'Welches EINE Hauptproblem löst dein Produkt für diese Zielgruppe?', purpose: 'Problemdefinition', inputType: 'text', required: true },
    { id: 'ad-6', phase: 6, question: 'Was ist der wichtigste emotionale Nutzen für den Kunden?', purpose: 'Emotionaler Benefit', inputType: 'text', required: true, quickReplies: ['Zeitersparnis', 'Geld sparen', 'Mehr Sicherheit', 'Besseres Aussehen', 'Mehr Erfolg', 'Weniger Stress'] },
    { id: 'ad-7', phase: 7, question: 'Was unterscheidet dich von der Konkurrenz? Nenne 2-3 Alleinstellungsmerkmale.', purpose: 'Differenzierung', inputType: 'text', required: true },
    { id: 'ad-8', phase: 8, question: 'Welche Aktion soll der Zuschauer nach dem Video ausführen?', purpose: 'CTA-Definition', inputType: 'select', options: ['Website besuchen', 'Jetzt kaufen', 'Kostenlos testen', 'Termin buchen', 'Mehr erfahren', 'Anrufen', 'App herunterladen'], required: true },
    { id: 'ad-9', phase: 9, question: 'Wie soll der genaue CTA-Text lauten? (z.B. "Jetzt kostenlos testen")', purpose: 'CTA-Text', inputType: 'text', required: true },
    { id: 'ad-10', phase: 10, question: 'Wo soll das Werbevideo primär ausgespielt werden?', purpose: 'Plattformoptimierung', inputType: 'multiselect', options: ['TV/Streaming', 'YouTube', 'Facebook/Instagram', 'TikTok', 'LinkedIn', 'Website', 'Messe/Event'], required: true },
    { id: 'ad-11', phase: 11, question: 'Welche Videolänge bevorzugst du?', purpose: 'Dauer', inputType: 'select', options: ['15 Sekunden (Bumper)', '30 Sekunden (Standard)', '60 Sekunden (Ausführlich)', '90 Sekunden (Storytelling)'], required: true },
    { id: 'ad-12', phase: 12, question: 'Welchen visuellen Stil stellst du dir vor?', purpose: 'Stil-Definition', inputType: 'select', options: ['Modern & Clean', 'Bold & Farbenfroh', 'Minimalistisch', 'Cinematic', 'Comic/Cartoon', 'Corporate/Seriös', 'Trendy/Social Media'], required: true },
    { id: 'ad-13', phase: 13, question: 'Welche Farben repräsentieren deine Marke? (Hex-Codes oder Beschreibung)', purpose: 'Branding', inputType: 'text', required: true, quickReplies: ['Blau & Weiß', 'Schwarz & Gold', 'Grün & Weiß', 'Rot & Schwarz', 'Violett & Rosa'] },
    { id: 'ad-14', phase: 14, question: 'Hast du ein Logo, das eingebunden werden soll?', purpose: 'Logo-Integration', inputType: 'select', options: ['Ja, ich lade es hoch', 'Nein, kein Logo nötig', 'Logo wird später ergänzt'], required: true },
    { id: 'ad-15', phase: 15, question: 'Soll ein animierter Charakter/Maskottchen im Video erscheinen?', purpose: 'Charakter', inputType: 'select', options: ['Ja, mit Charakter', 'Nein, nur Grafiken/Produkt', 'Vielleicht, bin unsicher'], required: true },
    { id: 'ad-16', phase: 16, question: 'Welche Stimme soll das Voice-Over haben?', purpose: 'Voice-Over', inputType: 'select', options: ['Männlich, professionell', 'Männlich, freundlich', 'Weiblich, professionell', 'Weiblich, warm', 'Männlich, energetisch', 'Weiblich, dynamisch'], required: true },
    { id: 'ad-17', phase: 17, question: 'In welcher Sprache soll das Video sein?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch', 'Deutsch & Englisch'], required: true },
    { id: 'ad-18', phase: 18, question: 'Welche Musikstimmung passt zu deiner Werbung?', purpose: 'Musik', inputType: 'select', options: ['Energetisch & Upbeat', 'Inspirierend & Emotional', 'Modern & Trendy', 'Professionell & Corporate', 'Entspannt & Vertrauensvoll', 'Dramatisch & Cinematic'], required: true },
    { id: 'ad-19', phase: 19, question: 'Gibt es besondere Szenen oder Momente, die unbedingt vorkommen sollen?', purpose: 'Szenen-Wünsche', inputType: 'text', required: false },
    { id: 'ad-20', phase: 20, question: 'Hast du Referenzvideos oder Beispiele, die dir gefallen? (URLs oder Beschreibung)', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'ad-21', phase: 21, question: 'Gibt es etwas, das du auf keinen Fall im Video haben möchtest?', purpose: 'Ausschlüsse', inputType: 'text', required: false },
    { id: 'ad-22', phase: 22, question: 'Perfekt! Lass mich kurz zusammenfassen und dann erstelle ich dein Werbevideo. Möchtest du noch etwas ergänzen?', purpose: 'Finale Bestätigung', inputType: 'text', required: false, quickReplies: ['Nein, sieht gut aus!', 'Ja, ich möchte ergänzen...'] }
  ],
  totalPhases: 22,
  recommendedStructure: 'aida',
  recommendedDuration: { min: 15, max: 90 },
  recommendedScenes: { min: 4, max: 8 }
};

// ==========================================
// 2. STORYTELLING (24 Phasen)
// ==========================================
export const STORYTELLING_INTERVIEW: CategoryInterviewConfig = {
  category: 'storytelling',
  categoryName: 'Storytelling / Brand Story',
  categoryDescription: 'Emotionale Geschichten, die Ihre Marke zum Leben erwecken',
  icon: '📖',
  phases: [
    { id: 'story-1', phase: 1, question: 'Willkommen! Ich bin Max und helfe dir, eine fesselnde Geschichte zu erzählen. Was ist der Name deines Unternehmens oder deiner Marke?', purpose: 'Markenidentifikation', inputType: 'text', required: true },
    { id: 'story-2', phase: 2, question: 'Welche Art von Geschichte möchtest du erzählen?', purpose: 'Story-Typ', inputType: 'select', options: ['Gründergeschichte', 'Markengeschichte', 'Kundengeschichte', 'Produktgeschichte', 'Unternehmensgeschichte', 'Vision & Mission'], required: true },
    { id: 'story-3', phase: 3, question: 'Wer ist der Held deiner Geschichte? (Person, Unternehmen, Kunde, Produkt)', purpose: 'Protagonist', inputType: 'text', required: true },
    { id: 'story-4', phase: 4, question: 'Was ist der Ausgangspunkt der Geschichte? Wie war die Situation am Anfang?', purpose: 'Setup', inputType: 'text', required: true },
    { id: 'story-5', phase: 5, question: 'Welches Problem oder welche Herausforderung musste überwunden werden?', purpose: 'Konflikt', inputType: 'text', required: true },
    { id: 'story-6', phase: 6, question: 'Was war der Wendepunkt? Der entscheidende Moment der Veränderung?', purpose: 'Wendepunkt', inputType: 'text', required: true },
    { id: 'story-7', phase: 7, question: 'Wie wurde das Problem gelöst? Was war die Lösung oder Erkenntnis?', purpose: 'Lösung', inputType: 'text', required: true },
    { id: 'story-8', phase: 8, question: 'Was ist das Ergebnis? Wie sieht die Situation jetzt aus?', purpose: 'Resolution', inputType: 'text', required: true },
    { id: 'story-9', phase: 9, question: 'Welche Emotion soll der Zuschauer am Ende empfinden?', purpose: 'Emotionales Ziel', inputType: 'select', options: ['Inspiriert', 'Berührt', 'Motiviert', 'Vertrauensvoll', 'Begeistert', 'Hoffnungsvoll', 'Verbunden'], required: true },
    { id: 'story-10', phase: 10, question: 'Wer ist die Zielgruppe für diese Geschichte?', purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'story-11', phase: 11, question: 'Was ist die zentrale Botschaft, die hängen bleiben soll?', purpose: 'Kernbotschaft', inputType: 'text', required: true },
    { id: 'story-12', phase: 12, question: 'Welche Werte oder Überzeugungen sollen vermittelt werden?', purpose: 'Werte', inputType: 'multiselect', options: ['Innovation', 'Nachhaltigkeit', 'Qualität', 'Familie', 'Mut', 'Ehrlichkeit', 'Leidenschaft', 'Gemeinschaft'], required: true },
    { id: 'story-13', phase: 13, question: 'Wie lang soll die Geschichte sein?', purpose: 'Dauer', inputType: 'select', options: ['60 Sekunden (Kurzform)', '90 Sekunden (Standard)', '2 Minuten (Ausführlich)', '3 Minuten (Episch)'], required: true },
    { id: 'story-14', phase: 14, question: 'Welchen visuellen Stil stellst du dir vor?', purpose: 'Visueller Stil', inputType: 'select', options: ['Cinematic & Filmisch', 'Dokumentarisch & Authentisch', 'Emotional & Warm', 'Modern & Stylisch', 'Nostalgisch & Vintage', 'Künstlerisch & Kreativ'], required: true },
    { id: 'story-15', phase: 15, question: 'Welche Farben und Stimmung passen zur Geschichte?', purpose: 'Farbstimmung', inputType: 'select', options: ['Warme Erdtöne', 'Kühle Blautöne', 'Lebendige Farben', 'Schwarz-Weiß Akzente', 'Pastelltöne', 'Markenfarben'], required: true },
    { id: 'story-16', phase: 16, question: 'Soll ein Charakter oder eine Person im Video erscheinen?', purpose: 'Charakter', inputType: 'select', options: ['Ja, animierter Charakter', 'Ja, reale Person (als Animation)', 'Nein, nur visuelle Szenen', 'Symbol oder Maskottchen'], required: true },
    { id: 'story-17', phase: 17, question: 'Beschreibe den Charakter näher (Aussehen, Persönlichkeit).', purpose: 'Charakter-Details', inputType: 'text', required: false },
    { id: 'story-18', phase: 18, question: 'Welche Stimme soll die Geschichte erzählen?', purpose: 'Erzählerstimme', inputType: 'select', options: ['Männlich, warm & vertrauensvoll', 'Männlich, inspirierend', 'Weiblich, emotional & einfühlsam', 'Weiblich, kraftvoll & motivierend', 'Ich-Erzähler (Protagonist)'], required: true },
    { id: 'story-19', phase: 19, question: 'In welcher Sprache soll die Geschichte erzählt werden?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch', 'Mehrsprachig'], required: true },
    { id: 'story-20', phase: 20, question: 'Welche Musikstimmung unterstreicht die Geschichte am besten?', purpose: 'Musik', inputType: 'select', options: ['Emotional & Berührend', 'Inspirierend & Aufbauend', 'Episch & Cinematic', 'Sanft & Nachdenklich', 'Hoffnungsvoll & Optimistisch'], required: true },
    { id: 'story-21', phase: 21, question: 'Gibt es besondere visuelle Elemente oder Szenen, die vorkommen sollen?', purpose: 'Visuelle Wünsche', inputType: 'text', required: false },
    { id: 'story-22', phase: 22, question: 'Hast du Referenzvideos, die dich inspiriert haben?', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'story-23', phase: 23, question: 'Was soll der Zuschauer nach dem Video tun oder denken?', purpose: 'CTA/Outcome', inputType: 'text', required: true },
    { id: 'story-24', phase: 24, question: 'Wunderbar! Deine Geschichte nimmt Form an. Möchtest du noch etwas hinzufügen?', purpose: 'Finale Bestätigung', inputType: 'text', required: false, quickReplies: ['Nein, lass uns starten!', 'Ja, ich möchte ergänzen...'] }
  ],
  totalPhases: 24,
  recommendedStructure: 'hero-journey',
  recommendedDuration: { min: 60, max: 180 },
  recommendedScenes: { min: 8, max: 15 }
};

// ==========================================
// 3. TUTORIAL (21 Phasen)
// ==========================================
export const TUTORIAL_INTERVIEW: CategoryInterviewConfig = {
  category: 'tutorial',
  categoryName: 'Tutorial / How-To',
  categoryDescription: 'Schritt-für-Schritt Anleitungen und Lernvideos',
  icon: '🎓',
  phases: [
    { id: 'tut-1', phase: 1, question: 'Hallo! Ich bin Max und helfe dir, ein großartiges Tutorial zu erstellen. Was ist das Thema deines Tutorials?', purpose: 'Thema', inputType: 'text', required: true },
    { id: 'tut-2', phase: 2, question: 'Was genau soll der Zuschauer am Ende können oder verstehen?', purpose: 'Lernziel', inputType: 'text', required: true },
    { id: 'tut-3', phase: 3, question: 'Um welche Art von Tutorial handelt es sich?', purpose: 'Tutorial-Typ', inputType: 'select', options: ['Software/App-Anleitung', 'Produktnutzung', 'DIY/Handwerk', 'Kochen/Rezept', 'Fitness/Sport', 'Business/Beruf', 'Kreatives/Kunst', 'Technisches/Reparatur'], required: true },
    { id: 'tut-4', phase: 4, question: 'Für wen ist dieses Tutorial gedacht?', purpose: 'Zielgruppe', inputType: 'select', options: ['Absolute Anfänger', 'Anfänger mit Grundwissen', 'Fortgeschrittene', 'Profis/Experten', 'Gemischtes Publikum'], required: true },
    { id: 'tut-5', phase: 5, question: 'Beschreibe deine Zielgruppe genauer. Wer sind diese Menschen?', purpose: 'Zielgruppen-Details', inputType: 'text', required: true },
    { id: 'tut-6', phase: 6, question: 'Was ist das Ausgangsproblem? Warum sucht jemand dieses Tutorial?', purpose: 'Problem', inputType: 'text', required: true },
    { id: 'tut-7', phase: 7, question: 'In wie viele Hauptschritte lässt sich die Anleitung aufteilen?', purpose: 'Struktur', inputType: 'select', options: ['3 Schritte (Kurz)', '5 Schritte (Standard)', '7 Schritte (Ausführlich)', '10+ Schritte (Komplex)'], required: true },
    { id: 'tut-8', phase: 8, question: 'Beschreibe die einzelnen Schritte kurz (einer pro Zeile oder kommagetrennt).', purpose: 'Schrittdetails', inputType: 'text', required: true },
    { id: 'tut-9', phase: 9, question: 'Gibt es häufige Fehler, vor denen du warnen möchtest?', purpose: 'Fehler-Warnungen', inputType: 'text', required: false },
    { id: 'tut-10', phase: 10, question: 'Welche Materialien, Tools oder Voraussetzungen werden benötigt?', purpose: 'Voraussetzungen', inputType: 'text', required: false },
    { id: 'tut-11', phase: 11, question: 'Wie lang soll das Tutorial sein?', purpose: 'Dauer', inputType: 'select', options: ['60 Sekunden (Kurzanleitung)', '2 Minuten (Standard)', '3 Minuten (Ausführlich)', '5 Minuten (Detailliert)'], required: true },
    { id: 'tut-12', phase: 12, question: 'Welchen visuellen Stil bevorzugst du?', purpose: 'Visueller Stil', inputType: 'select', options: ['Screencast-Stil', 'Animierte Grafiken', 'Whiteboard-Erklärung', 'Modern & Clean', 'Freundlich & Bunt', 'Professionell & Seriös'], required: true },
    { id: 'tut-13', phase: 13, question: 'Welche Farben sollen verwendet werden?', purpose: 'Farben', inputType: 'text', required: true, quickReplies: ['Blau & Weiß (Tech)', 'Grün & Weiß (Eco)', 'Orange & Grau (Modern)', 'Markenfarben'] },
    { id: 'tut-14', phase: 14, question: 'Soll ein erklärender Charakter im Video erscheinen?', purpose: 'Charakter', inputType: 'select', options: ['Ja, als Tutor/Lehrer', 'Ja, als Begleiter', 'Nein, nur Visualisierungen', 'Nur Hand/Pointer'], required: true },
    { id: 'tut-15', phase: 15, question: 'Welche Stimme soll das Tutorial sprechen?', purpose: 'Voice-Over', inputType: 'select', options: ['Männlich, freundlich & geduldig', 'Männlich, professionell', 'Weiblich, warm & erklärend', 'Weiblich, professionell'], required: true },
    { id: 'tut-16', phase: 16, question: 'In welcher Sprache soll das Tutorial sein?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch', 'Mehrsprachig'], required: true },
    { id: 'tut-17', phase: 17, question: 'Welche Hintergrundmusik passt?', purpose: 'Musik', inputType: 'select', options: ['Entspannt & Fokussiert', 'Freundlich & Leicht', 'Professionell & Neutral', 'Keine Musik (nur Sprache)'], required: true },
    { id: 'tut-18', phase: 18, question: 'Sollen Texteinblendungen die wichtigsten Punkte hervorheben?', purpose: 'Text-Overlays', inputType: 'select', options: ['Ja, Schritt-Titel', 'Ja, Key Points', 'Ja, Bullet Points', 'Minimal', 'Nein'], required: true },
    { id: 'tut-19', phase: 19, question: 'Was ist dein Call-to-Action am Ende?', purpose: 'CTA', inputType: 'text', required: true, quickReplies: ['Kanal abonnieren', 'Mehr Tutorials ansehen', 'Produkt kaufen', 'Website besuchen'] },
    { id: 'tut-20', phase: 20, question: 'Gibt es Referenz-Tutorials, die dir gefallen haben?', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'tut-21', phase: 21, question: 'Super! Ich habe alles, was ich brauche. Noch etwas hinzufügen?', purpose: 'Finale Bestätigung', inputType: 'text', required: false, quickReplies: ['Nein, Tutorial erstellen!', 'Ja, ich ergänze...'] }
  ],
  totalPhases: 21,
  recommendedStructure: 'problem-solution',
  recommendedDuration: { min: 60, max: 300 },
  recommendedScenes: { min: 5, max: 12 }
};

// ==========================================
// 4. PRODUKTVIDEO (20 Phasen)
// ==========================================
export const PRODUCT_VIDEO_INTERVIEW: CategoryInterviewConfig = {
  category: 'product-video',
  categoryName: 'Produktvideo / Demo',
  categoryDescription: 'Zeigen Sie Ihr Produkt in Aktion',
  icon: '📦',
  phases: [
    { id: 'prod-1', phase: 1, question: 'Hallo! Ich bin Max. Lass uns dein Produkt perfekt in Szene setzen! Wie heißt dein Produkt?', purpose: 'Produktname', inputType: 'text', required: true },
    { id: 'prod-2', phase: 2, question: 'Um was für eine Art von Produkt handelt es sich?', purpose: 'Produktkategorie', inputType: 'select', options: ['Physisches Produkt', 'Software/App', 'Online-Service', 'Dienstleistung', 'Abonnement', 'Hardware/Gerät'], required: true },
    { id: 'prod-3', phase: 3, question: 'Beschreibe dein Produkt in 2-3 Sätzen. Was macht es?', purpose: 'Produktbeschreibung', inputType: 'text', required: true },
    { id: 'prod-4', phase: 4, question: 'Was sind die 3-5 wichtigsten Features oder Funktionen?', purpose: 'Features', inputType: 'text', required: true },
    { id: 'prod-5', phase: 5, question: 'Welches Hauptproblem löst dein Produkt?', purpose: 'Problem', inputType: 'text', required: true },
    { id: 'prod-6', phase: 6, question: 'Was ist der größte Nutzen für den Kunden?', purpose: 'Hauptnutzen', inputType: 'text', required: true },
    { id: 'prod-7', phase: 7, question: 'Wer ist die Zielgruppe für dieses Produkt?', purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'prod-8', phase: 8, question: 'Was unterscheidet dein Produkt von der Konkurrenz?', purpose: 'USP', inputType: 'text', required: true },
    { id: 'prod-9', phase: 9, question: 'Gibt es einen Preis oder ein Angebot, das genannt werden soll?', purpose: 'Pricing', inputType: 'text', required: false },
    { id: 'prod-10', phase: 10, question: 'Welche Aktion soll der Zuschauer ausführen?', purpose: 'CTA', inputType: 'select', options: ['Jetzt kaufen', 'Kostenlos testen', 'Demo anfragen', 'Mehr erfahren', 'In den Warenkorb', 'Termin buchen'], required: true },
    { id: 'prod-11', phase: 11, question: 'Wie lang soll das Produktvideo sein?', purpose: 'Dauer', inputType: 'select', options: ['30 Sekunden (Kurz)', '60 Sekunden (Standard)', '90 Sekunden (Ausführlich)'], required: true },
    { id: 'prod-12', phase: 12, question: 'Welchen visuellen Stil bevorzugst du?', purpose: 'Stil', inputType: 'select', options: ['Premium & Elegant', 'Modern & Tech', 'Freundlich & Zugänglich', 'Minimalistisch & Clean', 'Bold & Auffällig'], required: true },
    { id: 'prod-13', phase: 13, question: 'Welche Farben passen zu deiner Marke?', purpose: 'Farben', inputType: 'text', required: true },
    { id: 'prod-14', phase: 14, question: 'Hast du Produktbilder oder ein Logo?', purpose: 'Assets', inputType: 'select', options: ['Ja, lade ich hoch', 'Nein, AI soll generieren', 'Später ergänzen'], required: true },
    { id: 'prod-15', phase: 15, question: 'Soll ein Charakter das Produkt präsentieren?', purpose: 'Charakter', inputType: 'select', options: ['Ja, als Nutzer', 'Ja, als Präsentator', 'Nein, Fokus aufs Produkt'], required: true },
    { id: 'prod-16', phase: 16, question: 'Welche Stimme soll das Video sprechen?', purpose: 'Voice', inputType: 'select', options: ['Männlich, professionell', 'Männlich, freundlich', 'Weiblich, professionell', 'Weiblich, begeistert'], required: true },
    { id: 'prod-17', phase: 17, question: 'In welcher Sprache?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch'], required: true },
    { id: 'prod-18', phase: 18, question: 'Welche Musikstimmung passt zum Produkt?', purpose: 'Musik', inputType: 'select', options: ['Modern & Upbeat', 'Premium & Elegant', 'Tech & Futuristisch', 'Freundlich & Einladend'], required: true },
    { id: 'prod-19', phase: 19, question: 'Gibt es Produktvideo-Referenzen, die dir gefallen?', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'prod-20', phase: 20, question: 'Perfekt! Bereit für dein Produktvideo. Noch Ergänzungen?', purpose: 'Finale', inputType: 'text', required: false, quickReplies: ['Los gehts!', 'Moment, ich ergänze...'] }
  ],
  totalPhases: 20,
  recommendedStructure: 'feature-showcase',
  recommendedDuration: { min: 30, max: 90 },
  recommendedScenes: { min: 4, max: 8 }
};

// ==========================================
// 5. CORPORATE / UNTERNEHMENSFILM (22 Phasen)
// ==========================================
export const CORPORATE_INTERVIEW: CategoryInterviewConfig = {
  category: 'corporate',
  categoryName: 'Unternehmensfilm',
  categoryDescription: 'Professionelle Unternehmensdarstellung',
  icon: '🏢',
  phases: [
    { id: 'corp-1', phase: 1, question: 'Willkommen! Ich bin Max. Lass uns einen überzeugenden Unternehmensfilm erstellen. Wie heißt dein Unternehmen?', purpose: 'Firmenname', inputType: 'text', required: true },
    { id: 'corp-2', phase: 2, question: 'In welcher Branche ist dein Unternehmen tätig?', purpose: 'Branche', inputType: 'text', required: true },
    { id: 'corp-3', phase: 3, question: 'Was macht dein Unternehmen? Beschreibe es kurz.', purpose: 'Beschreibung', inputType: 'text', required: true },
    { id: 'corp-4', phase: 4, question: 'Für welchen Zweck ist der Unternehmensfilm?', purpose: 'Zweck', inputType: 'select', options: ['Imagefilm allgemein', 'Investor-Präsentation', 'Recruiting/Karriere', 'Kundenpräsentation', 'Messe/Event', 'Website-Header'], required: true },
    { id: 'corp-5', phase: 5, question: 'Wer ist die Zielgruppe des Films?', purpose: 'Zielgruppe', inputType: 'select', options: ['Potenzielle Kunden', 'Investoren', 'Bewerber/Talente', 'Partner/Lieferanten', 'Allgemeine Öffentlichkeit', 'Alle Stakeholder'], required: true },
    { id: 'corp-6', phase: 6, question: 'Was ist die Vision deines Unternehmens?', purpose: 'Vision', inputType: 'text', required: true },
    { id: 'corp-7', phase: 7, question: 'Was ist die Mission? Was treibt euch an?', purpose: 'Mission', inputType: 'text', required: true },
    { id: 'corp-8', phase: 8, question: 'Welche Kernwerte vertretet ihr?', purpose: 'Werte', inputType: 'multiselect', options: ['Innovation', 'Qualität', 'Nachhaltigkeit', 'Kundenfokus', 'Integrität', 'Teamwork', 'Exzellenz', 'Verantwortung'], required: true },
    { id: 'corp-9', phase: 9, question: 'Was unterscheidet euch von der Konkurrenz?', purpose: 'USP', inputType: 'text', required: true },
    { id: 'corp-10', phase: 10, question: 'Gibt es beeindruckende Zahlen? (Mitarbeiter, Kunden, Umsatz, Jahre)', purpose: 'Kennzahlen', inputType: 'text', required: false },
    { id: 'corp-11', phase: 11, question: 'Welche Erfolge oder Meilensteine sollen genannt werden?', purpose: 'Erfolge', inputType: 'text', required: false },
    { id: 'corp-12', phase: 12, question: 'Soll das Team oder die Führung vorgestellt werden?', purpose: 'Team', inputType: 'select', options: ['Ja, Führungsteam', 'Ja, ganzes Team', 'Nein, nur Unternehmen', 'Kurze Team-Impression'], required: true },
    { id: 'corp-13', phase: 13, question: 'Wie lang soll der Film sein?', purpose: 'Dauer', inputType: 'select', options: ['60 Sekunden (Kurz)', '90 Sekunden (Standard)', '2 Minuten (Ausführlich)', '3 Minuten (Umfassend)'], required: true },
    { id: 'corp-14', phase: 14, question: 'Welchen visuellen Stil bevorzugst du?', purpose: 'Stil', inputType: 'select', options: ['Modern & Professionell', 'Warm & Menschlich', 'Premium & Elegant', 'Tech & Innovativ', 'Traditionell & Seriös'], required: true },
    { id: 'corp-15', phase: 15, question: 'Welche Unternehmensfarben sollen verwendet werden?', purpose: 'Farben', inputType: 'text', required: true },
    { id: 'corp-16', phase: 16, question: 'Hast du ein Logo zum Einbinden?', purpose: 'Logo', inputType: 'select', options: ['Ja', 'Nein', 'Später'], required: true },
    { id: 'corp-17', phase: 17, question: 'Welche Stimme soll den Film sprechen?', purpose: 'Voice', inputType: 'select', options: ['Männlich, seriös & kompetent', 'Männlich, warm & vertrauensvoll', 'Weiblich, professionell & klar', 'Weiblich, inspirierend'], required: true },
    { id: 'corp-18', phase: 18, question: 'In welcher Sprache?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch', 'Mehrsprachig'], required: true },
    { id: 'corp-19', phase: 19, question: 'Welche Musikstimmung passt?', purpose: 'Musik', inputType: 'select', options: ['Inspirierend & Aufbauend', 'Professionell & Corporate', 'Modern & Dynamisch', 'Warm & Emotional'], required: true },
    { id: 'corp-20', phase: 20, question: 'Was soll der Zuschauer am Ende tun oder fühlen?', purpose: 'CTA/Ziel', inputType: 'text', required: true },
    { id: 'corp-21', phase: 21, question: 'Gibt es Referenz-Unternehmensfilme, die dir gefallen?', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'corp-22', phase: 22, question: 'Ausgezeichnet! Bereit für deinen Unternehmensfilm. Noch etwas?', purpose: 'Finale', inputType: 'text', required: false, quickReplies: ['Film erstellen!', 'Kurz ergänzen...'] }
  ],
  totalPhases: 22,
  recommendedStructure: '3-act',
  recommendedDuration: { min: 60, max: 180 },
  recommendedScenes: { min: 6, max: 12 }
};

// ==========================================
// 6. SOCIAL CONTENT (20 Phasen)
// ==========================================
export const SOCIAL_CONTENT_INTERVIEW: CategoryInterviewConfig = {
  category: 'social-content',
  categoryName: 'Social Media Content',
  categoryDescription: 'Virale Inhalte für TikTok, Instagram, YouTube Shorts',
  icon: '📱',
  phases: [
    { id: 'social-1', phase: 1, question: 'Hey! Ich bin Max. Lass uns viralen Social Content erstellen! Für welche Plattform hauptsächlich?', purpose: 'Plattform', inputType: 'select', options: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Facebook', 'LinkedIn', 'Mehrere Plattformen'], required: true },
    { id: 'social-2', phase: 2, question: 'Welche Art von Content möchtest du erstellen?', purpose: 'Content-Typ', inputType: 'select', options: ['Educational/Tipps', 'Entertainment', 'Behind the Scenes', 'Produkt-Showcase', 'Trend/Challenge', 'Motivational', 'How-To Quick Tip'], required: true },
    { id: 'social-3', phase: 3, question: 'Was ist dein Thema oder worum geht es?', purpose: 'Thema', inputType: 'text', required: true },
    { id: 'social-4', phase: 4, question: 'Was ist der Hook? Der erste Satz, der Aufmerksamkeit fängt?', purpose: 'Hook', inputType: 'text', required: true, quickReplies: ['POV: ...', 'Du wirst nicht glauben...', '3 Dinge die...', 'Stop scrolling!', 'Unpopular Opinion:'] },
    { id: 'social-5', phase: 5, question: 'Was ist die Hauptbotschaft oder der Mehrwert?', purpose: 'Value', inputType: 'text', required: true },
    { id: 'social-6', phase: 6, question: 'Wer ist deine Zielgruppe auf dieser Plattform?', purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'social-7', phase: 7, question: 'Welchen Stil/Vibe soll das Video haben?', purpose: 'Vibe', inputType: 'select', options: ['Trendy & Gen Z', 'Professionell aber locker', 'Lustig & Unterhaltsam', 'Ästhetisch & Clean', 'Raw & Authentisch', 'Motivierend & Inspirierend'], required: true },
    { id: 'social-8', phase: 8, question: 'Wie lang soll das Video sein?', purpose: 'Dauer', inputType: 'select', options: ['15 Sekunden', '30 Sekunden', '45 Sekunden', '60 Sekunden'], required: true },
    { id: 'social-9', phase: 9, question: 'Welches Format?', purpose: 'Format', inputType: 'select', options: ['9:16 Hochformat (Stories/Reels)', '1:1 Quadrat (Feed)', '16:9 Querformat (YouTube)', '4:5 Portrait (Instagram Feed)'], required: true },
    { id: 'social-10', phase: 10, question: 'Soll Text auf dem Video erscheinen?', purpose: 'Text-Overlays', inputType: 'select', options: ['Ja, viel Text (TikTok-Style)', 'Ja, Key Points', 'Minimal, nur Highlights', 'Nein'], required: true },
    { id: 'social-11', phase: 11, question: 'Welche Farben/Ästhetik?', purpose: 'Farben', inputType: 'select', options: ['Neon & Bold', 'Pastelltöne', 'Schwarz & Weiß + Akzent', 'Warme Erdtöne', 'Brand Colors', 'Bunt & Verspielt'], required: true },
    { id: 'social-12', phase: 12, question: 'Soll ein Charakter/Avatar erscheinen?', purpose: 'Charakter', inputType: 'select', options: ['Ja, animiert', 'Ja, als Cartoon-Version von mir', 'Nein, nur Grafiken', 'Hand/Pointer'], required: true },
    { id: 'social-13', phase: 13, question: 'Welche Stimme/Audio?', purpose: 'Audio', inputType: 'select', options: ['Voice-Over (männlich)', 'Voice-Over (weiblich)', 'Text-to-Speech Style', 'Nur Musik + Text'], required: true },
    { id: 'social-14', phase: 14, question: 'Welche Musik-Vibe?', purpose: 'Musik', inputType: 'select', options: ['Trending TikTok Sound', 'Upbeat & Energetic', 'Chill Lo-Fi', 'Dramatic/Cinematic', 'Keine Musik'], required: true },
    { id: 'social-15', phase: 15, question: 'Gibt es einen Trend-Sound, den du verwenden möchtest?', purpose: 'Trend-Sound', inputType: 'text', required: false },
    { id: 'social-16', phase: 16, question: 'Was ist dein CTA?', purpose: 'CTA', inputType: 'select', options: ['Folgen für mehr', 'Kommentieren', 'Teilen', 'Link in Bio', 'Speichern', 'Duet/Stitch'], required: true },
    { id: 'social-17', phase: 17, question: 'Welche Hashtags planst du zu verwenden?', purpose: 'Hashtags', inputType: 'text', required: false },
    { id: 'social-18', phase: 18, question: 'Hast du Referenz-Videos, die viral gegangen sind?', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'social-19', phase: 19, question: 'Gibt es No-Gos oder was vermieden werden soll?', purpose: 'Ausschlüsse', inputType: 'text', required: false },
    { id: 'social-20', phase: 20, question: 'Perfekt! Ready to go viral? Noch was?', purpose: 'Finale', inputType: 'text', required: false, quickReplies: ['Let\'s go! 🚀', 'Wait, noch was...'] }
  ],
  totalPhases: 20,
  recommendedStructure: 'hook-value-cta',
  recommendedDuration: { min: 15, max: 60 },
  recommendedScenes: { min: 3, max: 6 }
};

// ==========================================
// 7. TESTIMONIAL (20 Phasen)
// ==========================================
export const TESTIMONIAL_INTERVIEW: CategoryInterviewConfig = {
  category: 'testimonial',
  categoryName: 'Testimonial / Kundenstimmen',
  categoryDescription: 'Authentische Kundenerfahrungen und Erfolgsgeschichten',
  icon: '💬',
  phases: [
    { id: 'test-1', phase: 1, question: 'Hallo! Ich bin Max. Lass uns eine überzeugende Kundengeschichte erstellen. Wie heißt dein Unternehmen/Produkt?', purpose: 'Unternehmen', inputType: 'text', required: true },
    { id: 'test-2', phase: 2, question: 'Um welche Art von Testimonial handelt es sich?', purpose: 'Typ', inputType: 'select', options: ['Einzelkunde', 'B2B Case Study', 'Erfolgsgeschichte', 'Vorher/Nachher', 'Produktbewertung'], required: true },
    { id: 'test-3', phase: 3, question: 'Wie heißt der Kunde/die Person im Testimonial?', purpose: 'Kundenname', inputType: 'text', required: true },
    { id: 'test-4', phase: 4, question: 'Was ist der Hintergrund des Kunden? (Beruf, Branche, Situation)', purpose: 'Hintergrund', inputType: 'text', required: true },
    { id: 'test-5', phase: 5, question: 'Welches Problem hatte der Kunde vorher?', purpose: 'Problem', inputType: 'text', required: true },
    { id: 'test-6', phase: 6, question: 'Wie hat dein Produkt/Service das Problem gelöst?', purpose: 'Lösung', inputType: 'text', required: true },
    { id: 'test-7', phase: 7, question: 'Was sind die konkreten Ergebnisse? (Zahlen, Verbesserungen)', purpose: 'Ergebnisse', inputType: 'text', required: true },
    { id: 'test-8', phase: 8, question: 'Gibt es ein direktes Zitat des Kunden?', purpose: 'Zitat', inputType: 'text', required: false },
    { id: 'test-9', phase: 9, question: 'Was würde der Kunde anderen empfehlen?', purpose: 'Empfehlung', inputType: 'text', required: false },
    { id: 'test-10', phase: 10, question: 'Wer ist die Zielgruppe für dieses Testimonial?', purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'test-11', phase: 11, question: 'Wie lang soll das Video sein?', purpose: 'Dauer', inputType: 'select', options: ['60 Sekunden', '90 Sekunden', '2 Minuten'], required: true },
    { id: 'test-12', phase: 12, question: 'Welchen visuellen Stil bevorzugst du?', purpose: 'Stil', inputType: 'select', options: ['Authentisch & Warm', 'Professionell & Clean', 'Emotional & Berührend', 'Modern & Dynamisch'], required: true },
    { id: 'test-13', phase: 13, question: 'Welche Farben passen?', purpose: 'Farben', inputType: 'text', required: true },
    { id: 'test-14', phase: 14, question: 'Soll der Kunde als animierter Charakter erscheinen?', purpose: 'Charakter', inputType: 'select', options: ['Ja, als Person', 'Ja, als Avatar', 'Nein, nur Stimme/Text'], required: true },
    { id: 'test-15', phase: 15, question: 'Beschreibe den Charakter (falls ja).', purpose: 'Charakter-Details', inputType: 'text', required: false },
    { id: 'test-16', phase: 16, question: 'Welche Stimme soll sprechen?', purpose: 'Voice', inputType: 'select', options: ['Erzähler + Kundenzitat', 'Nur Kundenstimme', 'Nur Erzähler'], required: true },
    { id: 'test-17', phase: 17, question: 'Sprache?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch'], required: true },
    { id: 'test-18', phase: 18, question: 'Welche Musikstimmung?', purpose: 'Musik', inputType: 'select', options: ['Emotional & Berührend', 'Inspirierend & Aufbauend', 'Warm & Vertrauensvoll', 'Subtil im Hintergrund'], required: true },
    { id: 'test-19', phase: 19, question: 'Was ist der CTA am Ende?', purpose: 'CTA', inputType: 'text', required: true },
    { id: 'test-20', phase: 20, question: 'Super! Bereit für dein Testimonial-Video. Noch was?', purpose: 'Finale', inputType: 'text', required: false, quickReplies: ['Erstellen!', 'Noch ergänzen...'] }
  ],
  totalPhases: 20,
  recommendedStructure: 'testimonial-arc',
  recommendedDuration: { min: 60, max: 120 },
  recommendedScenes: { min: 5, max: 8 }
};

// ==========================================
// 8. ERKLÄRVIDEO (20 Phasen) - wie bestehendes Studio
// ==========================================
export const EXPLAINER_INTERVIEW: CategoryInterviewConfig = {
  category: 'explainer',
  categoryName: 'Erklärvideo',
  categoryDescription: 'Komplexe Themen einfach erklärt',
  icon: '💡',
  phases: [
    { id: 'exp-1', phase: 1, question: 'Hallo! Ich bin Max und helfe dir, ein großartiges Erklärvideo zu erstellen. Wie heißt dein Unternehmen?', purpose: 'Unternehmen', inputType: 'text', required: true },
    { id: 'exp-2', phase: 2, question: 'Was ist dein Produkt oder Service?', purpose: 'Produkt', inputType: 'text', required: true },
    { id: 'exp-3', phase: 3, question: 'Beschreibe es kurz in 2-3 Sätzen.', purpose: 'Beschreibung', inputType: 'text', required: true },
    { id: 'exp-4', phase: 4, question: 'Wer ist deine Zielgruppe?', purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'exp-5', phase: 5, question: 'Welches Problem löst dein Produkt?', purpose: 'Problem', inputType: 'text', required: true },
    { id: 'exp-6', phase: 6, question: 'Wie löst dein Produkt das Problem?', purpose: 'Lösung', inputType: 'text', required: true },
    { id: 'exp-7', phase: 7, question: 'Was sind die wichtigsten Vorteile (3-5)?', purpose: 'Vorteile', inputType: 'text', required: true },
    { id: 'exp-8', phase: 8, question: 'Was unterscheidet dich von der Konkurrenz?', purpose: 'USP', inputType: 'text', required: true },
    { id: 'exp-9', phase: 9, question: 'Welche Aktion soll der Zuschauer ausführen?', purpose: 'CTA', inputType: 'select', options: ['Website besuchen', 'Kostenlos testen', 'Kontakt aufnehmen', 'Kaufen', 'Mehr erfahren'], required: true },
    { id: 'exp-10', phase: 10, question: 'Wie lang soll das Video sein?', purpose: 'Dauer', inputType: 'select', options: ['60 Sekunden', '90 Sekunden', '2 Minuten', '3 Minuten'], required: true },
    { id: 'exp-11', phase: 11, question: 'Welchen Stil bevorzugst du?', purpose: 'Stil', inputType: 'select', options: ['Flat Design', 'Isometric', 'Whiteboard', 'Modern 3D', 'Comic', 'Corporate'], required: true },
    { id: 'exp-12', phase: 12, question: 'Welche Farben?', purpose: 'Farben', inputType: 'text', required: true },
    { id: 'exp-13', phase: 13, question: 'Soll ein Charakter erscheinen?', purpose: 'Charakter', inputType: 'select', options: ['Ja', 'Nein'], required: true },
    { id: 'exp-14', phase: 14, question: 'Beschreibe den Charakter.', purpose: 'Charakter-Details', inputType: 'text', required: false },
    { id: 'exp-15', phase: 15, question: 'Welche Stimme?', purpose: 'Voice', inputType: 'select', options: ['Männlich, professionell', 'Männlich, freundlich', 'Weiblich, professionell', 'Weiblich, warm'], required: true },
    { id: 'exp-16', phase: 16, question: 'Sprache?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch'], required: true },
    { id: 'exp-17', phase: 17, question: 'Musik-Stil?', purpose: 'Musik', inputType: 'select', options: ['Corporate', 'Upbeat', 'Inspirational', 'Calm', 'Modern'], required: true },
    { id: 'exp-18', phase: 18, question: 'Hast du Referenzen?', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'exp-19', phase: 19, question: 'Was soll vermieden werden?', purpose: 'Ausschlüsse', inputType: 'text', required: false },
    { id: 'exp-20', phase: 20, question: 'Perfekt! Bereit für dein Erklärvideo?', purpose: 'Finale', inputType: 'text', required: false, quickReplies: ['Ja, erstellen!', 'Noch was...'] }
  ],
  totalPhases: 20,
  recommendedStructure: 'problem-solution',
  recommendedDuration: { min: 60, max: 180 },
  recommendedScenes: { min: 5, max: 10 }
};

// ==========================================
// 9. EVENT (20 Phasen)
// ==========================================
export const EVENT_INTERVIEW: CategoryInterviewConfig = {
  category: 'event',
  categoryName: 'Event / Veranstaltung',
  categoryDescription: 'Eventankündigungen und Rückblicke',
  icon: '🎉',
  phases: [
    { id: 'evt-1', phase: 1, question: 'Hallo! Ich bin Max. Lass uns dein Event bewerben! Wie heißt das Event?', purpose: 'Eventname', inputType: 'text', required: true },
    { id: 'evt-2', phase: 2, question: 'Um welche Art von Event handelt es sich?', purpose: 'Event-Typ', inputType: 'select', options: ['Konferenz', 'Workshop', 'Webinar', 'Launch-Event', 'Networking', 'Festival/Party', 'Messe', 'Firmenfeier'], required: true },
    { id: 'evt-3', phase: 3, question: 'Ist es eine Ankündigung oder ein Rückblick?', purpose: 'Video-Typ', inputType: 'select', options: ['Ankündigung', 'Rückblick', 'Teaser', 'Einladung'], required: true },
    { id: 'evt-4', phase: 4, question: 'Wann und wo findet das Event statt?', purpose: 'Details', inputType: 'text', required: true },
    { id: 'evt-5', phase: 5, question: 'Worum geht es beim Event?', purpose: 'Thema', inputType: 'text', required: true },
    { id: 'evt-6', phase: 6, question: 'Wer ist die Zielgruppe?', purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'evt-7', phase: 7, question: 'Was sind die Highlights?', purpose: 'Highlights', inputType: 'text', required: true },
    { id: 'evt-8', phase: 8, question: 'Gibt es besondere Speaker oder Gäste?', purpose: 'Speaker', inputType: 'text', required: false },
    { id: 'evt-9', phase: 9, question: 'Was ist der Nutzen für Teilnehmer?', purpose: 'Nutzen', inputType: 'text', required: true },
    { id: 'evt-10', phase: 10, question: 'Was ist der CTA? (Anmelden, Tickets, etc.)', purpose: 'CTA', inputType: 'text', required: true },
    { id: 'evt-11', phase: 11, question: 'Wie lang soll das Video sein?', purpose: 'Dauer', inputType: 'select', options: ['30 Sekunden', '60 Sekunden', '90 Sekunden', '2 Minuten'], required: true },
    { id: 'evt-12', phase: 12, question: 'Welchen Stil?', purpose: 'Stil', inputType: 'select', options: ['Energetisch & Dynamisch', 'Professionell & Seriös', 'Modern & Stylisch', 'Festlich & Einladend'], required: true },
    { id: 'evt-13', phase: 13, question: 'Eventfarben?', purpose: 'Farben', inputType: 'text', required: true },
    { id: 'evt-14', phase: 14, question: 'Hast du Event-Grafiken/Logo?', purpose: 'Assets', inputType: 'select', options: ['Ja', 'Nein', 'Später'], required: true },
    { id: 'evt-15', phase: 15, question: 'Sollen animierte Personen erscheinen?', purpose: 'Charaktere', inputType: 'select', options: ['Ja, als Teilnehmer', 'Ja, als Host', 'Nein'], required: true },
    { id: 'evt-16', phase: 16, question: 'Voice-Over?', purpose: 'Voice', inputType: 'select', options: ['Männlich, energetisch', 'Weiblich, einladend', 'Professionell', 'Nur Text + Musik'], required: true },
    { id: 'evt-17', phase: 17, question: 'Sprache?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch'], required: true },
    { id: 'evt-18', phase: 18, question: 'Musik-Vibe?', purpose: 'Musik', inputType: 'select', options: ['Energetisch & Upbeat', 'Inspirierend', 'Party & Festival', 'Professionell'], required: true },
    { id: 'evt-19', phase: 19, question: 'Referenzen?', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'evt-20', phase: 20, question: 'Super! Bereit für dein Event-Video?', purpose: 'Finale', inputType: 'text', required: false, quickReplies: ['Los!', 'Moment...'] }
  ],
  totalPhases: 20,
  recommendedStructure: '3-act',
  recommendedDuration: { min: 30, max: 120 },
  recommendedScenes: { min: 4, max: 8 }
};

// ==========================================
// 10. PROMO / TEASER (18 Phasen)
// ==========================================
export const PROMO_INTERVIEW: CategoryInterviewConfig = {
  category: 'promo',
  categoryName: 'Promo / Teaser',
  categoryDescription: 'Kurze Teaser und Ankündigungen',
  icon: '🎬',
  phases: [
    { id: 'promo-1', phase: 1, question: 'Hey! Ich bin Max. Lass uns einen spannenden Teaser erstellen! Was wird beworben?', purpose: 'Produkt', inputType: 'text', required: true },
    { id: 'promo-2', phase: 2, question: 'Was für ein Promo-Typ?', purpose: 'Typ', inputType: 'select', options: ['Produkt-Launch', 'Coming Soon', 'Feature-Teaser', 'Ankündigung', 'Sale/Angebot', 'Event-Teaser'], required: true },
    { id: 'promo-3', phase: 3, question: 'Was ist das Spannende daran? Die Neuigkeit?', purpose: 'Hook', inputType: 'text', required: true },
    { id: 'promo-4', phase: 4, question: 'Wann ist der Launch/das Event?', purpose: 'Timing', inputType: 'text', required: false },
    { id: 'promo-5', phase: 5, question: 'Zielgruppe?', purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'promo-6', phase: 6, question: 'Was ist die Kernbotschaft in einem Satz?', purpose: 'Botschaft', inputType: 'text', required: true },
    { id: 'promo-7', phase: 7, question: 'Soll Spannung aufgebaut werden?', purpose: 'Spannung', inputType: 'select', options: ['Ja, viel Mystery', 'Ja, subtil', 'Nein, direkt zeigen'], required: true },
    { id: 'promo-8', phase: 8, question: 'CTA?', purpose: 'CTA', inputType: 'text', required: true },
    { id: 'promo-9', phase: 9, question: 'Videolänge?', purpose: 'Dauer', inputType: 'select', options: ['15 Sekunden', '30 Sekunden', '45 Sekunden'], required: true },
    { id: 'promo-10', phase: 10, question: 'Stil?', purpose: 'Stil', inputType: 'select', options: ['Cinematic & Dramatisch', 'Modern & Clean', 'Bold & Attention-Grabbing', 'Mysteriös'], required: true },
    { id: 'promo-11', phase: 11, question: 'Farben?', purpose: 'Farben', inputType: 'text', required: true },
    { id: 'promo-12', phase: 12, question: 'Logo einbinden?', purpose: 'Logo', inputType: 'select', options: ['Ja', 'Nein', 'Am Ende'], required: true },
    { id: 'promo-13', phase: 13, question: 'Voice-Over?', purpose: 'Voice', inputType: 'select', options: ['Ja, dramatisch', 'Ja, hype', 'Nein, nur Musik + Text'], required: true },
    { id: 'promo-14', phase: 14, question: 'Sprache?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch'], required: true },
    { id: 'promo-15', phase: 15, question: 'Musik?', purpose: 'Musik', inputType: 'select', options: ['Dramatisch & Cinematic', 'Energetisch & Hype', 'Mysteriös & Spannend', 'Modern & Trendy'], required: true },
    { id: 'promo-16', phase: 16, question: 'Countdown einbauen?', purpose: 'Countdown', inputType: 'select', options: ['Ja', 'Nein'], required: true },
    { id: 'promo-17', phase: 17, question: 'Referenzen?', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'promo-18', phase: 18, question: 'Ready für den Teaser?', purpose: 'Finale', inputType: 'text', required: false, quickReplies: ['Go!', 'Wait...'] }
  ],
  totalPhases: 18,
  recommendedStructure: 'hook-value-cta',
  recommendedDuration: { min: 15, max: 45 },
  recommendedScenes: { min: 3, max: 5 }
};

// ==========================================
// 11. PRESENTATION / PITCH (22 Phasen)
// ==========================================
export const PRESENTATION_INTERVIEW: CategoryInterviewConfig = {
  category: 'presentation',
  categoryName: 'Präsentation / Pitch',
  categoryDescription: 'Überzeugende Präsentationen und Pitches',
  icon: '📊',
  phases: [
    { id: 'pres-1', phase: 1, question: 'Hallo! Ich bin Max. Lass uns einen überzeugenden Pitch erstellen! Worum geht es?', purpose: 'Thema', inputType: 'text', required: true },
    { id: 'pres-2', phase: 2, question: 'Was für eine Präsentation?', purpose: 'Typ', inputType: 'select', options: ['Investor Pitch', 'Sales Presentation', 'Konzept-Pitch', 'Projektvorstellung', 'Keynote'], required: true },
    { id: 'pres-3', phase: 3, question: 'Wer ist das Publikum?', purpose: 'Publikum', inputType: 'select', options: ['Investoren', 'Kunden', 'Management', 'Team', 'Allgemein'], required: true },
    { id: 'pres-4', phase: 4, question: 'Was ist das Ziel? Was soll erreicht werden?', purpose: 'Ziel', inputType: 'text', required: true },
    { id: 'pres-5', phase: 5, question: 'Was ist das Problem/die Chance?', purpose: 'Problem', inputType: 'text', required: true },
    { id: 'pres-6', phase: 6, question: 'Was ist deine Lösung?', purpose: 'Lösung', inputType: 'text', required: true },
    { id: 'pres-7', phase: 7, question: 'Gibt es wichtige Daten/Zahlen?', purpose: 'Daten', inputType: 'text', required: false },
    { id: 'pres-8', phase: 8, question: 'Was ist der USP/Wettbewerbsvorteil?', purpose: 'USP', inputType: 'text', required: true },
    { id: 'pres-9', phase: 9, question: 'Gibt es Social Proof (Kunden, Partner)?', purpose: 'Proof', inputType: 'text', required: false },
    { id: 'pres-10', phase: 10, question: 'Was ist der Ask/CTA?', purpose: 'CTA', inputType: 'text', required: true },
    { id: 'pres-11', phase: 11, question: 'Videolänge?', purpose: 'Dauer', inputType: 'select', options: ['60 Sekunden', '90 Sekunden', '2 Minuten', '3 Minuten'], required: true },
    { id: 'pres-12', phase: 12, question: 'Stil?', purpose: 'Stil', inputType: 'select', options: ['Professional & Clean', 'Modern & Tech', 'Data-Driven', 'Storytelling'], required: true },
    { id: 'pres-13', phase: 13, question: 'Farben?', purpose: 'Farben', inputType: 'text', required: true },
    { id: 'pres-14', phase: 14, question: 'Datenvisualisierungen einbauen?', purpose: 'Charts', inputType: 'select', options: ['Ja, viele Charts', 'Ja, einige', 'Minimal', 'Nein'], required: true },
    { id: 'pres-15', phase: 15, question: 'Logo/Branding?', purpose: 'Branding', inputType: 'select', options: ['Ja', 'Nein'], required: true },
    { id: 'pres-16', phase: 16, question: 'Soll ein Presenter-Charakter erscheinen?', purpose: 'Charakter', inputType: 'select', options: ['Ja', 'Nein'], required: true },
    { id: 'pres-17', phase: 17, question: 'Voice-Over?', purpose: 'Voice', inputType: 'select', options: ['Männlich, überzeugend', 'Weiblich, kompetent', 'Professionell neutral'], required: true },
    { id: 'pres-18', phase: 18, question: 'Sprache?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch'], required: true },
    { id: 'pres-19', phase: 19, question: 'Musik?', purpose: 'Musik', inputType: 'select', options: ['Inspirierend', 'Corporate', 'Modern', 'Subtil'], required: true },
    { id: 'pres-20', phase: 20, question: 'Referenzen?', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'pres-21', phase: 21, question: 'No-Gos?', purpose: 'Ausschlüsse', inputType: 'text', required: false },
    { id: 'pres-22', phase: 22, question: 'Bereit für deinen Pitch?', purpose: 'Finale', inputType: 'text', required: false, quickReplies: ['Let\'s pitch!', 'Moment...'] }
  ],
  totalPhases: 22,
  recommendedStructure: 'problem-solution',
  recommendedDuration: { min: 60, max: 180 },
  recommendedScenes: { min: 6, max: 10 }
};

// ==========================================
// 12. CUSTOM / BENUTZERDEFINIERT (20 Phasen)
// ==========================================
export const CUSTOM_INTERVIEW: CategoryInterviewConfig = {
  category: 'custom',
  categoryName: 'Benutzerdefiniert',
  categoryDescription: 'Erstellen Sie ein individuelles Video nach Ihren Wünschen',
  icon: '✨',
  phases: [
    { id: 'cust-1', phase: 1, question: 'Willkommen! Ich bin Max. Du möchtest ein individuelles Video erstellen. Was ist das Thema/Ziel?', purpose: 'Thema', inputType: 'text', required: true },
    { id: 'cust-2', phase: 2, question: 'Beschreibe deine Vision für das Video in eigenen Worten.', purpose: 'Vision', inputType: 'text', required: true },
    { id: 'cust-3', phase: 3, question: 'Für wen ist das Video?', purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'cust-4', phase: 4, question: 'Was soll der Zuschauer fühlen oder tun?', purpose: 'Ziel', inputType: 'text', required: true },
    { id: 'cust-5', phase: 5, question: 'Gibt es eine bestimmte Story oder Struktur, die du dir vorstellst?', purpose: 'Struktur', inputType: 'text', required: true },
    { id: 'cust-6', phase: 6, question: 'Was sind die Kernbotschaften (max. 3)?', purpose: 'Botschaften', inputType: 'text', required: true },
    { id: 'cust-7', phase: 7, question: 'Welche Szenen oder Momente sollen vorkommen?', purpose: 'Szenen', inputType: 'text', required: true },
    { id: 'cust-8', phase: 8, question: 'Wie lang soll das Video sein?', purpose: 'Dauer', inputType: 'select', options: ['30 Sekunden', '60 Sekunden', '90 Sekunden', '2 Minuten', '3 Minuten', '5 Minuten'], required: true },
    { id: 'cust-9', phase: 9, question: 'Welches Format?', purpose: 'Format', inputType: 'select', options: ['16:9 Landscape', '9:16 Portrait', '1:1 Square', 'Mehrere Formate'], required: true },
    { id: 'cust-10', phase: 10, question: 'Welchen visuellen Stil stellst du dir vor?', purpose: 'Stil', inputType: 'text', required: true },
    { id: 'cust-11', phase: 11, question: 'Welche Farben?', purpose: 'Farben', inputType: 'text', required: true },
    { id: 'cust-12', phase: 12, question: 'Soll ein Charakter erscheinen? Beschreibe ihn.', purpose: 'Charakter', inputType: 'text', required: false },
    { id: 'cust-13', phase: 13, question: 'Hast du Bilder, Logos oder andere Assets?', purpose: 'Assets', inputType: 'select', options: ['Ja, lade ich hoch', 'Nein', 'Später'], required: true },
    { id: 'cust-14', phase: 14, question: 'Welche Art von Voice-Over?', purpose: 'Voice', inputType: 'text', required: true },
    { id: 'cust-15', phase: 15, question: 'Sprache?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch', 'Andere'], required: true },
    { id: 'cust-16', phase: 16, question: 'Welche Musik passt?', purpose: 'Musik', inputType: 'text', required: true },
    { id: 'cust-17', phase: 17, question: 'Gibt es besondere Effekte oder Animationen, die du möchtest?', purpose: 'Effekte', inputType: 'text', required: false },
    { id: 'cust-18', phase: 18, question: 'Hast du Referenzvideos?', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'cust-19', phase: 19, question: 'Was sollte auf keinen Fall im Video sein?', purpose: 'Ausschlüsse', inputType: 'text', required: false },
    { id: 'cust-20', phase: 20, question: 'Perfekt! Ich habe deine Vision verstanden. Noch etwas?', purpose: 'Finale', inputType: 'text', required: false, quickReplies: ['Nein, erstellen!', 'Ja, ergänzen...'] }
  ],
  totalPhases: 20,
  recommendedStructure: '3-act',
  recommendedDuration: { min: 30, max: 300 },
  recommendedScenes: { min: 3, max: 15 }
};

// ==========================================
// EXPORT: Alle Interviews
// ==========================================
export const ALL_CATEGORY_INTERVIEWS: Record<VideoCategory, CategoryInterviewConfig> = {
  'advertisement': ADVERTISEMENT_INTERVIEW,
  'storytelling': STORYTELLING_INTERVIEW,
  'tutorial': TUTORIAL_INTERVIEW,
  'product-video': PRODUCT_VIDEO_INTERVIEW,
  'corporate': CORPORATE_INTERVIEW,
  'social-content': SOCIAL_CONTENT_INTERVIEW,
  'testimonial': TESTIMONIAL_INTERVIEW,
  'explainer': EXPLAINER_INTERVIEW,
  'event': EVENT_INTERVIEW,
  'promo': PROMO_INTERVIEW,
  'presentation': PRESENTATION_INTERVIEW,
  'custom': CUSTOM_INTERVIEW,
};

// Helper: Interview für Kategorie abrufen
export function getInterviewForCategory(category: VideoCategory): CategoryInterviewConfig {
  return ALL_CATEGORY_INTERVIEWS[category];
}

// Helper: Alle Kategorien mit Phasen-Anzahl
export function getCategoryPhaseCounts(): { category: VideoCategory; name: string; phases: number }[] {
  return Object.values(ALL_CATEGORY_INTERVIEWS).map(config => ({
    category: config.category,
    name: config.categoryName,
    phases: config.totalPhases,
  }));
}

// Helper: Gesamtzahl aller Fragen
export function getTotalQuestionCount(): number {
  return Object.values(ALL_CATEGORY_INTERVIEWS).reduce((sum, config) => sum + config.totalPhases, 0);
}
