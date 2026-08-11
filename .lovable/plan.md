# Briefing-Analyse: Dialog deterministisch, LLM raus aus dem Sprecher-Feld

## Ehrliche Antwort zur Frage „sauberste Lösung?"

Die vorige Fassung war eine Reparatur: Filter nachziehen, Herkunft suchen, Gate einbauen. Das behebt den Fall, hält aber die eigentliche Ursache am Leben — **`dialogTurns` hat heute vier konkurrierende Schreiber** (LLM-Rohausgabe, Script-Timing-Seeding, Speaker-Map-Pass, Rescue-Pass). Jeder darf beliebige Mentions setzen, jeder Fix muss an allen vier Stellen wiederholt werden. Genau deshalb ist derselbe Fehler jetzt mehrfach zurückgekommen.

Die saubere Lösung ist eine Zuständigkeitsentscheidung, keine weitere Filterschicht:

> **Wer Dialog schreibt, ist genau eine Komponente: ein deterministischer Extraktor. Das Sprachmodell liefert Struktur, Bildsprache und Timing — aber keine Sprecherzeilen mehr.**

Dialog ist im Briefing wörtlich vorhanden. Ihn von einem Modell „erkennen" zu lassen, ist unnötiges Risiko: es erfindet Sprecher, wandelt Blocklabels in Mentions um und verliert Reihenfolge. Ein Parser tut das exakt und testbar.

## Belegter Ist-Zustand (Plan vom 22:58 UTC)

- Cast: Szene 1 und 2 haben korrekt **4 Slots** (`@founder`, `@creative`, `@marketer`, `@creator`) — die Ensemble-Mindestbesetzung funktioniert.
- `dialogTurns`: ausschließlich **Strukturzeilen** (`@dauer`, `@ort`, `@cast`, `@aktion`, `@stimme`, `@untertitel`, `@negative-prompt`). Kein echter Sprecher-Turn.
- Der echte Dialog steht als Fließtext im `@aktion`-Block: `@creative: "Moment. Das Briefing kommt einfach hier rein?" @founder: "Genau." …` — 11 Zeilen, nie zerlegt.

## Umsetzung

### 1. Ein Dialog-Extraktor als einzige Quelle

Neues Modul `supabase/functions/_shared/briefing/deep/extractDialog.ts`. Es liest den Szenenblock des Briefings und erzeugt die Turns:

- Zeilenform `@mention: "Text"` **und** Inline-Vorkommen mitten im Prosablock, mehrere pro Absatz, gerade und typografische Anführungszeichen.
- Fallback auf Klarnamen-Form `Name: Text`, aber nur wenn der Name eindeutig einem Cast-Slot der Szene entspricht.
- Reihenfolge = Reihenfolge im Text. Sprecher = Cast-Slot der Szene; unbekannte Mention → Zeile bleibt Prosa, wird nie zum Turn.
- Blocklabels (`isNonSpeakerLabel`, DE/EN/ES) sind strukturell ausgeschlossen — nicht als nachgelagerter Filter, sondern weil ein Label nie ein Cast-Slot ist.
- Extrahierte Zitate werden aus dem Aktionstext entfernt, damit der Visual-Prompt sie nicht doppelt enthält.

### 2. Die anderen drei Schreiber verlieren das Recht auf `dialogTurns`

- Das Modell-Schema (Pass A/B) bekommt **kein** `dialogTurns`-Feld mehr; kommt trotzdem eins zurück, wird es verworfen.
- Script-Timing-Seeding und Rescue-Pass setzen nur noch Dauer, Voiceover-Text und Location — keine Turns.
- Der Speaker-Map-Pass bindet nur noch bestehende Turns an Charakter-UUIDs, er erzeugt keine.

### 3. Invariante im Schema statt im Code verstreut

`ProductionPlan` (Zod) erhält eine Regel: jeder Turn braucht einen `speakerMentionKey`, der in `scene.cast` vorkommt. Verletzungen scheitern beim Parsen — der Fehler kann nicht mehr stillschweigend bis in die UI durchlaufen. Das ersetzt das zuvor geplante „Schluss-Gate".

### 4. Der Cast-Slot ist der Slotfänger — die Figur erbt seinen Dialog

Die Mention (`@creative`) ist der Slot, nicht die Person. Wer immer diesem Slot zugeordnet wird, bekommt automatisch **alle** Zeilen dieser Mention:

- Zuordnung passiert genau einmal pro Szene am Cast-Slot. Turns speichern primär die Mention; die Charakter-UUID wird daraus abgeleitet, nicht separat gepflegt.
- Figur im Slot wechseln → alle Zeilen dieser Mention wechseln mit, in allen Szenen, ohne weiteren Klick.
- Zwei Slots tauschen → die Dialoge tauschen mit; keine Figur bekommt dieselbe Zeile doppelt.
- Ein leerer Slot mit Zeilen bleibt sichtbar offen; sobald eine Figur gesetzt ist, ist die Zeile gebunden.
- Beim Anwenden auf das Storyboard wird die Mention erneut über den Cast aufgelöst — kein eingefrorener Stand aus dem Analysezeitpunkt.

### 5. UI folgt der Invariante

Im Plan-Sheet entfällt die Sonderbehandlung: da nur echte Turns existieren, verschwinden Dropdown und „Sprecher noch offen" an Strukturzeilen automatisch. Pro Zeile steht nur noch der Slotname; gewählt wird die Figur oben am Cast-Slot. Briefing-Notizen (Stimme, Untertitel, Negative Prompt) werden als Notiz ohne Sprecherfeld angezeigt.

### 6. Tests, die den Regress dauerhaft verhindern

- Fixture Continuity-Stress-Test: 0 Label-Turns, Szene 2 mit 11 Turns in Originalreihenfolge, Sprecher `@creative`/`@founder`/`@marketer`/`@creator`, Aktionstext ohne Zitate.
- Fixture reines Voiceover-Briefing ohne Dialog: 0 Turns, Voiceover-Text bleibt erhalten.
- Fixture Klarnamen-Dialog (`Samuel: …`): korrekt gebunden.
- Slotfänger-Test: Figur am Slot wechseln bzw. zwei Slots tauschen → alle zugehörigen Zeilen folgen, bis ins Storyboard.
- Schema-Test: ein Turn mit Mention außerhalb des Cast lässt die Validierung scheitern.

## Technische Bereiche

- `supabase/functions/_shared/briefing/deep/extractDialog.ts` (neu) — alleiniger Turn-Erzeuger
- `supabase/functions/_shared/briefing/deep/index.ts` — Schema ohne `dialogTurns`, Seeding/Rescue entschärft, Extraktor eingehängt
- `supabase/functions/_shared/briefing/deep/detectScriptTimingMode.ts` — Labelerkennung wird vom Extraktor mitgenutzt
- `src/lib/video-composer/briefing/productionPlan.ts` — Cast-Invariante im Zod-Schema
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — Anzeige der Notizzeilen
- Tests unter `src/lib/video-composer/__tests__/`

Lip-Sync-Pipeline, Anker-Logik sowie gerenderte und gesperrte Szenen bleiben unverändert.
