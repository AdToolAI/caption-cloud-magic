import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════
// 3-BLOCK STRUCTURE: Universal (1-4) + Category-Specific (5-16) + Production (17-22)
// ═══════════════════════════════════════════════════════════════

const UNIVERSAL_PHASES_BLOCK1 = [
  'Was ist der ZWECK dieses Videos? (Verkaufen, Informieren, Emotionalisieren, Rekrutieren, Unterhalten)',
  'Wer ist deine ZIELGRUPPE? (Alter, Beruf, Branche, Interessen, Schmerzpunkte)',
  'Was ist dein PRODUKT oder UNTERNEHMEN? (Name, Branche, 2-3 Sätze Beschreibung)',
  'Was macht dich EINZIGARTIG? (Dein USP in einem Satz)',
];

const UNIVERSAL_PHASES_BLOCK3 = [
  'MARKENFARBEN: Hex-Codes oder Farbbeschreibung deiner Brand Identity',
  'VOICE-OVER: Sprache (DE/EN), Geschlecht (männlich/weiblich), Tonalität des Sprechers',
  'MUSIK: Welcher Stil passt zum Video? (Corporate, Upbeat, Emotional, Cinematic, Ambient)',
  'FORMAT & PLATTFORM: 16:9 (YouTube), 9:16 (TikTok/Reels), 1:1 (Instagram)?',
  'VIDEOLÄNGE: Wie lang soll das Video sein? (30s, 60s, 90s, 2min+)',
  'ZUSAMMENFASSUNG: Hier ist was ich gesammelt habe — passt alles so? Sollen wir starten?',
];

