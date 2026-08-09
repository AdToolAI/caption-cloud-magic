import { tx } from "@/lib/i18nText";
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
  categoryDescription: tx({ de: 'Professionelle Werbevideos für Unternehmen und Dienstleistungen', en: 'Professional promotional videos for businesses and services', es: 'Videos promocionales profesionales para empresas y servicios' }),
  icon: '🏢',
  phases: [
    { id: 'ca-1', phase: 1, question: tx({ de: 'Willkommen! Ich bin Max, dein KI-Berater. Was ist der Name deines Unternehmens oder deiner Marke?', en: 'Welcome! I\'m Max, your AI consultant. What is the name of your company or brand?', es: '¡Bienvenido! Soy Max, tu consultor de IA. ¿Cuál es el nombre de tu empresa o marca?' }), purpose: 'Markenidentifikation', inputType: 'text', required: true },
    { id: 'ca-2', phase: 2, question: 'Welches Produkt oder welche Dienstleistung möchtest du bewerben?', purpose: 'Produktdefinition', inputType: 'text', required: true },
    { id: 'ca-3', phase: 3, question: 'Beschreibe dein Unternehmen/Service in 2-3 Sätzen. Was macht es besonders?', purpose: 'USP-Erfassung', inputType: 'text', required: true },
    { id: 'ca-4', phase: 4, question: tx({ de: 'Wer ist deine Zielgruppe? Beschreibe deinen idealen Kunden.', en: 'Who is your target audience? Describe your ideal customer.', es: '¿Quién es tu público objetivo? Describe a tu cliente ideal.' }), purpose: 'Zielgruppenanalyse', inputType: 'text', required: true, quickReplies: ['Junge Erwachsene 18-25', 'Berufstätige 25-45', 'Familien mit Kindern', 'Best Ager 50+', 'B2B Entscheider'] },
    { id: 'ca-5', phase: 5, question: tx({ de: 'Welches EINE Hauptproblem löst dein Unternehmen für diese Zielgruppe?', en: 'What ONE main problem does your company solve for this target audience?', es: '¿Qué UN problema principal resuelve tu empresa para este público objetivo?' }), purpose: 'Problemdefinition', inputType: 'text', required: true },
    { id: 'ca-6', phase: 6, question: tx({ de: 'Was ist der wichtigste emotionale Nutzen für den Kunden?', en: 'What is the most important emotional benefit for the customer?', es: '¿Cuál es el beneficio emocional más importante para el cliente?' }), purpose: 'Emotionaler Benefit', inputType: 'text', required: true, quickReplies: ['Zeitersparnis', 'Geld sparen', 'Mehr Sicherheit', 'Besseres Aussehen', 'Mehr Erfolg', 'Weniger Stress'] },
    { id: 'ca-7', phase: 7, question: 'Was unterscheidet dich von der Konkurrenz? Nenne 2-3 Alleinstellungsmerkmale.', purpose: 'Differenzierung', inputType: 'text', required: true },
    { id: 'ca-8', phase: 8, question: tx({ de: 'Was ist eure Mission und Vision? Warum existiert euer Unternehmen?', en: 'What is your mission and vision? Why does your company exist?', es: '¿Cuál es tu misión y visión? ¿Por qué existe tu empresa?' }), purpose: 'Mission/Vision', inputType: 'text', required: true },
    { id: 'ca-9', phase: 9, question: 'Welche Aktion soll der Zuschauer nach dem Video ausführen?', purpose: 'CTA-Definition', inputType: 'select', options: ['Website besuchen', 'Jetzt kaufen', 'Kostenlos testen', 'Termin buchen', 'Mehr erfahren', 'Anrufen', 'App herunterladen'], required: true },
    { id: 'ca-10', phase: 10, question: 'Wie soll der genaue CTA-Text lauten? (z.B. "Jetzt kostenlos testen")', purpose: 'CTA-Text', inputType: 'text', required: true },
    { id: 'ca-11', phase: 11, question: 'Wo soll das Video primär ausgespielt werden?', purpose: 'Plattformoptimierung', inputType: 'multiselect', options: ['TV/Streaming', 'YouTube', 'Facebook/Instagram', 'TikTok', 'LinkedIn', 'Website', 'Messe/Event'], required: true },
    { id: 'ca-12', phase: 12, question: 'Welche Videolänge bevorzugst du?', purpose: 'Dauer', inputType: 'select', options: ['15 Sekunden (Bumper)', '30 Sekunden (Standard)', '60 Sekunden (Ausführlich)', '90 Sekunden (Storytelling)'], required: true },
    { id: 'ca-13', phase: 13, question: 'Welchen visuellen Stil stellst du dir vor?', purpose: 'Stil-Definition', inputType: 'select', options: ['Modern & Clean', 'Bold & Farbenfroh', 'Minimalistisch', 'Cinematic', 'Corporate/Seriös', 'Trendy/Social Media'], required: true },
    { id: 'ca-14', phase: 14, question: tx({ de: 'Welche Farben repräsentieren deine Marke? (Hex-Codes oder Beschreibung)', en: 'What colors represent your brand? (Hex codes or description)', es: '¿Qué colores representan tu marca? (Códigos hexadecimales o descripción)' }), purpose: 'Branding', inputType: 'text', required: true, quickReplies: ['Blau & Weiß', 'Schwarz & Gold', 'Grün & Weiß', 'Rot & Schwarz', 'Violett & Rosa'] },
    { id: 'ca-15', phase: 15, question: 'Hast du ein Logo, das eingebunden werden soll?', purpose: 'Logo-Integration', inputType: 'select', options: ['Ja, ich lade es hoch', 'Nein, kein Logo nötig', 'Logo wird später ergänzt'], required: true },
    { id: 'ca-16', phase: 16, question: 'Soll ein animierter Charakter/Maskottchen im Video erscheinen?', purpose: 'Charakter', inputType: 'select', options: [tx({ de: 'Ja, mit Charakter', en: 'Yes, with character', es: 'Sí, con carácter' }), 'Nein, nur Grafiken', 'Vielleicht, bin unsicher'], required: true },
    { id: 'ca-17', phase: 17, question: 'Welche Stimme soll das Voice-Over haben?', purpose: 'Voice-Over', inputType: 'select', options: ['Männlich, professionell', 'Männlich, freundlich', 'Weiblich, professionell', 'Weiblich, warm', 'Männlich, energetisch', 'Weiblich, dynamisch'], required: true },
    { id: 'ca-18', phase: 18, question: 'In welcher Sprache soll das Video sein?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch', 'Deutsch & Englisch'], required: true },
    { id: 'ca-19', phase: 19, question: 'Welche Musikstimmung passt zu deiner Werbung?', purpose: 'Musik', inputType: 'select', options: ['Energetisch & Upbeat', 'Inspirierend & Emotional', 'Modern & Trendy', 'Professionell & Corporate', 'Entspannt & Vertrauensvoll', 'Dramatisch & Cinematic'], required: true },
    { id: 'ca-20', phase: 20, question: tx({ de: 'Gibt es besondere Szenen oder Momente, die unbedingt vorkommen sollen?', en: 'Are there any special scenes or moments that absolutely must be included?', es: '¿Hay alguna escena o momento especial que deba incluirse sí o sí?' }), purpose: 'Szenen-Wünsche', inputType: 'text', required: false },
    { id: 'ca-21', phase: 21, question: tx({ de: 'Hast du Referenzvideos oder Beispiele, die dir gefallen? (URLs oder Beschreibung)', en: 'Do you have reference videos or examples that you like? (URLs or description)', es: '¿Tienes videos de referencia o ejemplos que te gusten? (URLs o descripción)' }), purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'ca-22', phase: 22, question: tx({ de: 'Perfekt! Lass mich zusammenfassen und dann erstelle ich dein Video. Möchtest du noch etwas ergänzen?', en: 'Perfect! Let me summarize and then I\'ll create your video. Would you like to add anything else?', es: '¡Perfecto! Permítame resumir y luego crearé su video. ¿Le gustaría añadir algo más?' }), purpose: 'Finale Bestätigung', inputType: 'text', required: false, quickReplies: ['Nein, sieht gut aus!', 'Ja, ich möchte ergänzen...'] }
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
  categoryDescription: tx({ de: 'Kreative Produktvideos mit deinen eigenen Produktfotos', en: 'Creative product videos with your own product photos', es: 'Videos de productos creativos con tus propias fotos de productos' }),
  icon: '📦',
  phases: [
    { id: 'pa-1', phase: 1, question: tx({ de: 'Wie heißt dein Produkt? Du hast bereits Bilder hochgeladen — lass uns das perfekte Werbevideo erstellen!', en: 'What is your product called? You\'ve already uploaded images — let\'s create the perfect promotional video!', es: '¿Cómo se llama su producto? Ya ha subido imágenes, ¡creemos el video promocional perfecto!' }), purpose: 'Produktname', inputType: 'text', required: true },
    { id: 'pa-2', phase: 2, question: tx({ de: 'Um was für eine Art von Produkt handelt es sich?', en: 'What kind of product is it?', es: '¿Qué tipo de producto es?' }), purpose: 'Produktkategorie', inputType: 'select', options: ['Physisches Produkt', 'Software/App', 'Online-Service', 'Hardware/Gerät', 'Lebensmittel/Getränk', 'Mode/Accessoire', 'Kosmetik/Beauty'], required: true },
    { id: 'pa-3', phase: 3, question: tx({ de: 'Beschreibe dein Produkt in 2-3 Sätzen. Was macht es und warum braucht man es?', en: 'Describe your product in 2-3 sentences. What does it do and why is it needed?', es: 'Describa su producto en 2-3 frases. ¿Qué hace y por qué se necesita?' }), purpose: 'Produktbeschreibung', inputType: 'text', required: true },
    { id: 'pa-4', phase: 4, question: tx({ de: 'Welches PROBLEM löst dein Produkt und welche EMOTIONALE REAKTION soll der Zuschauer beim Anblick haben?', en: 'What PROBLEM does your product solve and what EMOTIONAL REACTION should the viewer have when seeing it?', es: '¿Qué PROBLEMA resuelve su producto y qué REACCIÓN EMOCIONAL debería tener el espectador al verlo?' }), purpose: 'Problem & Emotion', inputType: 'text', required: true },
    { id: 'pa-5', phase: 5, question: tx({ de: 'Was sind die Top 3 FEATURES und was unterscheidet dein Produkt vom Wettbewerb?', en: 'What are the top 3 FEATURES and what differentiates your product from the competition?', es: '¿Cuáles son las 3 CARACTERÍSTICAS principales y qué diferencia a su producto de la competencia?' }), purpose: 'Features & USP', inputType: 'text', required: true },
    { id: 'pa-6', phase: 6, question: tx({ de: 'Beschreibe eine ALLTAGSSZENE in der dein Produkt den entscheidenden Unterschied macht.', en: 'Describe an EVERYDAY SCENE where your product makes a decisive difference.', es: 'Describa una ESCENA COTIDIANA en la que su producto marque una diferencia decisiva.' }), purpose: 'Alltagsszene', inputType: 'text', required: true },
    { id: 'pa-7', phase: 7, question: tx({ de: 'Was würde ein BEGEISTERTER KUNDE über dein Produkt in 10 Sekunden sagen?', en: 'What would an ENTHUSIASTIC CUSTOMER say about your product in 10 seconds?', es: '¿Qué diría un CLIENTE ENTUSIASTA sobre su producto en 10 segundos?' }), purpose: 'Testimonial-Hook', inputType: 'text', required: true },
    { id: 'pa-8', phase: 8, question: 'Welchen FILMISCHEN STIL stellst du dir vor?', purpose: 'Filmischer Stil', inputType: 'select', options: ['Apple-like minimal & clean', 'Nike-energetisch & dynamisch', 'Luxury-elegant & premium', 'Lifestyle casual & authentisch', 'Tech-futuristisch & innovativ', 'Handmade/Organic & natürlich'], required: true },
    { id: 'pa-9', phase: 9, question: 'Gibt es ein UNBOXING- oder REVEAL-MOMENT den wir dramatisch inszenieren können?', purpose: 'Reveal-Moment', inputType: 'text', required: false, quickReplies: ['Ja, Unboxing inszenieren', 'Ja, dramatischer Product-Reveal', tx({ de: 'Nein, direkt mit Produkt starten', en: 'No, start directly with the product', es: 'No, empezar directamente con el producto' })] },
    { id: 'pa-10', phase: 10, question: tx({ de: 'Wer ist die Zielgruppe für dieses Produkt?', en: 'Who is the target audience for this product?', es: '¿Quién es el público objetivo de este producto?' }), purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'pa-11', phase: 11, question: tx({ de: 'Gibt es einen Preis oder ein Angebot, das im Video genannt werden soll?', en: 'Is there a price or offer that should be mentioned in the video?', es: '¿Hay algún precio u oferta que deba mencionarse en el video?' }), purpose: 'Pricing', inputType: 'text', required: false },
    { id: 'pa-12', phase: 12, question: 'Welche Aktion soll der Zuschauer nach dem Video ausführen?', purpose: 'CTA', inputType: 'select', options: ['Jetzt kaufen', 'Mehr erfahren', 'Kostenlos testen', 'Zum Shop', 'Vorbestellen', 'Link in Bio'], required: true },
    { id: 'pa-13', phase: 13, question: 'Wie soll der genaue CTA-Text lauten?', purpose: 'CTA-Text', inputType: 'text', required: true },
    { id: 'pa-14', phase: 14, question: tx({ de: 'Welche Farben repräsentieren dein Produkt/deine Marke?', en: 'Which colors represent your product/brand?', es: '¿Qué colores representan su producto/marca?' }), purpose: 'Branding', inputType: 'text', required: true, quickReplies: ['Schwarz & Gold', 'Weiß & Minimalistisch', 'Bunte Markenfarben', 'Natürliche Erdtöne'] },
    { id: 'pa-15', phase: 15, question: 'Soll ein animierter Charakter im Video erscheinen?', purpose: 'Charakter', inputType: 'select', options: [tx({ de: 'Ja, mit Charakter', en: 'Yes, with character', es: 'Sí, con carácter' }), 'Nein, Produkt im Fokus', 'Nur Hände/Interaktion'], required: true },
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
    { id: 'story-1', phase: 1, question: tx({ de: 'Willkommen! Ich bin Max und helfe dir, eine fesselnde Geschichte zu erzählen. Was ist der Name deines Unternehmens oder deiner Marke?', en: 'Welcome! I\'m Max and I\'ll help you tell a captivating story. What is the name of your company or brand?', es: '¡Bienvenido! Soy Max y te ayudaré a contar una historia cautivadora. ¿Cuál es el nombre de tu empresa o marca?' }), purpose: 'Markenidentifikation', inputType: 'text', required: true },
    { id: 'story-2', phase: 2, question: 'Welche Art von Geschichte möchtest du erzählen?', purpose: 'Story-Typ', inputType: 'select', options: ['Gründergeschichte', 'Markengeschichte', 'Kundengeschichte', 'Fiktive Story', 'Unternehmensgeschichte', 'Vision & Mission'], required: true },
    { id: 'story-3', phase: 3, question: tx({ de: 'Wer ist der Held deiner Geschichte? (Person, Unternehmen, Kunde, Produkt)', en: 'Who is the hero of your story? (Person, company, customer, product)', es: '¿Quién es el héroe de tu historia? (Persona, empresa, cliente, producto)' }), purpose: 'Protagonist', inputType: 'text', required: true },
    { id: 'story-4', phase: 4, question: 'Was ist der Ausgangspunkt der Geschichte? Wie war die Situation am Anfang?', purpose: 'Setup', inputType: 'text', required: true },
    { id: 'story-5', phase: 5, question: tx({ de: 'Welches Problem oder welche Herausforderung musste überwunden werden?', en: 'What problem or challenge had to be overcome?', es: '¿Qué problema o desafío hubo que superar?' }), purpose: 'Konflikt', inputType: 'text', required: true },
    { id: 'story-6', phase: 6, question: 'Was war der Wendepunkt? Der entscheidende Moment der Veränderung?', purpose: 'Wendepunkt', inputType: 'text', required: true },
    { id: 'story-7', phase: 7, question: tx({ de: 'Wie wurde das Problem gelöst? Was war die Lösung oder Erkenntnis?', en: 'How was the problem solved? What was the solution or insight?', es: '¿Cómo se resolvió el problema? ¿Cuál fue la solución o el descubrimiento?' }), purpose: 'Lösung', inputType: 'text', required: true },
    { id: 'story-8', phase: 8, question: tx({ de: 'Was ist das Ergebnis? Wie sieht die Situation jetzt aus?', en: 'What is the result? What does the situation look like now?', es: '¿Cuál es el resultado? ¿Cómo es la situación ahora?' }), purpose: 'Resolution', inputType: 'text', required: true },
    { id: 'story-9', phase: 9, question: 'Welche Emotion soll der Zuschauer am Ende empfinden?', purpose: 'Emotionales Ziel', inputType: 'select', options: ['Inspiriert', 'Berührt', 'Motiviert', 'Vertrauensvoll', 'Begeistert', 'Hoffnungsvoll', 'Verbunden'], required: true },
    { id: 'story-10', phase: 10, question: tx({ de: 'Wer ist die Zielgruppe für diese Geschichte?', en: 'Who is the target audience for this story?', es: '¿Quién es el público objetivo de esta historia?' }), purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'story-11', phase: 11, question: 'Was ist die zentrale Botschaft, die hängen bleiben soll?', purpose: 'Kernbotschaft', inputType: 'text', required: true },
    { id: 'story-12', phase: 12, question: tx({ de: 'Welche Werte oder Überzeugungen sollen vermittelt werden?', en: 'What values or beliefs should be conveyed?', es: '¿Qué valores o creencias deben transmitirse?' }), purpose: 'Werte', inputType: 'multiselect', options: ['Innovation', 'Nachhaltigkeit', 'Qualität', 'Familie', 'Mut', 'Ehrlichkeit', 'Leidenschaft', 'Gemeinschaft'], required: true },
    { id: 'story-13', phase: 13, question: 'Wie lang soll die Geschichte sein?', purpose: 'Dauer', inputType: 'select', options: ['60 Sekunden (Kurzform)', '90 Sekunden (Standard)', '2 Minuten (Ausführlich)', '3 Minuten (Episch)'], required: true },
    { id: 'story-14', phase: 14, question: 'Welchen visuellen Stil stellst du dir vor?', purpose: 'Visueller Stil', inputType: 'select', options: ['Cinematic & Filmisch', 'Dokumentarisch & Authentisch', 'Emotional & Warm', 'Modern & Stylisch', 'Nostalgisch & Vintage', 'Künstlerisch & Kreativ'], required: true },
    { id: 'story-15', phase: 15, question: tx({ de: 'Welche Farben und Stimmung passen zur Geschichte?', en: 'What colors and mood suit the story?', es: '¿Qué colores y ambiente se adaptan a la historia?' }), purpose: 'Farbstimmung', inputType: 'select', options: ['Warme Erdtöne', 'Kühle Blautöne', 'Lebendige Farben', 'Schwarz-Weiß Akzente', 'Pastelltöne', 'Markenfarben'], required: true },
    { id: 'story-16', phase: 16, question: tx({ de: 'Soll ein Charakter oder eine Person im Video erscheinen?', en: 'Should a character or person appear in the video?', es: '¿Debería aparecer un personaje o una persona en el video?' }), purpose: 'Charakter', inputType: 'select', options: ['Ja, animierter Charakter', 'Ja, reale Person (als Animation)', 'Nein, nur visuelle Szenen', 'Symbol oder Maskottchen'], required: true },
    { id: 'story-17', phase: 17, question: 'Beschreibe den Charakter näher (Aussehen, Persönlichkeit).', purpose: 'Charakter-Details', inputType: 'text', required: false },
    { id: 'story-18', phase: 18, question: 'Welche Stimme soll die Geschichte erzählen?', purpose: 'Erzählerstimme', inputType: 'select', options: ['Männlich, warm & vertrauensvoll', 'Männlich, inspirierend', 'Weiblich, emotional & einfühlsam', 'Weiblich, kraftvoll & motivierend', 'Ich-Erzähler (Protagonist)'], required: true },
    { id: 'story-19', phase: 19, question: tx({ de: 'In welcher Sprache soll die Geschichte erzählt werden?', en: 'In what language should the story be told?', es: '¿En qué idioma debe contarse la historia?' }), purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch', 'Mehrsprachig'], required: true },
    { id: 'story-20', phase: 20, question: 'Welche Musikstimmung unterstreicht die Geschichte am besten?', purpose: 'Musik', inputType: 'select', options: ['Emotional & Berührend', 'Inspirierend & Aufbauend', 'Episch & Cinematic', 'Sanft & Nachdenklich', 'Hoffnungsvoll & Optimistisch'], required: true },
    { id: 'story-21', phase: 21, question: tx({ de: 'Gibt es besondere visuelle Elemente oder Szenen, die vorkommen sollen?', en: 'Are there any special visual elements or scenes that should be included?', es: '¿Hay algún elemento visual o escena especial que deba incluirse?' }), purpose: 'Visuelle Wünsche', inputType: 'text', required: false },
    { id: 'story-22', phase: 22, question: 'Hast du Referenzvideos, die dich inspiriert haben?', purpose: 'Referenzen', inputType: 'text', required: false },
    { id: 'story-23', phase: 23, question: tx({ de: 'Was soll der Zuschauer nach dem Video tun oder denken?', en: 'What should the viewer do or think after the video?', es: '¿Qué debería hacer o pensar el espectador después del video?' }), purpose: 'CTA/Outcome', inputType: 'text', required: true },
    { id: 'story-24', phase: 24, question: tx({ de: 'Wunderbar! Deine Geschichte nimmt Form an. Möchtest du noch etwas hinzufügen?', en: 'Wonderful! Your story is taking shape. Would you like to add anything else?', es: '¡Maravilloso! Tu historia está tomando forma. ¿Te gustaría añadir algo más?' }), purpose: 'Finale Bestätigung', inputType: 'text', required: false, quickReplies: ['Nein, lass uns starten!', 'Ja, ich möchte ergänzen...'] }
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
    { id: 'cust-2', phase: 2, question: tx({ de: 'Was für eine Art Video möchtest du erstellen?', en: 'What kind of video do you want to create?', es: '¿Qué tipo de video quieres crear?' }), purpose: 'Video-Typ', inputType: 'select', options: ['Tutorial/How-To', 'Erklärvideo', 'Social Media Content', 'Event-Video', 'Promo/Teaser', 'Präsentation/Pitch', 'Testimonial', 'Anderes'], required: true },
    { id: 'cust-3', phase: 3, question: 'Welches Ziel soll das Video erreichen?', purpose: 'Ziel', inputType: 'text', required: true },
    { id: 'cust-4', phase: 4, question: tx({ de: 'Wer ist die Zielgruppe für dieses Video?', en: 'Who is the target audience for this video?', es: '¿Quién es el público objetivo de este video?' }), purpose: 'Zielgruppe', inputType: 'text', required: true },
    { id: 'cust-5', phase: 5, question: 'Gibt es ein Produkt, Service oder Thema im Fokus? Beschreibe es.', purpose: 'Fokus', inputType: 'text', required: true },
    { id: 'cust-6', phase: 6, question: tx({ de: 'Was ist die Kernbotschaft in einem Satz?', en: 'What is the core message in one sentence?', es: '¿Cuál es el mensaje principal en una frase?' }), purpose: 'Kernbotschaft', inputType: 'text', required: true },
    { id: 'cust-7', phase: 7, question: 'Welche Struktur soll das Video haben?', purpose: 'Struktur', inputType: 'select', options: ['Problem → Lösung', 'Hook → Wert → CTA', 'Schritt-für-Schritt', 'Vorher/Nachher', 'Feature-Showcase', 'Freie Erzählung', 'Listenformat'], required: true },
    { id: 'cust-8', phase: 8, question: 'Welchen visuellen Stil stellst du dir vor?', purpose: 'Visueller Stil', inputType: 'select', options: ['Modern & Clean', 'Cinematic', 'Minimalistisch', 'Bold & Farbenfroh', 'Comic/Cartoon', 'Dokumentarisch', 'Futuristisch'], required: true },
    { id: 'cust-9', phase: 9, question: 'Welche Farben sollen verwendet werden?', purpose: 'Farben', inputType: 'text', required: true, quickReplies: ['Blau & Weiß', 'Schwarz & Gold', 'Bunt & Lebendig', 'Markenfarben'] },
    { id: 'cust-10', phase: 10, question: 'Wie lang soll das Video sein?', purpose: 'Dauer', inputType: 'select', options: ['15 Sekunden', '30 Sekunden', '60 Sekunden', '2 Minuten', '3 Minuten', '5 Minuten'], required: true },
    { id: 'cust-11', phase: 11, question: 'Soll ein animierter Charakter im Video erscheinen?', purpose: 'Charakter', inputType: 'select', options: [tx({ de: 'Ja, mit Charakter', en: 'Yes, with character', es: 'Sí, con carácter' }), 'Nein, nur Grafiken', 'Vielleicht'], required: true },
    { id: 'cust-12', phase: 12, question: 'Welche Stimme soll das Voice-Over haben?', purpose: 'Voice-Over', inputType: 'select', options: ['Männlich, professionell', 'Männlich, locker', 'Weiblich, warm', 'Weiblich, dynamisch', 'Kein Voice-Over'], required: true },
    { id: 'cust-13', phase: 13, question: 'In welcher Sprache soll das Video sein?', purpose: 'Sprache', inputType: 'select', options: ['Deutsch', 'Englisch', 'Spanisch', 'Mehrsprachig'], required: true },
    { id: 'cust-14', phase: 14, question: 'Welche Musikstimmung passt?', purpose: 'Musik', inputType: 'select', options: ['Energetisch', 'Inspirierend', 'Entspannt', 'Professionell', 'Emotional', 'Keine Musik'], required: true },
    { id: 'cust-15', phase: 15, question: 'Für welche Plattform ist das Video primär gedacht?', purpose: 'Plattform', inputType: 'multiselect', options: ['YouTube', 'Instagram/TikTok', 'LinkedIn', 'Website', 'Präsentation', 'E-Mail/Newsletter'], required: true },
    { id: 'cust-16', phase: 16, question: 'Welche Aktion soll der Zuschauer am Ende ausführen?', purpose: 'CTA', inputType: 'text', required: true },
    { id: 'cust-17', phase: 17, question: tx({ de: 'Gibt es besondere Szenen die vorkommen müssen?', en: 'Are there any specific scenes that must be included?', es: '¿Hay alguna escena específica que deba incluirse?' }), purpose: 'Szenen', inputType: 'text', required: false },
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
