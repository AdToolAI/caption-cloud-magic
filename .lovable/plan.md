

# Plan: Optimierte Beratungsfragen für präzisere Video-Ergebnisse

## Analyse des aktuellen Problems

Die jetzigen 22 Phasen sind für alle Kategorien nach dem gleichen Schema aufgebaut: ~10 Fragen zum Inhalt, ~6 zum visuellen Stil, ~6 zu technischen Details (Format, Länge, Audio). Das führt zu:

1. **Generische Fragen**: "Top 3 Features" passt für Werbung, aber nicht für Storytelling oder Event-Videos
2. **Fehlende Zweck-Frage**: Der Kunde wird nie gefragt "Was ist der ZWECK dieses Videos?" — das ist die wichtigste Frage überhaupt
3. **Redundanz**: Viele technische Fragen (Format, Länge, Musik) sind für den Mood-Preset-Step besser geeignet und müssen nicht nochmal gefragt werden
4. **Keine Kreativ-Steuerung**: Bei Storytelling fehlt "Welches Genre?" (Grusel, Romantik, Abenteuer), bei Tutorials fehlt "Welcher Schwierigkeitsgrad?"
5. **`extractRecommendation` ist fragil**: Es greift per Index auf `userResponses[7]`, `userResponses[12]` etc. zu — wenn die Fragen-Reihenfolge sich ändert, bricht alles

## Neues Konzept: 3-Block-Struktur

Statt 22 gleich gewichteter Fragen → 3 klar getrennte Blöcke:

```text
Block 1: ZWECK & KONTEXT (Phase 1-4)
  → Gilt für ALLE Kategorien gleich
  → Warum dieses Video? Wer soll es sehen? Was soll passieren?

Block 2: KATEGORIE-SPEZIFISCH (Phase 5-16)  
  → 12 Fragen die sich pro Kategorie KOMPLETT unterscheiden
  → Storytelling: Genre, Held, Wendepunkt, Emotionsbogen
  → Advertisement: USP, Pain Points, Social Proof, Hook
  → Tutorial: Schwierigkeitsgrad, Schritte, Pro-Tipps

Block 3: PRODUKTION (Phase 17-22)
  → Gilt für ALLE Kategorien gleich
  → Aber: berücksichtigt Mood-Preset (überspringt was schon gewählt wurde)
  → Markenfarben, Audio-Präferenzen, finaler CTA
```

## Konkrete Änderungen pro Kategorie

### Universelle Phasen 1-4 (alle Kategorien)

| Phase | Frage | Warum wichtig |
|---|---|---|
| 1 | **Was ist der ZWECK dieses Videos?** (Verkaufen, Informieren, Emotionalisieren, Rekrutieren) | Steuert gesamte Tonalität |
| 2 | **Wer ist deine Zielgruppe?** (Alter, Beruf, Interessen, Schmerzpunkte) | Steuert Sprache & Visuals |
| 3 | **Was ist dein Produkt/Unternehmen?** (2-3 Sätze, Name, Branche) | Basis für alle Inhalte |
| 4 | **Was macht dich EINZIGARTIG?** (USP in einem Satz) | Kernbotschaft des Videos |

### Kategorie-spezifisch: Storytelling (Phase 5-16)

| Phase | Neue Frage |
|---|---|
| 5 | **Welches Genre?** Horror, Romantik, Abenteuer, Dokumentar, Comedy |
| 6 | **Wer ist der Held der Geschichte?** Gründer, Kunde, fiktive Figur |
| 7 | **Ausgangssituation: Wie beginnt die Welt des Helden?** |
| 8 | **Das Problem/der Konflikt: Was stört die Ordnung?** |
| 9 | **Der Tiefpunkt: Was ist der dunkelste Moment?** |
| 10 | **Der Wendepunkt: Was ändert alles?** |
| 11 | **Die Transformation: Vorher vs. Nachher** |
| 12 | **Welche Emotion soll dominieren?** Angst, Hoffnung, Freude, Nostalgie |
| 13 | **Visuelle Metaphern: Welche Bilder erzählen die Story?** |
| 14 | **Tempo & Rhythmus: Langsamer Aufbau oder sofort Action?** |
| 15 | **Authentische Details: Was macht die Story glaubwürdig?** |
| 16 | **Das Finale: Wie endet die Geschichte? Open End, Happy End, Cliffhanger?** |