// Category-specific phases 5-16 (12 questions each)
const CATEGORY_SPECIFIC_PHASES: Record<string, string[]> = {
  'advertisement': [
    'Das EINE Hauptproblem das dein Produkt löst — beschreibe es emotional!',
    'Wie fühlt sich der Kunde VOR der Lösung? (Frustration, Zeitverlust, Unsicherheit...)',
    'Wie fühlt sich der Kunde NACH der Lösung? (Die Transformation beschreiben)',
    'Top 3 Features oder Vorteile deines Angebots',
    'Social Proof: Hast du konkrete Zahlen, Testimonials oder Awards? (z.B. "500+ Kunden")',
    'Konkurrenz: Was machen andere falsch, was du besser machst?',
    'Der HOOK: Was passiert in den ersten 3 Sekunden um den Scroll zu stoppen?',
    'Einwände: Welche Bedenken hat die Zielgruppe? Wie entkräftest du sie?',
    'Angebot: Gibt es ein Sonderangebot, Rabatt oder Bonus?',
    'Dringlichkeit: Zeitlimit, begrenzte Stückzahl, Early-Bird?',
    'Testimonial-Zitat: Ein Satz eines zufriedenen Kunden (echt oder beispielhaft)',
    'Exakter CTA-Text und URL: Was sollen Zuschauer am Ende tun?',
  ],
  'storytelling': [
    'Welches GENRE passt zu deiner Story? (Horror/Thriller, Romantik/Drama, Abenteuer, Dokumentarisch, Comedy)',
    'Wer ist der HELD der Geschichte? (Gründer, Kunde, Team, fiktive Figur)',
    'AUSGANGSSITUATION: Wie beginnt die Welt des Helden? Was ist der Alltag?',
    'DAS PROBLEM / DER KONFLIKT: Was stört die Ordnung? Was geht schief?',
    'DER TIEFPUNKT: Was ist der dunkelste/schwierigste Moment?',
    'DER WENDEPUNKT: Was ändert alles? Was ist der Aha-Moment?',
    'DIE TRANSFORMATION: Vorher vs. Nachher — wie verändert sich die Situation?',
    'Welche EMOTION soll dominieren? (Angst, Hoffnung, Freude, Nostalgie, Staunen)',
    'VISUELLE METAPHERN: Welche Bilder, Symbole oder Szenen erzählen die Story?',
    'TEMPO & RHYTHMUS: Langsamer Aufbau mit Klimax oder sofort Action?',
    'AUTHENTISCHE DETAILS: Was macht die Story glaubwürdig und echt?',
    'DAS FINALE: Wie endet die Geschichte? (Happy End, Open End, Cliffhanger, Twist)',
  ],
  'tutorial': [
    'Was genau soll ERKLÄRT oder GEZEIGT werden? (Konkretes Thema)',
    'SCHWIERIGKEITSGRAD: Anfänger, Fortgeschrittene oder Experten?',
    'VORWISSEN: Was müssen Zuschauer bereits können oder wissen?',
    'LERNZIEL: Was können Zuschauer NACH dem Video, was sie vorher nicht konnten?',
    'SCHRITTE: Wie ist das Tutorial strukturiert? Welche Kapitel/Abschnitte?',
    'HÄUFIGE FEHLER: Welche typischen Fehler sollten Zuschauer vermeiden?',
    'PRO-TIPPS: Welche Shortcuts oder Insider-Tipps gibt es für Fortgeschrittene?',
    'TOOLS & MATERIALIEN: Was wird benötigt um mitzumachen?',
    'DARSTELLUNG: Screen-Recording, Animation, Zeichnung oder Mix?',
    'TEXT-OVERLAYS: Beschriftungen, Bullet Points, Nummerierungen?',
    'INTERAKTIVE ELEMENTE: Pausen zum Mitmachen, Quiz, Übungen?',
    'OUTRO: Nächste Schritte, weiterführende Ressourcen, CTA?',
  ],
  'product-video': [
    'PRODUKTNAME und KATEGORIE: Was genau wird vorgestellt?',
    'Das EINE Hauptproblem das dieses Produkt löst',
    'Top 3 FEATURES: Was kann das Produkt? (konkret und messbar)',
    'PREISPOSITIONIERUNG: Premium, Mittelklasse oder Budget?',
    'ANWENDUNGSSZENARIEN: Wann und wie wird das Produkt genutzt? (Alltags-Situationen)',
    'VORHER-NACHHER: Welche Transformation erlebt der Nutzer?',
    'SOCIAL PROOF: Bewertungen, Sterne, Awards, bekannte Kunden?',
    'VERGLEICH: Was macht dein Produkt besser als Alternativen?',
    'PACKSHOT / DEMO: 360°-Ansicht, Details, Produkt in Aktion zeigen?',
    'LIFESTYLE-SZENEN: Produkt im echten Leben zeigen? Welche Situationen?',
    'HOOK: Wie wird in den ersten 3 Sekunden Interesse geweckt?',
    'CTA: Kaufen, Testen, Mehr erfahren? Exakter Text und URL',
  ],
  'corporate': [
    'HAUPTZWECK: Recruiting, Imagefilm, Investoren-Pitch oder Employer Branding?',
    'UNTERNEHMENSGESCHICHTE: Gründungsjahr, wie ist die Firma entstanden?',
    'MISSION & VISION: Warum existiert das Unternehmen? Wo wollt ihr hin?',
    'Top 3 UNTERNEHMENSWERTE die gelebt werden',
    'MEILENSTEINE & ERRUNGENSCHAFTEN: Was macht ihr besonders stolz?',
    'TEAM: Wer soll gezeigt werden? Führungskräfte, Team, einzelne Personen?',
    'UNTERNEHMENSKULTUR: Wie ist die Arbeitsatmosphäre? Was macht euch aus?',
    'STANDORTE: Welche Locations sollen gezeigt werden?',
    'KUNDENSTIMMEN: Sollen Kunden oder Partner zu Wort kommen?',
    'NACHHALTIGKEIT & SOZIALES: Gibt es CSR-Initiativen?',
    'STILRICHTUNG: Seriös, modern, nahbar, inspirierend?',
    'CTA: Bewerben, Kontaktieren, Kennenlernen, Folgen?',
  ],
  'social-content': [
    'ZIELPLATTFORM: TikTok, Instagram Reels, YouTube Shorts oder mehrere?',
    'CONTENT-ART: Trend, Educational, Entertainment, Behind-the-Scenes, Meme?',
    'SCROLL-STOPPER: Was passiert in Sekunde 1-3 um Aufmerksamkeit zu gewinnen?',
    'STORYTELLING trotz Kürze: Welcher Mini-Bogen? (Frage→Antwort, Problem→Lösung)',
    'TEXT-OVERLAYS: Welcher Stil? (Bold, handschriftlich, minimal, animiert)',
    'TRENDING: Gibt es einen aktuellen Trend oder Sound den wir nutzen sollen?',
    'HASHTAG-STRATEGIE: Welche Hashtags sind relevant?',
    'INTERAKTION: Was sollen Zuschauer tun? (Kommentieren, Teilen, Duetten)',
    'SERIE oder EINZEL? Ist das ein wiederkehrendes Format?',
    'SCHNITTGESCHWINDIGKEIT: Schnell (TikTok-Style), Medium oder langsam?',
    'UNTERTITEL: Animiert, statisch oder keine?',
    'CTA: Follow, Link in Bio, Kommentar, Teilen?',
  ],
  'testimonial': [
    'WER gibt das Testimonial? (Name, Position, Unternehmen)',
    'BEZIEHUNG: Kunde, Partner, Mitarbeiter? Wie lange schon?',
    'PROBLEM VOR der Nutzung: Was war die Ausgangslage?',
    'ENTSCHEIDUNGSMOMENT: Warum wurde genau dieses Produkt/Service gewählt?',
    'ERFAHRUNG: Wie war der Prozess der Nutzung?',
    'KONKRETE ERGEBNISSE: Zahlen, Zeitersparnis, ROI, messbarer Erfolg?',
    'EMOTIONALE TRANSFORMATION: Wie fühlt sich der Kunde jetzt?',
    'ÜBERRASCHENDE BENEFITS: Was war unerwartet positiv?',
    'KERNZITAT: Der eine Satz der alles zusammenfasst',
    'WEITEREMPFEHLUNG: Würde der Kunde weiterempfehlen? Warum?',
    'SETTING: Büro, Zuhause, neutral? Wie soll das Testimonial wirken?',
    'CTA: Was sollen Zuschauer nach dem Video tun?',
  ],
  'explainer': [
    'Was genau soll ERKLÄRT werden? (Produkt, Prozess, Konzept)',
    'KOMPLEXITÄT: Wie schwer ist das Thema für die Zielgruppe?',
    'Das EINE Hauptproblem das angesprochen wird',
    'Die LÖSUNG: Wie löst dein Produkt/Service das Problem? (Schritt für Schritt)',
    'Top 3 VORTEILE der Lösung (für den Kunden)',
    'METAPHERN & ANALOGIEN: Welche Vergleiche vereinfachen das Thema?',
    'ANIMATIONSSTIL: Flat Design, Isometric, Whiteboard, 3D, Cartoon?',
    'CHARAKTERE: Soll eine animierte Figur durch das Video führen?',
    'ICON-STIL: Welche visuelle Sprache passt? (Technisch, verspielt, Business)',
    'TEXT-ELEMENTE: Bullet Points, Keywords, Zahlen die eingeblendet werden?',
    'SOUND DESIGN: Whooshes, Pops, Transitions-Sounds?',
    'CTA: Was ist die gewünschte Handlung am Ende?',
  ],
  'event': [
    'ART des Events: Konferenz, Launch, Feier, Messe, Workshop?',
    'NAME und DATUM des Events',
    'ZWECK des Videos: Recap, Teaser für nächstes Jahr, Dokumentation, Promotion?',
    'HIGHLIGHTS: Was muss unbedingt gezeigt werden?',
    'SPEAKER / PERFORMERS: Wer soll vorgestellt werden?',
    'INTERVIEWS: Teilnehmer-Stimmen einbauen?',
    'BEHIND-THE-SCENES: Aufbau, Vorbereitung, Backstage zeigen?',
    'ATMOSPHÄRE: Welche Momente fangen die Stimmung ein?',
    'BRANDING: Event-Farben, Logo, Motto, Sponsoren?',
    'DROHNE / SPECIAL SHOTS: Besondere Perspektiven gewünscht?',
    'EMOTIONALER HÖHEPUNKT: Was war der beste Moment?',
    'CTA: Tickets fürs nächste Jahr, Follow, Newsletter, Kontakt?',
  ],
  'promo': [
    'Was wird BEWORBEN? Produkt-Launch, Sale, Event, Feature, Ankündigung?',
    'LAUNCH-DATUM oder DEADLINE: Gibt es einen Stichtag?',
    'TEASER-STIL: Mystery/Andeutung oder direkte Ankündigung?',
    'Das EINE Hauptversprechen in einem Satz',
    'SPANNUNG: Wie wird Neugier aufgebaut? (Countdown, Teaser, Reveal)',
    'EXKLUSIVITÄT: Limited Edition, Early Access, Sonderpreis?',
    'EMOTIONEN: Aufregung, Neugier, FOMO, Vorfreude?',
    'KEY VISUAL: Welches Bild/Moment soll im Gedächtnis bleiben?',
    'SCHNITT-STIL: Schnelle Cuts, Build-up, Cinematic?',
    'SOUND: Dramatisch, Electronic, Upbeat?',
    'DAS REVEAL: Wann und wie wird das Geheimnis gelüftet?',
    'CTA: Save the Date, Pre-Order, Link, Reminder setzen?',
  ],
  'presentation': [
    'THEMA und TITEL der Präsentation',
    'ZIELGRUPPE: Investoren, Kunden, Intern, Konferenz?',
    'HAUPTZIEL: Überzeugen, Informieren, Pitchen, Schulen?',
    'KERNTHESE in einem Satz: Was ist die Hauptaussage?',
    'Top 3 ARGUMENTE / KERNPUNKTE die überzeugen sollen',
    'DATEN & BELEGE: Statistiken, Charts, Zahlen die visualisiert werden?',
    'CASE STUDIES: Gibt es konkrete Beispiele oder Erfolgsgeschichten?',
    'STORYTELLING: Soll ein narrativer Bogen eingebaut werden?',
    'VISUALISIERUNG: Charts, Infografiken, Diagramme, Illustrationen?',
    'SPRECHER: Sichtbar (Picture-in-Picture) oder nur Voice-Over?',
    'SLIDE-DESIGN: Minimalistisch, datenreich, visuell, Corporate?',
    'CTA: Kontakt, Follow-up Meeting, Entscheidung, nächste Schritte?',
  ],
  'custom': [
    'Beschreibe deine VIDEO-IDEE in 2-3 Sätzen',
    'Welches ZIEL soll das Video erreichen?',
    'Gibt es REFERENZEN oder Inspirationen? (Links, Beschreibungen)',
    'VISUELLER STIL: Welche Ästhetik schwebt dir vor?',
    'REAL-FOOTAGE, Animation oder Mix?',
    'CHARAKTERE oder SPRECHER: Sollen Personen/Figuren vorkommen?',
    'STORYTELLING-STRUKTUR: Linear, Non-linear, Episodisch?',
    'EMOTIONALE WIRKUNG: Was sollen Zuschauer fühlen?',
    'BESONDERE EFFEKTE: Gibt es spezielle visuelle Anforderungen?',
    'TEXT & TYPOGRAFIE: Welche Texteinblendungen sind nötig?',
    'SOUND DESIGN: Besondere Audio-Anforderungen?',
    'CTA und gewünschte Handlung am Ende',
  ],
};

