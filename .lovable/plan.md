

## Plan: Adaptives KI-Interview — Dynamisch, Individuell, Intelligent

### Problem
Das aktuelle Interview ist ein starres 22-Phasen-Schema: Phase = Anzahl User-Nachrichten + 1, mit fest codierten Fragen und Quick Replies pro Phase. Das führt zu:
- **Immer gleiche Fragen** egal was der Nutzer schon beantwortet hat
- **Keine Flexibilität** — wenn der Nutzer in einer Antwort 3 Fragen beantwortet, werden sie trotzdem einzeln gestellt
- **Eintönige Ergebnisse** — alle Videos derselben Kategorie enden im gleichen Stil
- **Unnatürliches Gespräch** — fühlt sich wie ein Formular an, nicht wie eine Beratung

### Architektur-Umbau: Von Phase-Counter zu AI-gesteuertem Interview

**Kernidee**: Die KI entscheidet selbst, welche Information sie noch braucht. Statt 22 feste Phasen gibt es **Information Slots** (Pflichtfelder + optionale Felder). Die KI trackt, welche Slots bereits gefüllt sind, und stellt nur Fragen zu fehlenden Informationen.

```text
VORHER (starr):
  User msg 1 → Phase 1 (fixe Frage) → fixe Quick Replies
  User msg 2 → Phase 2 (fixe Frage) → fixe Quick Replies
  ...immer 22 Nachrichten, egal was

NACHHER (adaptiv):
  User msg 1 → KI analysiert: "3 Slots gefüllt, 8 offen"
             → stellt die relevanteste nächste Frage
             → Quick Replies basierend auf bisherigem Kontext
  User msg 2 → KI analysiert: "6 Slots gefüllt, 5 offen"
             → überspringt bereits beantwortete Themen
             → kann Interview nach 8-15 Nachrichten abschließen
```

### Änderungen

**1. `supabase/functions/universal-video-consultant/index.ts` — Komplett-Umbau des System-Prompts**

- **Information Slots statt Phasen**: Pro Kategorie eine Liste von ~12-15 Information Slots definieren (z.B. für `product-video`: `product_name`, `target_audience`, `usp`, `emotional_hook`, `visual_style`, `setting`, `duration`, `format`, `music_style`, `voiceover`, `cta`)
- Jeder Slot hat: `key`, `label`, `required: boolean`, `filled: boolean`
- **Slot-Extraction vor dem AI-Call**: Vor jedem AI-Aufruf analysiert die Edge Function die bisherigen Nachrichten und markiert welche Slots bereits aus den User-Antworten extrahierbar sind
- **Neuer System-Prompt**: Statt "Du bist in Phase 7/22, stelle Frage 7" → "Du hast folgende Informationen gesammelt: [gefüllte Slots]. Dir fehlen noch: [offene Slots]. Stelle die nächste relevante Frage. Wenn der Nutzer bereits genug Info gegeben hat, überspringe Slots. Du entscheidest wann das Interview komplett ist."

**2. Dynamische Quick Replies — KI-generiert statt hardcoded**

- Die riesigen `CATEGORY_QUICK_REPLIES` Objekte (Hunderte Zeilen) werden **entfernt**
- Stattdessen: Die KI generiert Quick Replies im JSON-Response basierend auf dem Gesprächskontext
- Der System-Prompt enthält die Anweisung: "Generiere 3-4 kontextbezogene Antwortvorschläge, die auf die bisherigen Antworten des Nutzers eingehen. KEINE generischen Antworten wie 'Weiter' oder 'Ja'."
- Fallback: Nur wenn die KI keine brauchbaren Quick Replies liefert, greift ein minimaler Fallback

**3. Adaptive Interview-Länge**

- `calculatePhaseInfo` wird ersetzt durch `calculateSlotProgress`:
  - Zählt gefüllte vs. offene Pflicht-Slots
  - Progress = gefüllte Pflicht-Slots / totale Pflicht-Slots × 100
  - Interview ist "complete" wenn alle Pflicht-Slots gefüllt sind (typisch 8-15 Nachrichten statt fix 22)
- `isComplete` wird von der KI bestimmt: Sie setzt `"isComplete": true` wenn sie alle nötigen Infos hat

**4. Persönlichkeit und Individualität im Prompt**

- Neuer Prompt-Abschnitt: "Reagiere auf die SPEZIFISCHEN Antworten des Nutzers. Wenn er 'Calvin Klein Parfüm' sagt, beziehe dich auf Luxusmarken-Konventionen. Wenn er 'Startup App' sagt, sprich über Tech-Storytelling. Passe deinen Tonfall an den Kunden an."
- "Stelle FOLLOW-UP-Fragen wenn eine Antwort besonders interessant ist. Sei neugierig."
- "Variiere deine Fragen — stelle nie zwei Fragen auf die gleiche Art. Nutze manchmal Szenarien, manchmal direkte Fragen, manchmal kreative Übungen."

**5. Slot-Extraction-Logik (neue Funktion)**

```text
function extractFilledSlots(messages, category, lang):
  - Geht durch alle User-Nachrichten
  - Nutzt Keyword-Matching + semantische Analyse
  - Markiert Slots als gefüllt wenn Info vorhanden
  - Gibt { filledSlots, missingSlots, progress } zurück
```

**6. extractRecommendation anpassen**

- Statt auf fixe Positionen (userResponses[0], [1], ...) zu bauen, nutzt es die Slot-Extraction
- Robuster, da Infos an beliebiger Stelle im Gespräch stehen können

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/universal-video-consultant/index.ts` | Komplett-Umbau: Slot-System, adaptiver Prompt, dynamische Quick Replies, flexible Interview-Länge |

### Was entfernt wird
- `CATEGORY_QUICK_REPLIES_BLOCK1` (~200 Zeilen)
- `CATEGORY_QUICK_REPLIES` (~600 Zeilen) 
- `UNIVERSAL_QUICK_REPLIES_BLOCK3` (~50 Zeilen)
- `generateQuickReplies()` Funktion
- Starre `calculatePhaseInfo` (Phase = Nachrichtenzahl)
- Die starren 22-Phasen-Anweisungen im System-Prompt

### Was bleibt
- `CATEGORY_PHASES_BLOCK1/2/3` als **Slot-Definitionen** (umbenannt) — sie definieren welche Infos gesammelt werden müssen
- Kategorie-spezifische Personas (`categoryRoles`)
- Storytelling Sub-Mode Detection
- `extractRecommendation` (angepasst auf Slot-basierte Extraction)
- `compressContext` für lange Gespräche
- Streaming + SSE Parsing

### Ergebnis
- Interview fühlt sich wie eine **echte Beratung** an, nicht wie ein Formular
- KI geht auf den Kunden ein und stellt Follow-Up-Fragen
- Wenn ein Nutzer in einer Antwort 3 Fragen beantwortet, werden sie nicht nochmal gestellt
- Quick Replies sind kontextbezogen und individuell
- Interview-Länge variiert: 8-15 Nachrichten statt fix 22
- Jedes Video-Briefing ist einzigartig

