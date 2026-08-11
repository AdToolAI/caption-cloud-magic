# Briefing-Analyse: Blocklabels raus, echten Dialog rein

## Was der Screenshot und die Plandaten zeigen

Der zuletzt gespeicherte Plan (22:58 UTC) enthält:

- Szene 1 und Szene 2 haben jetzt **korrekt 4 Cast-Slots** (`@founder`, `@creative`, `@marketer`, `@creator`) — die Ensemble-Mindestbesetzung greift.
- Als „Dialogzeilen" stehen aber weiterhin **nur Strukturzeilen** drin: `@dauer`, `@ort`, `@cast`, `@aktion`, `@stimme`, `@untertitel`, `@negative-prompt`. Kein einziger echter Sprecher-Turn.
- Der **echte Dialog steht komplett als Fließtext im `@aktion`-Block**: `@creative: "Moment. Das Briefing kommt einfach hier rein?" @founder: "Genau." …` — elf Zeilen, die nie in Turns zerlegt wurden.

Daraus folgt zweierlei:

1. Der v420-Labelfilter greift auf diesem Pfad **nicht**. Die Label-Turns entstehen nicht im Shot-Parser (dort ist der Filter aktiv), sondern weiter hinten — die Sanitize-Stelle in `deep/index.ts` ist offenbar nicht der letzte Schreibpunkt ins Manifest. Welcher Pass sie erzeugt, ist noch **nicht** belegt und muss zuerst festgestellt werden.
2. Dialog, der **inline in einem Prosablock** als `@mention: "Text"` steht, wird gar nicht als Dialog erkannt. Der Parser kennt nur Zeilenanfangs-Muster `LABEL: Text`. Deshalb „kein korrektes Skript".

## Umsetzung

### 1. Herkunft der Label-Turns feststellen (erster Schritt)

Ein Trace-Log an jedem Punkt, der `dialogTurns` schreibt (LLM-Rohausgabe, Script-Timing-Seeding, Speaker-Map-Pass, Rescue-Pass), mit Szenen-Index und Mention-Keys. Ein Lauf mit dem Continuity-Stress-Test-Briefing zeigt eindeutig, welcher Pass `@dauer` erzeugt. Erst danach der Fix an genau dieser Stelle.

### 2. Ein einziges Schluss-Gate vor dem Persistieren

Unabhängig vom Verursacher: direkt bevor das Manifest validiert und in `composer_production_plans` geschrieben wird, laufen alle `dialogTurns` durch `isNonSpeakerLabel`. Blocklabels können damit nirgends mehr durchrutschen, egal welcher Pass sie einschleust.

### 3. Inline-Dialog aus Prosablöcken extrahieren

Neuer deterministischer Extraktor: In `AKTION`/`DIALOG`/Freitextblöcken werden alle Vorkommen von `@mention: "Text"` (auch mehrere pro Absatz, mit typografischen wie geraden Anführungszeichen) in Reihenfolge zu Dialog-Turns. Regeln:

- Nur `@mention`s, die im Cast-Block der Szene stehen, werden Sprecher — sonst bleibt der Text Prosa.
- Der extrahierte Dialogtext wird aus dem Aktionstext entfernt, damit er nicht doppelt im Visual-Prompt landet.
- Ergebnis für dieses Briefing: Szene 2 bekommt 11 Turns mit korrekt gebundenen Sprechern.

### 4. UI: Blocklabels nicht mehr als Dialogzeilen rendern

Im Plan-Sheet werden Zeilen, die `isRealSpeakerTurn` nicht bestehen, ohne Sprecher-Dropdown und ohne „Sprecher noch offen"-Badge dargestellt (als reine Briefing-Notiz) — der Zähler ist bereits gefiltert, die Liste noch nicht.

### 5. Regressionstest

Fixture = das Continuity-Stress-Test-Briefing. Erwartung: 0 Label-Turns, Szene 2 mit 11 Turns in Originalreihenfolge, Sprecher gebunden an `@creative`/`@founder`/`@marketer`/`@creator`, Aktionstext ohne Dialogzitate.

## Technische Bereiche

- `supabase/functions/_shared/briefing/deep/index.ts` — Trace, Schluss-Gate, Inline-Dialog-Extraktion
- `supabase/functions/_shared/briefing/deep/detectScriptTimingMode.ts` — Extraktor-Helfer wiederverwenden
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — Darstellung der Nicht-Sprecher-Zeilen
- Test unter `src/lib/video-composer/__tests__/`

Lip-Sync-Pipeline, gerenderte und gesperrte Szenen bleiben unverändert.