### Kategorie-spezifisch: Advertisement (Phase 5-16)

| Phase | Neue Frage |
|---|---|
| 5 | **Das EINE Hauptproblem das dein Produkt löst** |
| 6 | **Wie fühlt sich der Kunde VOR der Lösung?** (Frustration beschreiben) |
| 7 | **Wie fühlt sich der Kunde NACH der Lösung?** (Transformation) |
| 8 | **Top 3 Features/Vorteile** |
| 9 | **Social Proof: Zahlen, Testimonials, Awards?** |
| 10 | **Konkurrenz: Was machen andere falsch?** |
| 11 | **Der Hook: Was passiert in den ersten 3 Sekunden?** |
| 12 | **Welche Einwände hat die Zielgruppe? Wie entkräftest du sie?** |
| 13 | **Angebot/Preis: Gibt es ein Sonderangebot oder Bonusse?** |
| 14 | **Dringlichkeit: Zeitlimit, begrenzte Verfügbarkeit?** |
| 15 | **Testimonial-Zitat: Ein Satz eines zufriedenen Kunden?** |
| 16 | **Exakter CTA-Text und URL** |

### Alle anderen Kategorien werden ebenso überarbeitet

(Tutorial, Product-Video, Corporate, Social-Content, Testimonial, Explainer, Event, Promo, Presentation, Custom — jeweils mit kategorie-spezifischen Fragen in Phase 5-16)

### Universelle Phasen 17-22 (alle Kategorien)

| Phase | Frage | Hinweis |
|---|---|---|
| 17 | **Markenfarben: Hex-Codes oder Beschreibung** | Wird an Generator weitergegeben |
| 18 | **Voice-Over: Sprache, Geschlecht, Tonalität?** | Nur wenn Mood-Preset nicht schon Audio definiert |
| 19 | **Musik-Stil passend zum Video** | Überspringen wenn im Mood-Preset gewählt |
| 20 | **Format & Plattform** | Überspringen wenn im Mood-Preset gewählt |
| 21 | **Gewünschte Videolänge** | Überspringen wenn im Mood-Preset gewählt |
| 22 | **Zusammenfassung & Bestätigung** | Finale Übersicht |

## Technische Änderungen

### 1. `CATEGORY_PHASES` komplett neu schreiben
Alle 12 Kategorien mit der neuen 3-Block-Struktur. Jede Kategorie hat exakt 22 Einträge, aber Phase 5-16 sind komplett unterschiedlich.

### 2. `generateQuickReplies` → `CATEGORY_QUICK_REPLIES`
Statt einer einzigen `phaseReplies`-Map → eine Map pro Kategorie mit passenden Quick Replies. Bei Storytelling Phase 5: `['Horror/Thriller', 'Romantik/Drama', 'Abenteuer/Action', 'Dokumentarisch']`. Bei Advertisement Phase 5: `['Zeitersparnis', 'Kostenreduktion', 'Qualitätsverbesserung', 'Lass mich erklären...']`.

### 3. `extractRecommendation` robuster machen
Statt `userResponses[7]` → semantisches Parsing mit Feld-Labels. Die Funktion sucht in den AI-Messages nach Phase-Markern und extrahiert die Antworten kontextbasiert.

### 4. Mood-Preset-Integration
Wenn der User im Mood-Preset schon Format, Musik-Stil etc. gewählt hat, werden die entsprechenden Phasen (17-21) intelligent übersprungen oder vorausgefüllt — der Consultant fragt dann "Du hast bereits 16:9 gewählt, passt das noch?" statt nochmal komplett zu fragen.

## Dateien

| Datei | Änderung |
|---|---|
| `supabase/functions/universal-video-consultant/index.ts` | `CATEGORY_PHASES` komplett neu (alle 12 Kategorien), `generateQuickReplies` kategorie-spezifisch, `extractRecommendation` robuster, Mood-Preset-Phasen-Skip |

## Erwartetes Ergebnis

- Jede Kategorie stellt die **richtigen** Fragen (Storytelling fragt nach Genre, nicht nach "Top 3 Features")
- Die erste Frage ist immer der **Zweck** — das steuert alles Weitere
- Quick Replies passen exakt zur Kategorie und Phase
- Das Video-Ergebnis wird präziser, weil die gesammelten Daten spezifischer sind
- Mood-Preset-Daten werden nicht redundant nochmal abgefragt

