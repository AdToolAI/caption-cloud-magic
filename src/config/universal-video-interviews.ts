// ==========================================
// Universal Video Creator - Interview Configurations
// 4 Templates: Corporate Ad, Product Ad, Storytelling, Custom
// ==========================================

import { CategoryInterviewConfig, InterviewPhase, VideoCategory } from '@/types/universal-video-creator';

// ==========================================
// 1. UNTERNEHMENSWERBUNG (22 Phasen)
// ==========================================
export const CORPORATE_AD_INTERVIEW: CategoryInterviewConfig = {
  category: 'corporate-ad',
  categoryName: 'Unternehmenswerbung',
  categoryDescription: 'Professionelle Werbevideos für Unternehmen und Dienstleistungen',
  icon: '🏢',
  phases: [
    { id: 'ca-1', phase: 1, question: 'Willkommen! Ich bin Max, dein KI-Berater. Was ist der Name deines Unternehmens oder deiner Marke?', purpose: 'Markenidentifikation', inputType: 'text', required: true },
    { id: 'ca-2', phase: 2, question: 'Welches Produkt oder welche Dienstleistung möchtest du bewerben?', purpose: 'Produktdefinition', inputType: 'text', required: true },
    { id: 'ca-3', phase: 3, question: 'Beschreibe dein Unternehmen/Service in 2-3 Sätzen. Was macht es besonders?', purpose: 'USP-Erfassung', inputType: 'text', required: true },
    { id: 'ca-4', phase: 4, question: 'Wer ist deine Zielgruppe? Beschreibe deinen idealen Kunden.', purpose: 'Zielgruppenanalyse', inputType: 'text', required: true, quickReplies: ['Junge Erwachsene 18-25', 'Berufstätige 25-45', 'Familien mit Kindern', 'Best Ager 50+', 'B2B Entscheider'] },
    { id: 'ca-5', phase: 5, question: 'Welches EINE Hauptproblem löst dein Unternehmen für diese Zielgruppe?', purpose: 'Problemdefinition', inputType: 'text', required: true },
    { id: 'ca-6', phase: 6, question: 'Was ist der wichtigste emotionale Nutzen für den Kunden?', purpose: 'Emotionaler Benefit', inputType: 'text', required: true, quickReplies: ['Zeitersparnis', 'Geld sparen', 'Mehr Sicherheit', 'Besseres Aussehen', 'Mehr Erfolg', 'Weniger Stress'] },
    { id: 'ca-7', phase: 7, question: 'Was unterscheidet dich von der Konkurrenz? Nenne 2-3 Alleinstellungsmerkmale.', purpose: 'Differenzierung', inputType: 'text', required: true },
    { id: 'ca-8', phase: 8, question: 'Was ist eure Mission und Vision? Warum existiert euer Unternehmen?', purpose: 'Mission/Vision', inputType: 'text', required: true },
    { id: 'ca-9', phase: 9, question: 'Welche Aktion soll der Zuschauer nach dem Video ausführen?', purpose: 'CTA-Definition', inputType: 'select', options: ['Website besuchen', 'Jetzt kaufen', 'Kostenlos testen', 'Termin buchen', 'Mehr erfahren', 'Anrufen', 'App herunterladen'], required: true },
    { id: 'ca-10', phase: 10, question: 'Wie soll der genaue CTA-Text lauten? (z.B. "Jetzt kostenlos testen")', purpose: 'CTA-Text', inputType: 'text', required: true },
    { id: 'ca-11', phase: 11, question: 'Wo soll das Video primär ausgespielt werden?', purpose: 'Plattformoptimierung', inputType: 'multiselect', options: ['TV/Streaming', 'YouTube', 'Facebook/Instagram', 'TikTok', 'LinkedIn', 'Website', 'Messe/Event'], required: true },
    { id: 'ca-12', phase: 12, question: 'Welche Videolänge bevorzugst du?', purpose: 'Dauer', inputType: 'select', options: ['15 Sekunden (Bumper)', '30 Sekunden (Standard)', '60 Sekunden (Ausführlich)', '90 Sekunden (Storytelling)'], required: true },
    { id: 'ca-13', phase: 13, question: 'Welchen visuellen Stil stellst du dir vor?', purpose: 'Stil-Definition', inputType: 'select', options: ['Modern & Clean', 'Bold & Farbenfroh', 'Minimalistisch', 'Cinematic', 'Corporate/Seriös', 'Trendy/Social Media'], required: true },
    { id: 'ca-14', phase: 14, question: 'Welche Farben repräsentieren deine Marke? (Hex-Codes oder Beschreibung)', purpose: 'Branding', inputType: 'text', required: true, quickReplies: ['Blau & Weiß', 'Schwarz & Gold', 'Grün & Weiß', 'Rot & Schwarz', 'Violett & Rosa'] },
    { id: 'ca-15', phase: 15, question: 'Hast du ein Logo, das eingebunden werden soll?', purpose: 'Logo-Integration', inputType: 'select', options: ['Ja, ich lade es hoch', 'Nein, kein Logo nötig', 'Logo wird später ergänzt'], required: true },
    { id: 'ca-16', phase: 16, question: 'Soll ein animierter Charakter/Maskottchen im Video erscheinen?', purpose: 'Charakter', inputType: 'select', options: ['Ja, mit Charakter', 'Nein, nur Grafiken', 'Vielleicht, bin unsicher'], required: true },
    { id: 'ca-17', phase: 17, question: 'Welche Stimme soll das Voice-Over haben?', purpose: 'Voice-Over', inputType: 'select', options: ['Männlich, professionell', 'Männlich, freundlich', 'Weiblich, professionell', 'Weiblich, warm', 'Männlich, energetisch', 'Weiblich, dynamisch'], required: true },
    { id: 'ca-18', phase: 18, question: 'In welcher Sprache soll das Video sein?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch', 'Deutsch & Englisch'], required: true },
    { id: 'ca-19', phase: 19, question: 'Welche Musikstimmung passt zu deiner Werbung?', purpose: 'Musik', inputType: 'select', options: ['Energetisch & Upbeat', 'Inspirierend & Emotional', 'Modern & Trendy', 'Professionell & Corporate', 'Entspannt & Vertrauensvoll', 'Dramatisch & Cinematic'], required: true },
    { id: 'ca-20', phase: 20, question: 'Gibt es besondere Szenen oder Momente, die unbedingt vorkommen sollen?', purpose: 'Szenen-Wünsche', inputType: 'text', required: false },
    { id: 'ca-21', phase: 21, question: 'Hast du Referenzvideos oder Beispiele, die dir gefallen? (URLs oder Beschreibung)', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'ca-22', phase: 22, question: 'Perfekt! Lass mich zusammenfassen und dann erstelle ich dein Video. Möchtest du noch etwas ergänzen?', purpose: 'Finale Bestätigung', inputType: 'text', required: false, quickReplies: ['Nein, sieht gut aus!', 'Ja, ich möchte ergänzen...'] }
  ],
  totalPhases: 22,
  recommendedStructure: 'aida',
  recommendedDuration: { min: 15, max: 90 },
  recommendedScenes: { min: 4, max: 8 }
};

