import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Category-specific interview configurations with BRANDNEUE Fragen
const CATEGORY_INTERVIEWS: Record<string, { phases: Array<{ question: string; extractionKey: string; quickReplies?: string[] }> }> = {
  'werbevideo': {
    phases: [
      { question: "Welches Kampagnenziel verfolgst du? (Awareness, Consideration, Conversion)", extractionKey: "campaignGoal", quickReplies: ["Awareness steigern", "Leads generieren", "Direktverkauf", "Retargeting", "App-Installationen"] },
      { question: "Wer ist deine Zielgruppe? Beschreibe deinen idealen Kunden in 2-3 Sätzen.", extractionKey: "targetAudience", quickReplies: ["B2B Entscheider", "Junge Konsumenten", "Familien", "Unternehmer", "Ich beschreibe..."] },
      { question: "Was ist der größte Schmerzpunkt deiner Zielgruppe?", extractionKey: "painPoint", quickReplies: ["Zeitdruck", "Kosten", "Komplexität", "Unsicherheit", "Anderer Schmerzpunkt..."] },
      { question: "Was ist dein USP (Unique Selling Proposition) in einem Satz?", extractionKey: "usp", quickReplies: ["Preis-Leistung", "Qualität", "Innovation", "Service", "Ich formuliere..."] },
      { question: "Welche Emotion soll das Video auslösen? (FOMO, Vertrauen, Begeisterung, Dringlichkeit)", extractionKey: "emotionalTrigger", quickReplies: ["FOMO/Dringlichkeit", "Vertrauen", "Begeisterung", "Neugierde", "Inspiration"] },
      { question: "Wie sieht dein Scroll-Stopper aus? (Erste 3 Sekunden)", extractionKey: "hookStrategy", quickReplies: ["Provokante Frage", "Schockierendes Fakt", "Visualer Wow-Moment", "Direkte Ansprache", "Ich beschreibe..."] },
      { question: "Welche Social-Proof-Elemente hast du? (Zahlen, Testimonials, Logos, Awards)", extractionKey: "socialProof", quickReplies: ["Kundenzahlen", "Testimonials", "Bekannte Logos", "Awards", "Keine/Wenige"] },
      { question: "Was ist das konkrete Angebot? (Preis, Bonus, Garantie, Zeitlimit)", extractionKey: "offer", quickReplies: ["Rabatt-Aktion", "Gratis Test", "Bonus-Bundle", "Geld-zurück-Garantie", "Ich beschreibe..."] },
      { question: "Welcher CTA (Call-to-Action)? Text + Ziel-URL", extractionKey: "cta", quickReplies: ["Jetzt kaufen", "Mehr erfahren", "Gratis testen", "Termin buchen", "Eigener CTA..."] },
      { question: "Auf welchen Plattformen läuft die Werbung?", extractionKey: "platforms", quickReplies: ["Meta (FB/IG)", "YouTube", "TikTok", "LinkedIn", "Alle Plattformen"] },
      { question: "Welcher visuelle Stil? (Modern, Luxus, Verspielt, Corporate, Minimalistisch)", extractionKey: "visualStyle", quickReplies: ["Modern/Clean", "Luxus/Premium", "Verspielt/Bunt", "Corporate/Seriös", "Minimalistisch"] },
      { question: "Hast du Brand Guidelines? (Farben, Fonts, Logo)", extractionKey: "brandGuidelines", quickReplies: ["Ja, vollständig", "Nur Farben/Logo", "Flexibel", "Noch keine", "Ich lade hoch..."] },
      { question: "Soll eine Person/Charakter erscheinen?", extractionKey: "characterType", quickReplies: ["Ja, animiert", "Ja, real", "Nein, nur Grafiken", "Optional", "Icons/Illustrationen"] },
      { question: "Welcher Voice-Over Stil? (Energetisch, Vertrauenswürdig, Freundlich)", extractionKey: "voiceStyle", quickReplies: ["Energetisch", "Vertrauenswürdig", "Freundlich", "Professionell", "Kein Voice-Over"] },
      { question: "Welche Musik-Stimmung?", extractionKey: "musicMood", quickReplies: ["Upbeat/Energetisch", "Inspirierend", "Corporate/Neutral", "Emotional", "Keine Musik"] },
      { question: "Untertitel ein- oder ausschalten?", extractionKey: "subtitlesEnabled", quickReplies: ["✅ Ja, Untertitel", "❌ Nein, ohne"] },
      { question: "Gewünschte Video-Länge?", extractionKey: "duration", quickReplies: ["15 Sekunden", "30 Sekunden", "45 Sekunden", "60 Sekunden", "Länger"] },
      { question: "Welche Formate brauchst du? (16:9, 9:16, 1:1)", extractionKey: "formats", quickReplies: ["16:9 (Landscape)", "9:16 (Vertical)", "1:1 (Square)", "Alle drei", "16:9 + 9:16"] },
      { question: "Möchtest du A/B-Varianten erstellen?", extractionKey: "abVariants", quickReplies: ["Ja, 2 Varianten", "Ja, 3+ Varianten", "Nein, eine Version", "Später entscheiden"] },
      { question: "Soll das Video zum Director's Cut exportiert werden für weitere Bearbeitung?", extractionKey: "exportToDirectorsCut", quickReplies: ["✅ Ja, zum DC", "❌ Nein, fertig"] },
    ]
  },
  'storytelling': {
    phases: [
      { question: "Welche Art von Geschichte möchtest du erzählen?", extractionKey: "storyType", quickReplies: ["Gründer-Story", "Kunden-Journey", "Produkt-Entstehung", "Vision & Mission", "Transformation"] },
      { question: "Wer ist der Protagonist/Held der Geschichte?", extractionKey: "protagonist", quickReplies: ["Gründer selbst", "Ein Kunde", "Das Produkt", "Das Team", "Ich beschreibe..."] },
      { question: "Was war die Ausgangssituation vor der Transformation?", extractionKey: "startingSituation", quickReplies: ["Frustration", "Problem", "Traum", "Krise", "Ich beschreibe..."] },
      { question: "Welches Hindernis/Problem musste überwunden werden?", extractionKey: "obstacle", quickReplies: ["Finanzierung", "Technische Hürde", "Markt-Zweifel", "Persönliche Challenge", "Ich beschreibe..."] },
      { question: "Was war der Tiefpunkt (dunkelster Moment)?", extractionKey: "lowPoint", quickReplies: ["Fast aufgegeben", "Großer Verlust", "Ablehnung", "Zweifel", "Ich beschreibe..."] },
      { question: "Was war der Wendepunkt (der alles veränderte)?", extractionKey: "turningPoint", quickReplies: ["Durchbruch", "Begegnung", "Erkenntnis", "Chance", "Ich beschreibe..."] },
      { question: "Wie sieht die Transformation aus? (Vorher → Nachher)", extractionKey: "transformation", quickReplies: ["Erfolgreich", "Größer", "Zufriedener", "Impact", "Ich beschreibe..."] },
      { question: "Welche Emotionen soll der Zuschauer durchleben? (Reihenfolge)", extractionKey: "emotionalJourney", quickReplies: ["Mitgefühl→Hoffnung→Freude", "Spannung→Erleichterung", "Neugierde→Inspiration", "Ich beschreibe..."] },
      { question: "Was ist die tiefere Botschaft/Moral?", extractionKey: "moralMessage", quickReplies: ["Niemals aufgeben", "Gemeinsam stärker", "Innovation siegt", "Träume leben", "Ich beschreibe..."] },
      { question: "Warum wird sich die Zielgruppe identifizieren?", extractionKey: "relatability", quickReplies: ["Ähnliches Problem", "Gleiche Werte", "Gemeinsamer Traum", "Ich beschreibe..."] },
      { question: "Welche authentischen Momente können wir zeigen?", extractionKey: "authenticMoments", quickReplies: ["Echte Fotos", "Behind-the-Scenes", "Interviews", "Dokumente", "Ich beschreibe..."] },
      { question: "Welche visuellen Metaphern/Symbole passen?", extractionKey: "visualMetaphors", quickReplies: ["Reise/Weg", "Aufstieg/Berg", "Licht/Dunkel", "Brücke/Verbindung", "Keine spezifischen"] },
      { question: "Welche Musik unterstreicht die emotionale Reise?", extractionKey: "musicMood", quickReplies: ["Cinematic/Episch", "Emotional/Piano", "Inspirierend", "Ambient/Subtle", "Ich beschreibe..."] },
      { question: "Welche Narrative Struktur? (3-Akt, In Media Res, Non-Linear)", extractionKey: "narrativeStructure", quickReplies: ["3-Akt klassisch", "In Media Res", "Non-Linear", "Rahmenerzählung", "Ich beschreibe..."] },
      { question: "Welcher Voice-Over Stil?", extractionKey: "voiceStyle", quickReplies: ["Intim/Persönlich", "Erzähler/Narrator", "Dialog/Gespräch", "Kein Voice-Over"] },
      { question: "Wie subtil oder offensichtlich soll die Marke erscheinen?", extractionKey: "brandIntegration", quickReplies: ["Sehr subtil", "Am Ende sichtbar", "Durchgehend präsent", "Nur Logo", "Ich beschreibe..."] },
      { question: "Was ist der emotionale Höhepunkt?", extractionKey: "climax", quickReplies: ["Erfolgsmoment", "Erkenntnis", "Vereinigung", "Durchbruch", "Ich beschreibe..."] },
      { question: "Wie endet die Geschichte? (Open End, Happy End, Cliffhanger)", extractionKey: "ending", quickReplies: ["Happy End", "Open End", "Call to Action", "Cliffhanger", "Ich beschreibe..."] },
      { question: "Untertitel ein- oder ausschalten?", extractionKey: "subtitlesEnabled", quickReplies: ["✅ Ja, Untertitel", "❌ Nein, ohne"] },
      { question: "Gewünschte Länge?", extractionKey: "duration", quickReplies: ["60 Sekunden", "90 Sekunden", "120 Sekunden", "180 Sekunden", "Länger"] },
      { question: "Soll das Video zum Director's Cut exportiert werden?", extractionKey: "exportToDirectorsCut", quickReplies: ["✅ Ja, zum DC", "❌ Nein, fertig"] },
    ]
  },
  'social-media': {
    phases: [
      { question: "Für welche Plattform ist das Video primär?", extractionKey: "platform", quickReplies: ["TikTok", "Instagram Reels", "YouTube Shorts", "Alle Plattformen", "Facebook"] },
      { question: "Welcher Content-Typ? (Educational, Entertainment, Inspirational, Behind-the-Scenes)", extractionKey: "contentType", quickReplies: ["Educational", "Entertainment", "Inspirational", "Behind-the-Scenes", "Mixed"] },
      { question: "Gibt es einen aktuellen Trend/Sound den wir nutzen sollen?", extractionKey: "trendReference", quickReplies: ["Ja, ich nenne ihn", "Trending Audio nutzen", "Eigene Musik", "Kein spezifischer Trend"] },
      { question: "Was ist dein Scroll-Stopper für die ersten 1-3 Sekunden?", extractionKey: "hookStrategy", quickReplies: ["Text Hook", "Visuelle Überraschung", "Direkte Frage", "POV Setup", "Ich beschreibe..."] },
      { question: "Wie halten wir Retention? (Loop, Cliffhanger, Payoff am Ende)", extractionKey: "retentionTactic", quickReplies: ["Loop", "Cliffhanger", "Payoff am Ende", "Story Arc", "Quick Cuts"] },
      { question: "Native/Authentisch oder Hochproduziert aussehen?", extractionKey: "productionStyle", quickReplies: ["Native/Lo-Fi", "Hochproduziert", "Mix aus beidem", "Trend-Ästhetik"] },
      { question: "Spricht jemand direkt in die Kamera?", extractionKey: "faceToCam", quickReplies: ["Ja, Person", "Nein, nur Grafiken", "AI Avatar", "Text-to-Speech"] },
      { question: "Welche Text-Overlays/Key-Messages einblenden?", extractionKey: "textOverlays", quickReplies: ["3-5 Key Points", "Nur Hook + CTA", "Durchgehend Text", "Minimal", "Ich beschreibe..."] },
      { question: "Sound-Design: Trending Sound, Voice-Over, oder Musik?", extractionKey: "soundDesign", quickReplies: ["Trending Sound", "Voice-Over", "Hintergrundmusik", "Mix", "Sound Effects"] },
      { question: "Welche Hashtags sind relevant?", extractionKey: "hashtags", quickReplies: ["Nischen-Hashtags", "Trending Hashtags", "Brand Hashtag", "Mix", "Ich nenne sie..."] },
      { question: "Welcher CTA-Style? (Soft: Link in Bio, Hard: Jetzt kaufen, Keiner)", extractionKey: "ctaStyle", quickReplies: ["Link in Bio", "Jetzt kaufen", "Folgen/Liken", "Soft CTA", "Kein CTA"] },
      { question: "Teil einer Content-Serie oder Einzelvideo?", extractionKey: "seriesType", quickReplies: ["Einzelvideo", "Teil einer Serie", "Erste Folge", "Regelmäßiger Content"] },
      { question: "Engagement-Hook: Frage ans Publikum für Kommentare?", extractionKey: "engagementHook", quickReplies: ["Ja, Frage stellen", "Poll/Abstimmung", "Meinungsaustausch", "Keine Interaktion"] },
      { question: "Welcher visuelle Stil? (Trendy, Clean, Lo-Fi, Aesthetic)", extractionKey: "visualStyle", quickReplies: ["Trendy/Viral", "Clean/Minimal", "Lo-Fi/Authentic", "Aesthetic/Curated"] },
      { question: "Untertitel ein- oder ausschalten?", extractionKey: "subtitlesEnabled", quickReplies: ["✅ Ja, Untertitel", "❌ Nein, ohne"] },
      { question: "Länge?", extractionKey: "duration", quickReplies: ["15 Sekunden", "30 Sekunden", "45 Sekunden", "60 Sekunden"] },
      { question: "Cross-Posting für andere Plattformen adaptieren?", extractionKey: "crossPosting", quickReplies: ["Ja, alle Formate", "Nur 9:16", "9:16 + 1:1", "Nein, nur eine"] },
      { question: "Soll das Video zum Director's Cut exportiert werden?", extractionKey: "exportToDirectorsCut", quickReplies: ["✅ Ja, zum DC", "❌ Nein, fertig"] },
    ]
  },
  'testimonial': {
    phases: [
      { question: "Welchen Typ Testimonial möchtest du erstellen?", extractionKey: "testimonialType", quickReplies: ["Einzelkunde", "Multiple Kunden", "Case Study", "Video-Review", "Erfolgsgeschichte"] },
      { question: "Wer ist der ideale Kunde für dieses Testimonial?", extractionKey: "idealCustomer", quickReplies: ["Ich nenne Namen/Firma", "Typischer Kunde", "Prominenter Kunde", "Ich beschreibe..."] },
      { question: "Wie war die Situation VOR deinem Produkt?", extractionKey: "beforeSituation", quickReplies: ["Frustration", "Hohe Kosten", "Zeitverlust", "Qualitätsprobleme", "Ich beschreibe..."] },
      { question: "Was war das größte Problem?", extractionKey: "mainProblem", quickReplies: ["Effizienz", "Kosten", "Qualität", "Zeit", "Ich beschreibe..."] },
      { question: "Warum hat der Kunde sich für dich entschieden?", extractionKey: "decisionReason", quickReplies: ["Empfehlung", "Features", "Preis", "Service", "Ich beschreibe..."] },
      { question: "Wie war der Implementierungs-Prozess?", extractionKey: "implementation", quickReplies: ["Schnell & einfach", "Mit Support", "Selbstständig", "Ich beschreibe..."] },
      { question: "Welche messbaren Ergebnisse? (Zahlen!)", extractionKey: "measurableResults", quickReplies: ["% Steigerung", "€ Ersparnis", "Zeit gespart", "Konkrete Zahlen..."] },
      { question: "Wie fühlt sich der Kunde jetzt?", extractionKey: "emotionalResult", quickReplies: ["Erleichtert", "Begeistert", "Zuversichtlich", "Produktiver", "Ich beschreibe..."] },
      { question: "Gab es unerwartete positive Nebeneffekte?", extractionKey: "unexpectedBenefits", quickReplies: ["Ja, ich nenne sie", "Team-Motivation", "Mehr Kunden", "Keine spezifischen"] },
      { question: "Was würde der Kunde Skeptikern sagen?", extractionKey: "skepticAnswer", quickReplies: ["Einfach testen", "ROI belegen", "Persönlich überzeugt", "Ich beschreibe..."] },
      { question: "Wem würde der Kunde das Produkt empfehlen?", extractionKey: "recommendTo", quickReplies: ["Jedem in Branche", "Bestimmte Größe", "Spezifisches Problem", "Ich beschreibe..."] },
      { question: "Welcher Format-Stil? (Interview, Story, Direct-to-Camera)", extractionKey: "formatStyle", quickReplies: ["Interview-Schnitt", "Story-Format", "Direct-to-Camera", "Mixed"] },
      { question: "Welche B-Roll Szenen zeigen den Kunden bei der Nutzung?", extractionKey: "bRollIdeas", quickReplies: ["Arbeitsplatz", "Team-Meeting", "Produkt-Nutzung", "Ergebnisse", "Ich beschreibe..."] },
      { question: "Was sind die stärksten Zitate/O-Töne?", extractionKey: "strongQuotes", quickReplies: ["Ich zitiere...", "Noch keine", "Aus Interview"] },
      { question: "Welche Social-Proof Elemente einblenden?", extractionKey: "socialProofElements", quickReplies: ["Logo", "Zahlen", "Auszeichnungen", "Andere Kunden", "Alle"] },
      { question: "Welcher visuelle Stil? (Documentary, Polished, Casual)", extractionKey: "visualStyle", quickReplies: ["Documentary", "Polished/Premium", "Casual/Authentisch", "Corporate"] },
      { question: "Untertitel ein- oder ausschalten?", extractionKey: "subtitlesEnabled", quickReplies: ["✅ Ja, Untertitel", "❌ Nein, ohne"] },
      { question: "Länge?", extractionKey: "duration", quickReplies: ["30s Snippet", "60s Standard", "90s Detailliert", "120s Deep-Dive"] },
      { question: "Soll das Video zum Director's Cut exportiert werden?", extractionKey: "exportToDirectorsCut", quickReplies: ["✅ Ja, zum DC", "❌ Nein, fertig"] },
    ]
  },
  'tutorial': {
    phases: [
      { question: "Was soll der Zuschauer am Ende KÖNNEN?", extractionKey: "learningGoal", quickReplies: ["Software bedienen", "Prozess verstehen", "Skill erlernen", "Problem lösen", "Ich beschreibe..."] },
      { question: "Welches Vorwissen wird vorausgesetzt?", extractionKey: "prerequisites", quickReplies: ["Anfänger", "Grundkenntnisse", "Fortgeschritten", "Experten", "Keine"] },
      { question: "Welches Problem löst dieses Tutorial?", extractionKey: "problemSolved", quickReplies: ["Häufige Frage", "Komplexer Prozess", "Neues Feature", "Best Practice", "Ich beschreibe..."] },
      { question: "In wie viele Schritte lässt sich der Prozess unterteilen?", extractionKey: "stepCount", quickReplies: ["3 Schritte", "5 Schritte", "7 Schritte", "10+ Schritte", "Ich beschreibe..."] },
      { question: "Beschreibe Schritt 1 im Detail.", extractionKey: "step1", quickReplies: ["Ich beschreibe..."] },
      { question: "Beschreibe Schritt 2.", extractionKey: "step2", quickReplies: ["Ich beschreibe..."] },
      { question: "Beschreibe Schritt 3.", extractionKey: "step3", quickReplies: ["Ich beschreibe..."] },
      { question: "Gibt es weitere wichtige Schritte?", extractionKey: "additionalSteps", quickReplies: ["Ja, ich ergänze", "Das waren alle", "Noch 1-2 mehr"] },
      { question: "Welche Fehler machen Anfänger typischerweise?", extractionKey: "commonMistakes", quickReplies: ["Schritte überspringen", "Falsche Reihenfolge", "Details vergessen", "Ich nenne sie..."] },
      { question: "Welche Pro-Tipps kannst du geben?", extractionKey: "proTips", quickReplies: ["Shortcuts", "Zeit sparen", "Qualität verbessern", "Ich beschreibe..."] },
      { question: "Welche Tools/Ressourcen werden benötigt?", extractionKey: "toolsNeeded", quickReplies: ["Software X", "Downloads", "Keine speziellen", "Ich liste..."] },
      { question: "Wie lange dauert der Prozess in der Realität?", extractionKey: "realTimeDuration", quickReplies: ["5 Minuten", "15 Minuten", "30 Minuten", "1+ Stunde", "Variiert"] },
      { question: "Schwierigkeitsgrad?", extractionKey: "difficulty", quickReplies: ["Leicht", "Mittel", "Schwer", "Variiert"] },
      { question: "Brauchen wir Screen-Recording oder nur Animation?", extractionKey: "recordingType", quickReplies: ["Screen-Recording", "Animation", "Mix", "Nur Grafiken"] },
      { question: "Welche Details müssen hervorgehoben werden? (Zoom-Ins)", extractionKey: "zoomDetails", quickReplies: ["UI-Elemente", "Buttons/Menüs", "Ergebnisse", "Ich beschreibe..."] },
      { question: "Soll eine Checkliste/Zusammenfassung am Ende erscheinen?", extractionKey: "includeChecklist", quickReplies: ["Ja, Checkliste", "Ja, Zusammenfassung", "Beides", "Nein"] },
      { question: "Gibt es weiterführende Tutorials?", extractionKey: "followUpContent", quickReplies: ["Ja, verlinken", "Geplant", "Standalone", "Serie"] },
      { question: "Welcher Voice-Over Stil?", extractionKey: "voiceStyle", quickReplies: ["Lehrerhaft", "Freundschaftlich", "Schnell & Effizient", "Ruhig & Klar"] },
      { question: "Welcher visuelle Stil?", extractionKey: "visualStyle", quickReplies: ["Whiteboard", "Screen-Cast", "Animated", "Mixed"] },
      { question: "Untertitel ein- oder ausschalten?", extractionKey: "subtitlesEnabled", quickReplies: ["✅ Ja, Untertitel", "❌ Nein, ohne"] },
      { question: "Länge?", extractionKey: "duration", quickReplies: ["60 Sekunden", "120 Sekunden", "180 Sekunden", "300 Sekunden"] },
      { question: "Soll das Video zum Director's Cut exportiert werden?", extractionKey: "exportToDirectorsCut", quickReplies: ["✅ Ja, zum DC", "❌ Nein, fertig"] },
    ]
  },
  'event-promo': {
    phases: [
      { question: "Welche Art von Event bewirbst du?", extractionKey: "eventType", quickReplies: ["Konferenz", "Webinar", "Workshop", "Launch Event", "Networking"] },
      { question: "Wie heißt das Event und wann findet es statt?", extractionKey: "eventDetails", quickReplies: ["Ich nenne Details..."] },
      { question: "Warum sollte jemand dieses Event besuchen statt andere?", extractionKey: "uniqueValue", quickReplies: ["Exklusive Speaker", "Networking", "Content", "Preis", "Ich beschreibe..."] },
      { question: "Wer sind die Highlights/Sprecher?", extractionKey: "speakers", quickReplies: ["Ich nenne sie...", "Prominente Namen", "Experten", "Noch nicht fix"] },
      { question: "Was sind die 3 spannendsten Programmpunkte?", extractionKey: "highlights", quickReplies: ["Ich beschreibe..."] },
      { question: "Was verpasst man, wenn man nicht dabei ist? (FOMO)", extractionKey: "fomoElement", quickReplies: ["Exklusives Wissen", "Networking", "Angebote", "Community", "Ich beschreibe..."] },
      { question: "Gibt es Frühbucher-Rabatte oder limitierte Tickets?", extractionKey: "pricingUrgency", quickReplies: ["Early Bird", "Limitiert", "VIP-Tickets", "Keine Urgency"] },
      { question: "Was macht den Ort besonders? (Online: Plattform-Features)", extractionKey: "locationHighlight", quickReplies: ["Premium Location", "Online-Features", "Hybrid", "Ich beschreibe..."] },
      { question: "Wer wird dort sein? (Networking-Value)", extractionKey: "attendeeProfile", quickReplies: ["Branchenführer", "Startups", "Investoren", "Mix", "Ich beschreibe..."] },
      { question: "Gibt es Material von vergangenen Events?", extractionKey: "pastEventMaterial", quickReplies: ["Ja, Fotos/Videos", "Testimonials", "Zahlen", "Erstes Event"] },
      { question: "Welcher visuelle Stil?", extractionKey: "visualStyle", quickReplies: ["Energetisch", "Premium/Elegant", "Corporate", "Kreativ"] },
      { question: "Welche Musik-Stimmung?", extractionKey: "musicMood", quickReplies: ["Upbeat", "Inspirierend", "Corporate", "Elektronisch"] },
      { question: "Welcher Voice-Over Stil?", extractionKey: "voiceStyle", quickReplies: ["Energetisch", "Professionell", "Einladend", "Kein VO"] },
      { question: "Welcher CTA?", extractionKey: "cta", quickReplies: ["Jetzt anmelden", "Ticket sichern", "Mehr erfahren", "Ich formuliere..."] },
      { question: "Untertitel ein- oder ausschalten?", extractionKey: "subtitlesEnabled", quickReplies: ["✅ Ja, Untertitel", "❌ Nein, ohne"] },
      { question: "Länge?", extractionKey: "duration", quickReplies: ["30 Sekunden", "45 Sekunden", "60 Sekunden", "90 Sekunden"] },
      { question: "Formate?", extractionKey: "formats", quickReplies: ["16:9", "9:16", "Alle", "16:9 + 9:16"] },
      { question: "Soll das Video zum Director's Cut exportiert werden?", extractionKey: "exportToDirectorsCut", quickReplies: ["✅ Ja, zum DC", "❌ Nein, fertig"] },
    ]
  },
  'brand-story': {
    phases: [
      { question: "Was ist der Kern eurer Gründungsgeschichte?", extractionKey: "foundingStory", quickReplies: ["Problem entdeckt", "Leidenschaft verfolgt", "Marktlücke erkannt", "Innovation entwickelt", "Ich beschreibe..."] },
      { question: "Was ist eure Mission in einem Satz?", extractionKey: "mission", quickReplies: ["Ich formuliere..."] },
      { question: "Wo seht ihr euch in 10 Jahren?", extractionKey: "vision", quickReplies: ["Marktführer", "Global", "Impact", "Innovation", "Ich beschreibe..."] },
      { question: "Welche 3-5 Kernwerte treiben euch an?", extractionKey: "values", quickReplies: ["Innovation", "Qualität", "Nachhaltigkeit", "Kundenfokus", "Ich nenne alle..."] },
      { question: "Was macht euch einzigartig in eurer Branche?", extractionKey: "differentiation", quickReplies: ["Technologie", "Team", "Ansatz", "Qualität", "Ich beschreibe..."] },
      { question: "Wer sind die Köpfe hinter der Marke?", extractionKey: "teamHighlight", quickReplies: ["Gründer zeigen", "Team zeigen", "Nur Produkt", "Ich beschreibe..."] },
      { question: "Welche wichtigen Meilensteine habt ihr erreicht?", extractionKey: "milestones", quickReplies: ["Gründung", "Erste Kunden", "Funding", "Awards", "Ich liste..."] },
      { question: "Welchen positiven Einfluss habt ihr auf Kunden/Welt?", extractionKey: "impact", quickReplies: ["Kunden-Erfolge", "Umwelt", "Community", "Branche", "Ich beschreibe..."] },
      { question: "Wie ist eure Unternehmenskultur?", extractionKey: "culture", quickReplies: ["Startup-Spirit", "Corporate", "Remote-First", "Familär", "Ich beschreibe..."] },
      { question: "Was plant ihr für die Zukunft?", extractionKey: "futurePlans", quickReplies: ["Expansion", "Neue Produkte", "Wachstum", "Innovation", "Ich beschreibe..."] },
      { question: "Welche authentischen Momente können wir zeigen?", extractionKey: "authenticMoments", quickReplies: ["Office/Team", "Produktion", "Kunden", "Events", "Ich beschreibe..."] },
      { question: "Welcher visuelle Stil?", extractionKey: "visualStyle", quickReplies: ["Modern/Clean", "Corporate", "Warm/Human", "Premium", "Kreativ"] },
      { question: "Welche Musik-Stimmung?", extractionKey: "musicMood", quickReplies: ["Inspirierend", "Corporate", "Emotional", "Modern", "Ich beschreibe..."] },
      { question: "Welcher Voice-Over Stil?", extractionKey: "voiceStyle", quickReplies: ["Founder spricht", "Professioneller VO", "Team-Stimmen", "Kein VO"] },
      { question: "Wie offensichtlich soll das Branding sein?", extractionKey: "brandingLevel", quickReplies: ["Durchgehend", "Subtil", "Nur am Ende", "Logo-fokussiert"] },
      { question: "Untertitel ein- oder ausschalten?", extractionKey: "subtitlesEnabled", quickReplies: ["✅ Ja, Untertitel", "❌ Nein, ohne"] },
      { question: "Länge?", extractionKey: "duration", quickReplies: ["60 Sekunden", "90 Sekunden", "120 Sekunden", "180 Sekunden"] },
      { question: "Formate?", extractionKey: "formats", quickReplies: ["16:9", "9:16", "Alle", "16:9 + 1:1"] },
      { question: "Wo soll das Video primär eingesetzt werden?", extractionKey: "primaryUse", quickReplies: ["Website", "Social Media", "Präsentationen", "Recruiting", "Überall"] },
      { question: "Soll das Video zum Director's Cut exportiert werden?", extractionKey: "exportToDirectorsCut", quickReplies: ["✅ Ja, zum DC", "❌ Nein, fertig"] },
    ]
  },
  'produktdemo': {
    phases: [
      { question: "Welchen Produkttyp möchtest du demonstrieren?", extractionKey: "productType", quickReplies: ["Software/SaaS", "Mobile App", "Physical Product", "Service", "Plattform"] },
      { question: "Was ist das EINE Hero-Feature, das alles verändert?", extractionKey: "heroFeature", quickReplies: ["Ich beschreibe..."] },
      { question: "Welche weiteren Features sind wichtig? (2-5)", extractionKey: "additionalFeatures", quickReplies: ["Ich liste..."] },
      { question: "Wie sieht ein typischer Use-Case von A-Z aus?", extractionKey: "typicalWorkflow", quickReplies: ["Ich beschreibe..."] },
      { question: "Was macht die Benutzeroberfläche besonders?", extractionKey: "uiHighlights", quickReplies: ["Einfachheit", "Design", "Speed", "Features", "Ich beschreibe..."] },
      { question: "Mit welchen anderen Tools arbeitet es zusammen?", extractionKey: "integrations", quickReplies: ["Ich liste...", "Alle gängigen", "Spezifische", "Standalone"] },
      { question: "Soll Pricing erwähnt werden?", extractionKey: "pricingMention", quickReplies: ["Ja, mit Preisen", "Nur 'erschwinglich'", "Gratis testen", "Nein"] },
      { question: "Was ist der Hauptnutzen für den User?", extractionKey: "mainBenefit", quickReplies: ["Zeit sparen", "Geld sparen", "Qualität steigern", "Einfacher machen", "Ich beschreibe..."] },
      { question: "Welches Problem löst dein Produkt?", extractionKey: "problemSolved", quickReplies: ["Ich beschreibe..."] },
      { question: "Wie unterscheidet sich dein Produkt von Alternativen?", extractionKey: "differentiation", quickReplies: ["Features", "Preis", "Einfachheit", "Support", "Ich beschreibe..."] },
      { question: "Welche Zielgruppe sprichst du an?", extractionKey: "targetAudience", quickReplies: ["B2B", "B2C", "Startups", "Enterprise", "Ich beschreibe..."] },
      { question: "Welche Social-Proof-Elemente hast du?", extractionKey: "socialProof", quickReplies: ["Kundenzahlen", "Logos", "Testimonials", "Awards", "Keine"] },
      { question: "Brauchen wir Screen-Recording?", extractionKey: "screenRecording", quickReplies: ["Ja, ausführlich", "Ja, kurze Clips", "Nein, Animation", "Mix"] },
      { question: "Welcher visuelle Stil?", extractionKey: "visualStyle", quickReplies: ["Clean/Minimal", "Tech/Modern", "Bunt/Playful", "Corporate"] },
      { question: "Welche Musik-Stimmung?", extractionKey: "musicMood", quickReplies: ["Tech/Modern", "Upbeat", "Corporate", "Ambient"] },
      { question: "Welcher Voice-Over Stil?", extractionKey: "voiceStyle", quickReplies: ["Professionell", "Freundlich", "Energetisch", "Kein VO"] },
      { question: "Welcher CTA?", extractionKey: "cta", quickReplies: ["Gratis testen", "Demo buchen", "Mehr erfahren", "Jetzt starten", "Ich formuliere..."] },
      { question: "Untertitel ein- oder ausschalten?", extractionKey: "subtitlesEnabled", quickReplies: ["✅ Ja, Untertitel", "❌ Nein, ohne"] },
      { question: "Länge?", extractionKey: "duration", quickReplies: ["60 Sekunden", "90 Sekunden", "120 Sekunden", "180 Sekunden"] },
      { question: "Formate?", extractionKey: "formats", quickReplies: ["16:9", "9:16", "Alle", "16:9 + 1:1"] },
      { question: "Soll das Video zum Director's Cut exportiert werden?", extractionKey: "exportToDirectorsCut", quickReplies: ["✅ Ja, zum DC", "❌ Nein, fertig"] },
    ]
  },
  'recruitment': {
    phases: [
      { question: "Welche Position(en) sollen beworben werden?", extractionKey: "positions", quickReplies: ["Entwickler/Tech", "Sales/Marketing", "Management", "Multiple Rollen", "Generell Arbeitgeber"] },
      { question: "Beschreibe den perfekten Kandidaten.", extractionKey: "idealCandidate", quickReplies: ["Ich beschreibe..."] },
      { question: "Was macht eure Unternehmenskultur besonders?", extractionKey: "cultureHighlights", quickReplies: ["Startup-Vibe", "Work-Life-Balance", "Innovation", "Teamspirit", "Ich beschreibe..."] },
      { question: "Welche Benefits bietet ihr?", extractionKey: "benefits", quickReplies: ["Remote Work", "Gehalt", "Entwicklung", "Team Events", "Ich liste..."] },
      { question: "Wie sieht ein typischer Arbeitstag aus?", extractionKey: "typicalDay", quickReplies: ["Ich beschreibe..."] },
      { question: "Welche Karrieremöglichkeiten gibt es?", extractionKey: "careerGrowth", quickReplies: ["Schneller Aufstieg", "Weiterbildung", "International", "Ich beschreibe..."] },
      { question: "Haben aktuelle Mitarbeiter Statements?", extractionKey: "employeeTestimonials", quickReplies: ["Ja, ich zitiere", "Video-Statements", "Noch keine", "Ich beschreibe..."] },
      { question: "Wie sieht euer Office/Workspace aus?", extractionKey: "workspaceHighlights", quickReplies: ["Modernes Office", "Remote-First", "Co-Working", "Hybrid", "Ich beschreibe..."] },
      { question: "Was ist das Besondere an euren Projekten?", extractionKey: "projectHighlights", quickReplies: ["Cutting-Edge", "Impact", "Vielfalt", "Kunden", "Ich beschreibe..."] },
      { question: "Welche Tech-Stack/Tools nutzt ihr?", extractionKey: "techStack", quickReplies: ["Ich liste...", "Modern/State-of-art", "Branchenstandard", "Nicht relevant"] },
      { question: "Wie ist der Bewerbungsprozess?", extractionKey: "applicationProcess", quickReplies: ["Schnell & einfach", "Mehrstufig", "Casual", "Ich beschreibe..."] },
      { question: "Welche Werte sind euch bei Kandidaten wichtig?", extractionKey: "candidateValues", quickReplies: ["Teamfähigkeit", "Initiative", "Kreativität", "Expertise", "Ich beschreibe..."] },
      { question: "Welcher visuelle Stil?", extractionKey: "visualStyle", quickReplies: ["Modern/Tech", "Human/Warm", "Corporate", "Kreativ/Bunt"] },
      { question: "Welche Musik-Stimmung?", extractionKey: "musicMood", quickReplies: ["Inspirierend", "Modern", "Corporate", "Energetisch"] },
      { question: "Welcher Voice-Over Stil?", extractionKey: "voiceStyle", quickReplies: ["Einladend", "Professionell", "Mitarbeiter sprechen", "Kein VO"] },
      { question: "Welcher CTA?", extractionKey: "cta", quickReplies: ["Jetzt bewerben", "Karriereseite", "Kontakt aufnehmen", "Mehr erfahren"] },
      { question: "Untertitel ein- oder ausschalten?", extractionKey: "subtitlesEnabled", quickReplies: ["✅ Ja, Untertitel", "❌ Nein, ohne"] },
      { question: "Länge?", extractionKey: "duration", quickReplies: ["45 Sekunden", "60 Sekunden", "90 Sekunden", "120 Sekunden"] },
      { question: "Soll das Video zum Director's Cut exportiert werden?", extractionKey: "exportToDirectorsCut", quickReplies: ["✅ Ja, zum DC", "❌ Nein, fertig"] },
    ]
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, category, currentPhase } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const interviewConfig = CATEGORY_INTERVIEWS[category];
    if (!interviewConfig) {
      throw new Error(`Unknown category: ${category}`);
    }

    const totalPhases = interviewConfig.phases.length;
    const currentPhaseConfig = interviewConfig.phases[currentPhase - 1];
    const nextPhaseConfig = interviewConfig.phases[currentPhase];
    
    const isLastPhase = currentPhase >= totalPhases;
    
    // Build conversation context
    const systemPrompt = `Du bist Max, ein professioneller Video-Marketing-Berater für die Kategorie "${category}".
    
Deine Aufgabe:
- Führe ein strukturiertes Interview mit ${totalPhases} Phasen
- Aktuelle Phase: ${currentPhase}/${totalPhases}
- Aktuelle Frage: "${currentPhaseConfig?.question || 'Abschluss'}"
- Extrahiere relevante Informationen aus den Antworten
- Sei freundlich, professionell und hilfreich
- Halte deine Antworten kurz und prägnant (max 3 Sätze vor der nächsten Frage)
- Bestätige die Antwort kurz und stelle dann die nächste Frage

${isLastPhase ? `
WICHTIG: Dies ist die letzte Phase. Fasse die wichtigsten Informationen zusammen und bereite den Abschluss vor.
Antworte mit: "Perfekt! Ich habe alle Informationen gesammelt."
` : `
Nächste Frage (Phase ${currentPhase + 1}): "${nextPhaseConfig?.question}"
Quick-Replies für nächste Frage: ${JSON.stringify(nextPhaseConfig?.quickReplies || [])}
`}

WICHTIG: 
- Antworte IMMER auf Deutsch
- Formatiere wichtige Begriffe mit **fett**
- Nenne die Phase-Nummer in deiner Antwort`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || "Entschuldigung, ich konnte keine Antwort generieren.";

    // Extract data from user's last message
    const lastUserMessage = messages[messages.length - 1]?.content || "";
    const extractedData: Record<string, any> = {};
    
    if (currentPhaseConfig?.extractionKey) {
      extractedData[currentPhaseConfig.extractionKey] = lastUserMessage;
      
      // Special handling for boolean fields
      if (currentPhaseConfig.extractionKey === 'subtitlesEnabled') {
        extractedData.subtitlesEnabled = lastUserMessage.toLowerCase().includes('ja') || lastUserMessage.includes('✅');
      }
      if (currentPhaseConfig.extractionKey === 'exportToDirectorsCut') {
        extractedData.exportToDirectorsCut = lastUserMessage.toLowerCase().includes('ja') || lastUserMessage.includes('✅');
      }
      if (currentPhaseConfig.extractionKey === 'duration') {
        const durationMatch = lastUserMessage.match(/(\d+)/);
        if (durationMatch) {
          extractedData.duration = parseInt(durationMatch[1]);
        }
      }
    }

    // Build consultation result if complete
    let consultationResult = null;
    if (isLastPhase) {
      consultationResult = {
        category,
        subtitlesEnabled: extractedData.subtitlesEnabled ?? true,
        exportToDirectorsCut: extractedData.exportToDirectorsCut ?? false,
        duration: extractedData.duration || 60,
        categorySpecificData: extractedData,
        interviewTranscript: messages
      };
    }

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        nextPhase: isLastPhase ? currentPhase : currentPhase + 1,
        quickReplies: nextPhaseConfig?.quickReplies || [],
        isComplete: isLastPhase,
        consultationResult,
        extractedData,
        progress: Math.round((currentPhase / totalPhases) * 100)
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Error in universal-video-consultant:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Entschuldigung, es gab ein Problem. Bitte versuche es erneut.",
        quickReplies: ["Nochmal versuchen"]
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