// Build full 22-phase array for a category
function buildCategoryPhases(category: string): string[] {
  const specific = CATEGORY_SPECIFIC_PHASES[category] || CATEGORY_SPECIFIC_PHASES['custom'];
  return [...UNIVERSAL_PHASES_BLOCK1, ...specific, ...UNIVERSAL_PHASES_BLOCK3];
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY-SPECIFIC QUICK REPLIES (Phase 1-22)
// ═══════════════════════════════════════════════════════════════

const UNIVERSAL_QUICK_REPLIES_BLOCK1: Record<number, string[]> = {
  1: ['Mehr Verkäufe erzielen', 'Informieren & erklären', 'Emotionalisieren & inspirieren', 'Lass mich erklären...'],
  2: ['B2B Entscheider 30-55', 'Endkonsumenten 25-45', 'Junge Zielgruppe 18-30', 'Lass mich beschreiben...'],
  3: ['Software / SaaS', 'Physisches Produkt', 'Dienstleistung / Agentur', 'Lass mich beschreiben...'],
  4: ['Einzigartige Technologie', 'Bester Service / Support', 'Bestes Preis-Leistungs-Verhältnis', 'Lass mich erklären...'],
};

const UNIVERSAL_QUICK_REPLIES_BLOCK3: Record<number, string[]> = {
  17: ['Blau & Weiß', 'Schwarz & Gold (#F5C76A)', 'Grün & Naturtöne', 'Ich schicke die Hex-Codes'],
  18: ['Männliche Stimme, professionell', 'Weibliche Stimme, freundlich', 'Keine Stimme, nur Musik', 'Deutsch UND Englisch'],
  19: ['Corporate & Business', 'Upbeat & energetisch', 'Emotional & cinematic', 'Minimal & subtil'],
  20: ['16:9 für YouTube/Website', '9:16 für TikTok/Reels', '1:1 für Instagram', 'Alle drei Formate'],
  21: ['30 Sekunden', '60 Sekunden', '90 Sekunden', '2 Minuten'],
  22: ['Ja, alles passt — Video erstellen!', 'Kleine Änderung...', 'Nochmal zusammenfassen', 'Einen Punkt anpassen'],
};

const CATEGORY_QUICK_REPLIES: Record<string, Record<number, string[]>> = {
  'advertisement': {
    5: ['Zeitverlust & Ineffizienz', 'Hohe Kosten', 'Schlechte Qualität', 'Lass mich erklären...'],
    6: ['Frustration & Stress', 'Unsicherheit & Zweifel', 'Überforderung', 'Lass mich beschreiben...'],
    7: ['Erleichterung & Zeitgewinn', 'Sicherheit & Vertrauen', 'Begeisterung & Stolz', 'Lass mich beschreiben...'],
    8: ['Einfache Bedienung', 'Zeitersparnis', 'Beste Qualität', 'Alle drei...'],
    9: ['500+ zufriedene Kunden', '4.9 Sterne Bewertung', 'Bekannter Award', 'Keine konkreten Zahlen'],
    10: ['Komplizierte Tools', 'Zu teuer', 'Schlechter Support', 'Lass mich erklären...'],
    11: ['Provokante Frage stellen', 'Schockierendes Statement', 'Problem visuell zeigen', 'Ich hab eine Idee...'],
    12: ['Zu teuer → ROI zeigen', 'Zu kompliziert → Demo', 'Kein Vertrauen → Social Proof', 'Andere Einwände...'],
    13: ['Ja, Rabatt/Sonderangebot', 'Kostenlose Testphase', 'Bonus-Material inklusive', 'Kein spezielles Angebot'],
    14: ['Nur noch X Plätze', 'Angebot endet am...', 'Early-Bird Preis', 'Keine Dringlichkeit'],
    15: ['Ja, ich hab ein Zitat', 'Bitte eines formulieren', 'Mehrere Kundenstimmen', 'Kein Testimonial nötig'],
    16: ['Jetzt kaufen + Shop-Link', 'Kostenlos testen + Demo', 'Mehr erfahren + Website', 'Termin buchen'],
  },
  'storytelling': {
    5: ['Horror / Thriller', 'Romantik / Drama', 'Abenteuer / Action', 'Dokumentarisch / Real'],
    6: ['Der Gründer selbst', 'Ein Kunde / Nutzer', 'Das Team als Ganzes', 'Eine fiktive Figur'],
    7: ['Normaler Alltag, alles gut', 'Bereits problematisch', 'Nostalgisch, frühere Zeiten', 'Lass mich beschreiben...'],
    8: ['Existenzielle Krise', 'Technisches Problem', 'Emotionaler Konflikt', 'Lass mich erzählen...'],
    9: ['Fast aufgegeben', 'Alles auf dem Spiel', 'Emotionaler Zusammenbruch', 'Kein Tiefpunkt nötig'],
    10: ['Eine Erkenntnis / Aha-Moment', 'Hilfe von außen', 'Mut & Entscheidung', 'Lass mich erzählen...'],
    11: ['Komplett neues Leben', 'Schrittweise Verbesserung', 'Emotionale Heilung', 'Lass mich beschreiben...'],
    12: ['Hoffnung & Inspiration', 'Angst & Spannung', 'Freude & Nostalgie', 'Staunen & Ehrfurcht'],
    13: ['Natur-Metaphern', 'Reise / Weg-Metapher', 'Licht & Dunkelheit', 'Lass mich beschreiben...'],
    14: ['Langsamer Aufbau → Klimax', 'Sofort Action, dann ruhig', 'Gleichmäßig emotional', 'Wechselnd (schnell/langsam)'],
    15: ['Echte Zahlen & Fakten', 'Persönliche Details', 'Originalzitate', 'Lass mich erzählen...'],
    16: ['Happy End mit CTA', 'Open End (zum Nachdenken)', 'Cliffhanger (Serie)', 'Überraschender Twist'],
  },
  'tutorial': {
    5: ['Ein Software-Feature erklären', 'Handwerkliche Anleitung', 'Konzept / Theorie', 'Lass mich beschreiben...'],
    6: ['Anfänger (keine Vorkenntnisse)', 'Fortgeschrittene', 'Experten', 'Gemischtes Publikum'],
    7: ['Grundlagen des Themas', 'Bestimmte Tools installiert', 'Branchenwissen', 'Keine Vorkenntnisse nötig'],
    8: ['Konkrete Fähigkeit beherrschen', 'Prozess selbst ausführen', 'Konzept verstehen', 'Lass mich erklären...'],
    9: ['3-5 klare Schritte', '5-10 Schritte mit Kapiteln', 'Freie Erklärung', 'Lass mich strukturieren...'],
    10: ['Die 3 häufigsten Anfänger-Fehler', 'Ein kritischer Fehler', 'Mehrere Stolperfallen', 'Keine typischen Fehler'],
    11: ['Zeitspar-Shortcuts', 'Versteckte Features', 'Best Practices', 'Keine Pro-Tipps nötig'],
    12: ['Software/App', 'Werkzeuge/Material', 'Nur Wissen', 'Lass mich auflisten...'],
    13: ['Screen-Recording', 'Animation & Grafiken', 'Whiteboard-Stil', 'Mix aus allem'],
    14: ['Nummerierte Schritte', 'Keywords hervorheben', 'Pfeile & Markierungen', 'Minimale Texteinblendungen'],
    15: ['Ja, Pausen zum Mitmachen', 'Nein, durchgehend', 'Quiz am Ende', 'Übungsaufgabe'],
    16: ['Nächstes Tutorial empfehlen', 'Ressourcen-Links', 'Community beitreten', 'Produkt testen'],
  },
  'product-video': {
    5: ['Physisches Produkt', 'Software / App', 'Hardware / Gerät', 'Lass mich beschreiben...'],
    6: ['Zeitersparnis', 'Kostenreduktion', 'Qualitätsverbesserung', 'Lass mich erklären...'],
    7: ['3 starke Features', 'Ein Killer-Feature', 'Technische Specs', 'Lass mich auflisten...'],
    8: ['Premium-Segment', 'Mittelklasse', 'Budget-freundlich', 'Bestes Preis-Leistungs-Verhältnis'],
    9: ['Im Büro / bei der Arbeit', 'Zuhause / privat', 'Unterwegs / mobil', 'Mehrere Szenarien...'],
    10: ['Dramatische Verbesserung', 'Schrittweise Optimierung', 'Komplett neuer Workflow', 'Lass mich beschreiben...'],
    11: ['4.9 Sterne, 500+ Reviews', 'Bekannte Marken als Kunden', 'Award-Gewinner', 'Keine Bewertungen noch'],
    12: ['Deutlich besser als X', 'Einzigartiges Feature', 'Besserer Preis', 'Lass mich vergleichen...'],
    13: ['360° Produktansicht', 'Close-up Details', 'Produkt in Aktion', 'Unboxing-Stil'],
    14: ['Im echten Alltag zeigen', 'Stylische Umgebung', 'Minimalistisch, nur Produkt', 'Lass mich beschreiben...'],
    15: ['Provokante Frage', 'Problem visuell zeigen', 'Wow-Effekt des Produkts', 'Ich hab eine Idee...'],
    16: ['Jetzt kaufen', 'Kostenlos testen', 'Mehr erfahren', 'Demo anfordern'],
  },
  'corporate': {
    5: ['Recruiting / Employer Branding', 'Imagefilm', 'Investoren-Pitch', 'Allgemeine Vorstellung'],
    6: ['Lange Tradition (10+ Jahre)', 'Startup / jung & dynamisch', 'Familienbetrieb', 'Lass mich erzählen...'],
    7: ['Welt verbessern', 'Branche revolutionieren', 'Kunden glücklich machen', 'Lass mich erklären...'],
    8: ['Innovation & Fortschritt', 'Qualität & Zuverlässigkeit', 'Teamgeist & Zusammenhalt', 'Lass mich auflisten...'],
    9: ['Marktführerschaft', 'Schnelles Wachstum', 'Innovative Produkte', 'Lass mich erzählen...'],
    10: ['Geschäftsführung', 'Verschiedene Team-Mitglieder', 'Niemand konkret', 'Das ganze Team'],
    11: ['Familiäre Atmosphäre', 'High-Performance Culture', 'Kreativ & locker', 'Lass mich beschreiben...'],
    12: ['Hauptstandort zeigen', 'Mehrere Standorte', 'Remote / Digital', 'Lass mich beschreiben...'],
    13: ['Ja, Kundenstimmen einbauen', 'Partner-Statements', 'Nein, intern fokussiert', 'Vielleicht dezent'],
    14: ['Ja, Nachhaltigkeit ist wichtig', 'Soziale Projekte', 'Nicht relevant', 'Lass mich erklären...'],
    15: ['Seriös & vertrauenswürdig', 'Modern & innovativ', 'Nahbar & authentisch', 'Inspirierend & visionär'],
    16: ['Jetzt bewerben', 'Kontakt aufnehmen', 'Website besuchen', 'Folgen auf Social Media'],
  },
  'social-content': {
    5: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Mehrere Plattformen'],
    6: ['Trend / Viral', 'Educational / Tipps', 'Entertainment / Spaß', 'Behind-the-Scenes'],
    7: ['Provokante Frage', 'Unerwarteter Fakt', 'Visueller Wow-Effekt', 'Ich hab eine Idee...'],
    8: ['Problem → Lösung', 'Frage → Antwort', 'Erwartung → Realität', 'Vorher → Nachher'],
    9: ['Bold & groß', 'Handschriftlich', 'Minimal / keine Texte', 'Animiert & dynamisch'],
    10: ['Ja, aktuellen Trend nutzen', 'Eigene Musik/Sound', 'Trending Audio', 'Kein bestimmter Trend'],
    11: ['3-5 relevante Hashtags', 'Ich kenne meine Hashtags', 'Bitte vorschlagen', 'Keine Hashtags'],
    12: ['Kommentieren (Frage stellen)', 'Teilen (Freunde taggen)', 'Folgen für mehr', 'Link klicken'],
    13: ['Ja, wiederkehrendes Format', 'Nein, Einzelvideo', 'Vielleicht als Serie', 'Noch unsicher'],
    14: ['Sehr schnell (1s Cuts)', 'Medium (2-3s Cuts)', 'Eher ruhig', 'Wechselnd'],
    15: ['Animierte Untertitel', 'Statische Untertitel', 'Keine Untertitel', 'Was empfiehlst du?'],
    16: ['Follow für mehr', 'Link in Bio', 'Kommentar hinterlassen', 'Video teilen'],
  },
  'testimonial': {
    5: ['Kunde / Nutzer', 'Business-Partner', 'Mitarbeiter', 'Lass mich beschreiben...'],
    6: ['Langjähriger Kunde (2+ Jahre)', 'Neuer Kunde mit Wow-Erlebnis', 'Partner/Mitarbeiter', 'Lass mich beschreiben...'],
    7: ['Frustriert mit alten Lösungen', 'Auf der Suche nach Besserem', 'Skeptisch gegenüber Neuem', 'Lass mich erzählen...'],
    8: ['Empfehlung von Freunden', 'Online-Recherche', 'Konkurrenz war schlecht', 'Lass mich erklären...'],
    9: ['Reibungslos & einfach', 'Überraschend gut', 'Mit Lernkurve aber positiv', 'Lass mich beschreiben...'],
    10: ['50%+ Zeitersparnis', 'Deutliche Kostensenkung', 'Qualitativ bessere Ergebnisse', 'Lass mich Zahlen nennen...'],
    11: ['Erleichtert & glücklich', 'Begeistert & stolz', 'Sicher & entspannt', 'Lass mich beschreiben...'],
    12: ['Unerwartete Zeitersparnis', 'Toller Support', 'Community-Feeling', 'Lass mich erzählen...'],
    13: ['Ja, ich hab ein echtes Zitat', 'Bitte eines formulieren', 'Mehrere Zitate verfügbar', 'Lass mich überlegen...'],
    14: ['Absolut, an jeden!', 'An bestimmte Zielgruppe', 'Ja, mit Einschränkungen', 'Lass mich erklären...'],
    15: ['Professionell im Büro', 'Casual / Authentisch', 'Neutral / Studio', 'Lass mich beschreiben...'],
    16: ['Produkt selbst testen', 'Termin buchen', 'Website besuchen', 'Demo anfordern'],
  },
  'explainer': {
    5: ['Ein Produkt / eine App', 'Einen Prozess / Workflow', 'Ein Konzept / eine Idee', 'Lass mich beschreiben...'],
    6: ['Sehr komplex, braucht Vereinfachung', 'Mittelschwer', 'Eigentlich einfach, muss nur gezeigt werden', 'Lass mich einschätzen...'],
    7: ['Zeitverlust / Ineffizienz', 'Fehlendes Verständnis', 'Komplizierter Prozess', 'Lass mich erklären...'],
    8: ['3 einfache Schritte', '5+ Schritte mit Details', 'Ein fließender Prozess', 'Lass mich beschreiben...'],
    9: ['Zeitersparnis', 'Kostenreduktion', 'Einfachheit', 'Alle drei...'],
    10: ['Alltags-Analogie', 'Technische Metapher', 'Visuelle Vereinfachung', 'Lass mich überlegen...'],
    11: ['Flat Design / Modern', 'Isometric / 3D', 'Whiteboard-Stil', 'Cartoon / Verspielt'],
    12: ['Ja, Charakter als Guide', 'Nein, nur Grafiken', 'Vielleicht dezent', 'Was passt besser?'],
    13: ['Technisch & präzise', 'Verspielt & freundlich', 'Business & clean', 'Lass mich beschreiben...'],
    14: ['Bullet Points & Keywords', 'Prozess-Nummern', 'Minimale Texte', 'Datenvisualisierung'],
    15: ['Ja, dezente Sounds', 'Knackige Transitions', 'Nein, nur Musik', 'Was empfiehlst du?'],
    16: ['Produkt testen', 'Mehr erfahren', 'Demo buchen', 'Jetzt starten'],
  },
  'event': {
    5: ['Konferenz / Summit', 'Produkt-Launch', 'Firmenfeier / Gala', 'Messe / Expo'],
    6: ['Geplantes zukünftiges Event', 'Bereits stattgefunden', 'Regelmäßiges Event', 'Lass mich beschreiben...'],
    7: ['Recap / Zusammenfassung', 'Teaser für nächstes Jahr', 'Dokumentation / Archiv', 'Promotion / Werbung'],
    8: ['Keynote / Hauptredner', 'Networking-Momente', 'Produkt-Enthüllung', 'Mehrere Highlights...'],
    9: ['Ja, Speaker vorstellen', 'Nein, Fokus auf Atmosphäre', 'Mix aus beidem', 'Lass mich beschreiben...'],
    10: ['Ja, Teilnehmer-Stimmen', 'Nein, nur Bilder & Musik', 'Mix aus O-Tönen & Musik', 'Was passt besser?'],
    11: ['Ja, Behind-the-Scenes zeigen', 'Nein, nur fertiges Event', 'Kurzer Blick hinter Kulissen', 'Lass mich beschreiben...'],
    12: ['Begeisterung & Energie', 'Professionalität & Netzwerk', 'Party & Spaß', 'Inspiration & Lernen'],
    13: ['Event-Farben & Branding', 'Sponsoren einbinden', 'Eigene Brand-Farben', 'Lass mich beschreiben...'],
    14: ['Ja, Drohnenflug', 'Zeitraffer vom Aufbau', 'Slow-Motion Highlights', 'Standard-Perspektiven reichen'],
    15: ['Standing Ovation / Applaus', 'Networking-Moment', 'Überraschungs-Reveal', 'Lass mich beschreiben...'],
    16: ['Tickets fürs nächste Jahr', 'Newsletter abonnieren', 'Galerie / Fotos ansehen', 'Social Media folgen'],
  },
  'promo': {
    5: ['Produkt-Launch', 'Sale / Rabattaktion', 'Event-Ankündigung', 'Feature-Release'],
    6: ['In den nächsten Tagen', 'In 2-4 Wochen', 'Kein festes Datum', 'Lass mich beschreiben...'],
    7: ['Mystery / Andeutung', 'Direkte Ankündigung', 'Countdown-Reveal', 'Mix aus beidem'],
    8: ['Revolutionär neu', 'Bester Deal ever', 'Exklusiver Zugang', 'Lass mich formulieren...'],
    9: ['Countdown-Timer', 'Schritt-für-Schritt Reveal', 'Teaser → Full Reveal', 'Lass mich beschreiben...'],
    10: ['Limited Edition', 'Early Access', 'Sonderpreis für Erste', 'Keine Exklusivität'],
    11: ['FOMO erzeugen', 'Vorfreude aufbauen', 'Neugier wecken', 'Begeisterung entfachen'],
    12: ['Produkt-Shot', 'Emotionaler Moment', 'Überraschungs-Reveal', 'Lass mich beschreiben...'],
    13: ['Schnelle Cuts, dynamisch', 'Langsamer Build-up', 'Cinematic & episch', 'Was passt besser?'],
    14: ['Dramatisch & episch', 'Electronic & modern', 'Upbeat & energetisch', 'Lass mich beschreiben...'],
    15: ['Big Reveal am Ende', 'Schrittweise enthüllen', 'Am Anfang zeigen, Details folgen', 'Lass mich beschreiben...'],
    16: ['Pre-Order starten', 'Save the Date', 'Link / Website besuchen', 'Reminder setzen'],
  },
  'presentation': {
    5: ['Firmen-Internes Meeting', 'Konferenz-Vortrag', 'Pitch Deck / Investoren', 'Lass mich beschreiben...'],
    6: ['Investoren überzeugen', 'Team schulen', 'Kunden informieren', 'Idee pitchen'],
    7: ['Überzeugen & verkaufen', 'Informieren & schulen', 'Inspirieren & motivieren', 'Lass mich erklären...'],
    8: ['Einen klaren Hauptpunkt', 'Lass mich formulieren...', 'Noch nicht sicher', 'Mehrere Kernaussagen'],
    9: ['3 starke Argumente', 'Datengetriebene Beweise', 'Emotionale Argumente', 'Lass mich auflisten...'],
    10: ['Ja, Statistiken & Charts', 'Wenige, aber wichtige Zahlen', 'Keine Daten', 'Lass mich beschreiben...'],
    11: ['Ja, eine Erfolgsgeschichte', 'Mehrere Mini-Cases', 'Nein, theoretisch bleiben', 'Lass mich erzählen...'],
    12: ['Ja, narrativer Bogen', 'Nein, faktenbasiert', 'Leichtes Storytelling', 'Was empfiehlst du?'],
    13: ['Charts & Diagramme', 'Infografiken', 'Illustrationen', 'Mix aus allem'],
    14: ['Sprecher sichtbar (PiP)', 'Nur Voice-Over', 'Kein Sprecher, nur Slides', 'Was passt besser?'],
    15: ['Minimalistisch & clean', 'Datenreich & detailliert', 'Visuell & bildstark', 'Corporate & professionell'],
    16: ['Meeting vereinbaren', 'Entscheidung treffen', 'Mehr erfahren', 'Kontakt aufnehmen'],
  },
  'custom': {
    5: ['Lass mich beschreiben...', 'Ähnlich wie ein Werbevideo', 'Eher dokumentarisch', 'Komplett frei & kreativ'],
    6: ['Verkaufen / Konvertieren', 'Informieren / Erklären', 'Unterhalten / Begeistern', 'Lass mich erklären...'],
    7: ['Ja, ich habe Referenzen', 'Nein, komplett neu', 'Ähnlich wie Apple/Nike-Style', 'Lass mich beschreiben...'],
    8: ['Modern & minimalistisch', 'Cinematic & episch', 'Verspielt & bunt', 'Lass mich beschreiben...'],
    9: ['Komplett animiert', 'Real-Footage', 'Mix aus beidem', 'Was empfiehlst du?'],
    10: ['Ja, Charakter/Sprecher', 'Nein, nur Visuals', 'Vielleicht Voice-Over', 'Lass mich beschreiben...'],
    11: ['Linear / chronologisch', 'Problem → Lösung', 'Episodisch / Kapitel', 'Frei & experimentell'],
    12: ['Begeisterung & Wow', 'Vertrauen & Sicherheit', 'Neugier & Interesse', 'Lass mich beschreiben...'],
    13: ['Ja, spezielle Effekte', 'Nein, clean & einfach', 'Dezente Effekte', 'Lass mich beschreiben...'],
    14: ['Headlines & Keywords', 'Bullet Points', 'Minimale Texte', 'Lass mich beschreiben...'],
    15: ['Ja, besondere Sounds', 'Standard Sound Design', 'Nur Musik', 'Lass mich beschreiben...'],
    16: ['Website besuchen', 'Kontakt aufnehmen', 'Produkt testen', 'Lass mich beschreiben...'],
  },
};

// Get category config with fallback
const getCategoryConfig = (category: string) => {
  const phases = buildCategoryPhases(category);
  const names: Record<string, string> = {
    'advertisement': 'Werbevideo', 'storytelling': 'Brand Story', 'tutorial': 'Tutorial/How-To',
    'product-video': 'Produktvideo', 'corporate': 'Unternehmensfilm', 'social-content': 'Social Media Content',
    'testimonial': 'Testimonial Video', 'explainer': 'Erklärvideo', 'event': 'Event Video',
    'promo': 'Promo/Teaser', 'presentation': 'Präsentation Video', 'custom': 'Custom Video',
  };
  return { name: names[category] || 'Custom Video', phases };
};

// Generate comprehensive system prompt for 22 phases
const getCategorySystemPrompt = (category: string, mode: string, currentPhase: number): string => {
  const cat = getCategoryConfig(category);
  const totalPhases = 22;

  // Determine which block we're in
  let blockInfo = '';
  if (currentPhase <= 4) {
    blockInfo = 'BLOCK 1: ZWECK & KONTEXT — Verstehe warum dieses Video gemacht wird und für wen.';
  } else if (currentPhase <= 16) {
    blockInfo = `BLOCK 2: KATEGORIE-SPEZIFISCH (${cat.name}) — Sammle alle kreativen und inhaltlichen Details.`;
  } else {
    blockInfo = 'BLOCK 3: PRODUKTION — Kläre technische Details und Branding.';
  }

  let phaseInstructions = '';
  if (currentPhase < 22) {
    phaseInstructions = `
Du bist aktuell in PHASE ${currentPhase}/22.
${blockInfo}
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

INTERVIEW-STRUKTUR (3 Blöcke):

BLOCK 1 — ZWECK & KONTEXT (Phase 1-4):
${cat.phases.slice(0, 4).map((p, i) => `  ${i + 1}. ${p}`).join('\n')}

BLOCK 2 — KATEGORIE-SPEZIFISCH FÜR ${cat.name.toUpperCase()} (Phase 5-16):
${cat.phases.slice(4, 16).map((p, i) => `  ${i + 5}. ${p}`).join('\n')}

BLOCK 3 — PRODUKTION (Phase 17-22):
${cat.phases.slice(16).map((p, i) => `  ${i + 17}. ${p}`).join('\n')}

═══════════════════════════════════════════════════════════════

${phaseInstructions}

DEIN VERHALTEN:
- Sei freundlich, professionell und ein echter Experte
- Fasse kurz zusammen was du verstanden hast
- Gib konkrete Beispiele und Vorschläge passend zur Kategorie ${cat.name}
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

// Generate phase-specific quick replies (category-aware)
function generateQuickReplies(phase: number, category: string): string[] {
  // Block 1 (universal)
  if (phase >= 1 && phase <= 4) {
    return UNIVERSAL_QUICK_REPLIES_BLOCK1[phase] || ['Ja, genau so', 'Lass mich erklären...', 'Weiter', 'Ich brauche Hilfe'];
  }
  
  // Block 2 (category-specific)
  if (phase >= 5 && phase <= 16) {
    const catReplies = CATEGORY_QUICK_REPLIES[category];
    if (catReplies && catReplies[phase]) {
      return catReplies[phase];
    }
    // Fallback to custom category
    const customReplies = CATEGORY_QUICK_REPLIES['custom'];
    return customReplies?.[phase] || ['Ja, genau so', 'Lass mich erklären...', 'Weiter', 'Ich brauche Hilfe'];
  }
  
  // Block 3 (universal production)
  if (phase >= 17 && phase <= 22) {
    return UNIVERSAL_QUICK_REPLIES_BLOCK3[phase] || ['Ja, genau so', 'Lass mich erklären...', 'Weiter', 'Ich brauche Hilfe'];
  }
  
  return ['Ja, genau so', 'Lass mich erklären...', 'Weiter zur nächsten Frage', 'Ich brauche Hilfe dabei'];
}

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
  
  // Fallback to phase-based (category-aware)
  return generateQuickReplies(phase, category);
}

// ═══════════════════════════════════════════════════════════════
// ROBUST SEMANTIC EXTRACTION (replaces fragile index-based)
// ═══════════════════════════════════════════════════════════════

const extractRecommendation = (messages: any[], category: string) => {
  const userResponses = messages.filter(m => m.role === 'user').map(m => m.content);
  const aiMessages = messages.filter(m => m.role === 'assistant').map(m => m.content);
  const allText = [...userResponses, ...aiMessages].join(' ').toLowerCase();
  
  // Semantic field extraction helpers
  const findResponse = (keywords: string[], fromResponses: string[] = userResponses): string => {
    // Search AI messages for phase context, then match user response
    for (let i = 0; i < aiMessages.length && i < userResponses.length; i++) {
      const aiMsg = (aiMessages[i] || '').toLowerCase();
      if (keywords.some(k => aiMsg.includes(k))) {
        return userResponses[i] || '';
      }
    }
    return '';
  };
  
  // Extract format/aspect ratio
  const formatResponse = findResponse(['format', '16:9', '9:16', '1:1', 'plattform']);
  const aspectRatio = formatResponse.includes('9:16') ? '9:16' 
    : formatResponse.includes('1:1') ? '1:1'
    : formatResponse.includes('4:5') ? '4:5'
    : '16:9';
  
  // Extract duration
  const durationResponse = findResponse(['länge', 'sekunden', 'dauer', 'lang soll', 'videolänge']);
  const durationMatch = durationResponse.match(/(\d+)\s*(sekunde|minute|min|sec|s\b)/i);
  let duration = 60;
  if (durationMatch) {
    const num = parseInt(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    duration = (unit.startsWith('min') || unit === 'minute') ? num * 60 : num;
  } else if (durationResponse.includes('30')) duration = 30;
  else if (durationResponse.includes('90')) duration = 90;
  else if (durationResponse.includes('120') || durationResponse.includes('2 min')) duration = 120;

  // Extract key semantic fields
  const zweck = userResponses[0] || '';  // Phase 1 is always purpose
  const zielgruppe = userResponses[1] || '';  // Phase 2 is always target audience
  const produkt = userResponses[2] || '';  // Phase 3 is always product/company
  const usp = userResponses[3] || '';  // Phase 4 is always USP
  
  // Category-specific fields from phase 5-16 responses
  const categoryResponses = userResponses.slice(4, 16);
  
  // Extract visual style
  const styleResponse = findResponse(['stil', 'visuell', 'design', 'aussehen', 'ästhetik']);
  const visualStyle = styleResponse || 'modern';
  
  // Extract tone
  const toneResponse = findResponse(['tonalität', 'ton ', 'stimmung', 'voice-over']);
  const tone = toneResponse || 'professional';
  
  // Extract colors
  const colorResponse = findResponse(['farbe', 'color', 'hex', 'markenfarben', 'brand']);
  
  // Extract hook
  const hookResponse = findResponse(['hook', 'einstieg', 'anfang', 'ersten sekunden', 'scroll']);
  
  // Extract CTA
  const ctaResponse = findResponse(['cta', 'call to action', 'handlung', 'am ende tun', 'finale']);
  
  // Extract emotion
  const emotionResponse = findResponse(['emotion', 'gefühl', 'fühlen', 'stimmung']);
  
  return {
    // Core info (Block 1)
    purpose: zweck.substring(0, 200),
    productSummary: `${produkt} ${usp}`.substring(0, 500),
    targetAudience: zielgruppe ? [zielgruppe.substring(0, 200)] : ['Allgemein'],
    usp: usp.substring(0, 200),
    
    // Category-specific content (Block 2) 
    categoryInsights: categoryResponses.filter(Boolean).join(' | ').substring(0, 1000),
    painPoints: findResponse(['problem', 'pain', 'herausforderung', 'frustration', 'löst']).substring(0, 200),
    emotionalHook: emotionResponse.substring(0, 100) || 'Interesse wecken',
    
    // Production details (Block 3)
    visualStyle: visualStyle.substring(0, 100),
    tone: tone.substring(0, 100),
    brandColors: colorResponse.substring(0, 100),
    duration,
    videoDuration: duration,
    format: aspectRatio,
    aspectRatio,
    outputFormats: [aspectRatio],
    hookIdea: hookResponse.substring(0, 200),
    ctaText: ctaResponse.substring(0, 100) || 'Mehr erfahren',
    category
  };
};

// Compress context for later phases to avoid timeout
function compressContext(messages: any[], currentPhase: number): any[] {
  if (currentPhase <= 12 || messages.length <= 15) {
    return messages;
  }
  
  const firstMessages = messages.slice(0, 3);
  const lastMessages = messages.slice(-8);
  
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

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: aiMessages,
        stream: true,
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
      const jsonBlockMatch = aiContent.match(/\{[\s\S]*"message"[\s\S]*\}/);
      if (jsonBlockMatch) {
        try {
          const parsed = JSON.parse(jsonBlockMatch[0]);
          cleanedMessage = parsed.message;
        } catch {}
      }
      
      if (!cleanedMessage) {
        const messageMatch = aiContent.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (messageMatch) {
          cleanedMessage = messageMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
        }
      }
      
      if (!cleanedMessage) {
        cleanedMessage = aiContent
          .replace(/```json[\s\S]*?```/g, '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/\{[\s\S]*?\}/g, '')
          .trim();
      }
    }
    
    // KRITISCH: Phase-basierte Quick Replies als PRIMÄR verwenden (category-aware)
    const phaseBasedReplies = generateQuickReplies(Math.max(1, currentPhase - 1), category);
    
    // Nur AI-Replies verwenden wenn sie wirklich spezifisch und sinnvoll sind
    const aiReplies = parsedResponse?.quickReplies;
    const useAiReplies = aiReplies && 
                         Array.isArray(aiReplies) && 
                         aiReplies.length >= 4 &&
                         !aiReplies.some((r: string) => r.toLowerCase().includes('weiter') || r.toLowerCase() === 'ja');
    
    const smartQuickReplies = useAiReplies ? aiReplies : phaseBasedReplies;

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