// ==========================================
// 2. PRODUKTWERBUNG (20 Phasen)
// ==========================================
export const PRODUCT_AD_INTERVIEW: CategoryInterviewConfig = {
  category: 'product-ad',
  categoryName: 'Produktwerbung',
  categoryDescription: 'Kreative Produktvideos mit deinen eigenen Produktfotos',
  icon: '📦',
  phases: [
    { id: 'pa-1', phase: 1, question: 'Wie heißt dein Produkt? Du hast bereits Bilder hochgeladen — lass uns das perfekte Werbevideo erstellen!', purpose: 'Produktname', inputType: 'text', required: true },
    { id: 'pa-2', phase: 2, question: 'Um was für eine Art von Produkt handelt es sich?', purpose: 'Produktkategorie', inputType: 'select', options: ['Physisches Produkt', 'Software/App', 'Online-Service', 'Hardware/Gerät', 'Lebensmittel/Getränk', 'Mode/Accessoire', 'Kosmetik/Beauty'], required: true },
    { id: 'pa-3', phase: 3, question: 'Beschreibe dein Produkt in 2-3 Sätzen. Was macht es und warum braucht man es?', purpose: 'Produktbeschreibung', inputType: 'text', required: true },
    { id: 'pa-4', phase: 4, question: 'Welches PROBLEM löst dein Produkt und welche EMOTIONALE REAKTION soll der Zuschauer beim Anblick haben?', purpose: 'Problem & Emotion', inputType: 'text', required: true },
    { id: 'pa-5', phase: 5, question: 'Was sind die Top 3 FEATURES und was unterscheidet dein Produkt vom Wettbewerb?', purpose: 'Features & USP', inputType: 'text', required: true },
    { id: 'pa-6', phase: 6, question: 'Beschreibe eine ALLTAGSSZENE in der dein Produkt den entscheidenden Unterschied macht.', purpose: 'Alltagsszene', inputType: 'text', required: true },
    { id: 'pa-7', phase: 7, question: 'Was würde ein BEGEISTERTER KUNDE über dein Produkt in 10 Sekunden sagen?', purpose: 'Testimonial-Hook', inputType: 'text', required: true },
    { id: 'pa-8', phase: 8, question: 'Welchen FILMISCHEN STIL stellst du dir vor?', purpose: 'Filmischer Stil', inputType: 'select', options: ['Apple-like minimal & clean', 'Nike-energetisch & dynamisch', 'Luxury-elegant & premium', 'Lifestyle casual & authentisch', 'Tech-futuristisch & innovativ', 'Handmade/Organic & natürlich'], required: true },
    { id: 'pa-9', phase: 9, question: 'Gibt es ein UNBOXING- oder REVEAL-MOMENT den wir dramatisch inszenieren können?', purpose: 'Reveal-Moment', inputType: 'text', required: false, quickReplies: ['Ja, Unboxing inszenieren', 'Ja, dramatischer Product-Reveal', 'Nein, direkt mit Produkt starten'] },
    { id: 'pa-10', phase: 10, question: 'Wer ist die Zielgruppe für dieses Produkt?', purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'pa-11', phase: 11, question: 'Gibt es einen Preis oder ein Angebot, das im Video genannt werden soll?', purpose: 'Pricing', inputType: 'text', required: false },
    { id: 'pa-12', phase: 12, question: 'Welche Aktion soll der Zuschauer nach dem Video ausführen?', purpose: 'CTA', inputType: 'select', options: ['Jetzt kaufen', 'Mehr erfahren', 'Kostenlos testen', 'Zum Shop', 'Vorbestellen', 'Link in Bio'], required: true },
    { id: 'pa-13', phase: 13, question: 'Wie soll der genaue CTA-Text lauten?', purpose: 'CTA-Text', inputType: 'text', required: true },
    { id: 'pa-14', phase: 14, question: 'Welche Farben repräsentieren dein Produkt/deine Marke?', purpose: 'Branding', inputType: 'text', required: true, quickReplies: ['Schwarz & Gold', 'Weiß & Minimalistisch', 'Bunte Markenfarben', 'Natürliche Erdtöne'] },
    { id: 'pa-15', phase: 15, question: 'Soll ein animierter Charakter im Video erscheinen?', purpose: 'Charakter', inputType: 'select', options: ['Ja, mit Charakter', 'Nein, Produkt im Fokus', 'Nur Hände/Interaktion'], required: true },
    { id: 'pa-16', phase: 16, question: 'Welche Stimme soll das Voice-Over haben?', purpose: 'Voice-Over', inputType: 'select', options: ['Männlich, professionell', 'Männlich, locker & modern', 'Weiblich, warm & vertrauensvoll', 'Weiblich, dynamisch & energetisch'], required: true },
    { id: 'pa-17', phase: 17, question: 'Welche Musikstimmung passt zu deinem Produkt?', purpose: 'Musik', inputType: 'select', options: ['Energetisch & Upbeat', 'Premium & Elegant', 'Modern & Trendy', 'Entspannt & Feel-Good', 'Dramatisch & Cinematic'], required: true },
    { id: 'pa-18', phase: 18, question: 'Welche Videolänge bevorzugst du?', purpose: 'Dauer', inputType: 'select', options: ['15 Sekunden (Bumper)', '30 Sekunden (Standard)', '60 Sekunden (Ausführlich)', '90 Sekunden (Storytelling)'], required: true },
    { id: 'pa-19', phase: 19, question: 'Gibt es etwas, das du auf keinen Fall im Video haben möchtest?', purpose: 'Ausschlüsse', inputType: 'text', required: false },
    { id: 'pa-20', phase: 20, question: 'Perfekt! Ich habe alles. Noch etwas ergänzen?', purpose: 'Finale', inputType: 'text', required: false, quickReplies: ['Nein, Video erstellen!', 'Ja, ich ergänze...'] }
  ],
  totalPhases: 20,
  recommendedStructure: 'problem-solution',
  recommendedDuration: { min: 15, max: 90 },
  recommendedScenes: { min: 4, max: 8 }
};

// ==========================================
// 3. STORYTELLING (24 Phasen)
// ==========================================
export const STORYTELLING_INTERVIEW: CategoryInterviewConfig = {
  category: 'storytelling',
  categoryName: 'Storytelling',
  categoryDescription: 'Emotionale Geschichten — erfunden oder wahr, filmisch erzählt',
  icon: '📖',
  phases: [
    { id: 'story-1', phase: 1, question: 'Willkommen! Ich bin Max und helfe dir, eine fesselnde Geschichte zu erzählen. Was ist der Name deines Unternehmens oder deiner Marke?', purpose: 'Markenidentifikation', inputType: 'text', required: true },
    { id: 'story-2', phase: 2, question: 'Welche Art von Geschichte möchtest du erzählen?', purpose: 'Story-Typ', inputType: 'select', options: ['Gründergeschichte', 'Markengeschichte', 'Kundengeschichte', 'Fiktive Story', 'Unternehmensgeschichte', 'Vision & Mission'], required: true },
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
// 4. FREIER EDITOR (20 Phasen)
// ==========================================
export const CUSTOM_INTERVIEW: CategoryInterviewConfig = {
  category: 'custom',
  categoryName: 'Freier Editor',
  categoryDescription: 'Volle Kontrolle — erstelle jedes beliebige Video',
  icon: '✨',
  phases: [
    { id: 'cust-1', phase: 1, question: 'Willkommen im Freien Editor! Beschreibe deine Video-Idee in 2-3 Sätzen.', purpose: 'Idee', inputType: 'text', required: true },
    { id: 'cust-2', phase: 2, question: 'Was für eine Art Video möchtest du erstellen?', purpose: 'Video-Typ', inputType: 'select', options: ['Tutorial/How-To', 'Erklärvideo', 'Social Media Content', 'Event-Video', 'Promo/Teaser', 'Präsentation/Pitch', 'Testimonial', 'Anderes'], required: true },
    { id: 'cust-3', phase: 3, question: 'Welches Ziel soll das Video erreichen?', purpose: 'Ziel', inputType: 'text', required: true },
    { id: 'cust-4', phase: 4, question: 'Wer ist die Zielgruppe für dieses Video?', purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'cust-5', phase: 5, question: 'Gibt es ein Produkt, Service oder Thema im Fokus? Beschreibe es.', purpose: 'Fokus', inputType: 'text', required: true },
    { id: 'cust-6', phase: 6, question: 'Was ist die Kernbotschaft in einem Satz?', purpose: 'Kernbotschaft', inputType: 'text', required: true },
    { id: 'cust-7', phase: 7, question: 'Welche Struktur soll das Video haben?', purpose: 'Struktur', inputType: 'select', options: ['Problem → Lösung', 'Hook → Wert → CTA', 'Schritt-für-Schritt', 'Vorher/Nachher', 'Feature-Showcase', 'Freie Erzählung', 'Listenformat'], required: true },
    { id: 'cust-8', phase: 8, question: 'Welchen visuellen Stil stellst du dir vor?', purpose: 'Visueller Stil', inputType: 'select', options: ['Modern & Clean', 'Cinematic', 'Minimalistisch', 'Bold & Farbenfroh', 'Comic/Cartoon', 'Dokumentarisch', 'Futuristisch'], required: true },
    { id: 'cust-9', phase: 9, question: 'Welche Farben sollen verwendet werden?', purpose: 'Farben', inputType: 'text', required: true, quickReplies: ['Blau & Weiß', 'Schwarz & Gold', 'Bunt & Lebendig', 'Markenfarben'] },
    { id: 'cust-10', phase: 10, question: 'Wie lang soll das Video sein?', purpose: 'Dauer', inputType: 'select', options: ['15 Sekunden', '30 Sekunden', '60 Sekunden', '2 Minuten', '3 Minuten', '5 Minuten'], required: true },
    { id: 'cust-11', phase: 11, question: 'Soll ein animierter Charakter im Video erscheinen?', purpose: 'Charakter', inputType: 'select', options: ['Ja, mit Charakter', 'Nein, nur Grafiken', 'Vielleicht'], required: true },
    { id: 'cust-12', phase: 12, question: 'Welche Stimme soll das Voice-Over haben?', purpose: 'Voice-Over', inputType: 'select', options: ['Männlich, professionell', 'Männlich, locker', 'Weiblich, warm', 'Weiblich, dynamisch', 'Kein Voice-Over'], required: true },
    { id: 'cust-13', phase: 13, question: 'In welcher Sprache soll das Video sein?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch', 'Spanisch', 'Mehrsprachig'], required: true },
    { id: 'cust-14', phase: 14, question: 'Welche Musikstimmung passt?', purpose: 'Musik', inputType: 'select', options: ['Energetisch', 'Inspirierend', 'Entspannt', 'Professionell', 'Emotional', 'Keine Musik'], required: true },
    { id: 'cust-15', phase: 15, question: 'Für welche Plattform ist das Video primär gedacht?', purpose: 'Plattform', inputType: 'multiselect', options: ['YouTube', 'Instagram/TikTok', 'LinkedIn', 'Website', 'Präsentation', 'E-Mail/Newsletter'], required: true },
    { id: 'cust-16', phase: 16, question: 'Welche Aktion soll der Zuschauer am Ende ausführen?', purpose: 'CTA', inputType: 'text', required: true },
    { id: 'cust-17', phase: 17, question: 'Gibt es besondere Szenen die vorkommen müssen?', purpose: 'Szenen', inputType: 'text', required: false },
    { id: 'cust-18', phase: 18, question: 'Hast du Referenzvideos oder Inspirationen?', purpose: 'Referenzen', inputType: 'text', required: false },
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
  'corporate-ad': CORPORATE_AD_INTERVIEW,
  'product-ad': PRODUCT_AD_INTERVIEW,
  'storytelling': STORYTELLING_INTERVIEW,
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
