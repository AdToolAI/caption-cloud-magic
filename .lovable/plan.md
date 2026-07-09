## Tiefenanalyse: was wirklich schief läuft

Ja: dein Briefing ist eindeutig.

```text
Länge: 15 Sekunden
Szenen: 1 durchgehende Szene
Sprecher: 4 Personen
Timing: 0–3 / 3–6 / 6–9 / 9–12 / 12–15
```

Ein professioneller Parser muss daraus machen:

```text
1 Hauptszene, 15s
innerhalb dieser Szene:
  - Turn 1: Sprecher 1, 0–3s
  - Turn 2: Sprecher 2, 3–6s
  - Turn 3: Sprecher 3, 6–9s
  - Turn 4: Sprecher 4, 9–12s
  - Endcard/Overlay, 12–15s
```

Nicht:

```text
5 Szenen à 3s
```

## Eigentliche Ursache

Das Problem ist nicht primär die KI. Das Problem ist unsere Logik vor und nach der KI.

Wir haben aktuell mehrere Reparatur-/Fallback-Schichten, die alle gut gemeint sind, aber dieselben Daten unterschiedlich interpretieren:

1. **`detectCanonicalBriefingTiming`** erkennt zwar `15s`, aber `sceneCount` ist zu schwach.
   - Es erkennt einfache Muster wie `3 Szenen`.
   - Es versteht aber nicht ausreichend stark: `Szenen: 1 durchgehende Szene`.
   - Noch schlimmer: Zeitfenster wie `0–3`, `3–6`, `6–9`, `9–12`, `12–15` können als “Windows” gezählt werden und dadurch indirekt wie 5 Einheiten wirken.

2. **`detectScriptTimingMode.ts` vermischt Hauptszenen und Sprecher-Turns.**
   - Der Code behandelt `Sprecher 1`, `Sprecher 2`, `Sprecher 3`, `Sprecher 4` schnell als einzelne Shots/Szenen.
   - In deinem Briefing sind das aber eindeutig Sprecherwechsel innerhalb einer durchgehenden Szene.

3. **Die Server-Anweisung ist falsch formuliert, wenn Script-Timing aktiv ist.**
   - Dort steht sinngemäß: “Emit exactly N scenes — one per shot marker.”
   - Wenn der Detector aus Sprecher-/Timingsegmenten N=5 macht, erzwingt der Server genau den falschen Plan.

4. **`applyCanonicalTimingToPlan` korrigiert aktuell Dauer, aber nicht zuverlässig Szenenanzahl.**
   - Deshalb entsteht jetzt der neue Screenshot-Zustand: `15s · 5 Szenen`.
   - Das ist besser als 50s, aber immer noch falsch.

5. **`finalizePlanCanonical` prüft nur Dauer-Konsistenz, nicht Briefing-Szenenanzahl.**
   - Darum kann die UI grün sagen “Plan passt”, obwohl `1 Szene` im Briefing steht und `5 Szenen` im Plan stehen.

## Saubere Ziel-Architektur

Wir brauchen eine harte Trennung:

```text
BriefingContract
  durationSec: 15
  sceneCount: 1
  continuousScene: true
  timingSegments: [0-3, 3-6, 6-9, 9-12, 12-15]
  speakerTurns: [Sprecher 1, Sprecher 2, Sprecher 3, Sprecher 4]
```

Danach gilt:

```text
sceneCount steuert plan.scenes.length
speakerTurns steuern scenes[0].dialogTurns
Timing-Segmente steuern dialogTurns/time hints, NICHT sceneCount
```

## Umsetzungsplan

### 1. `BriefingContract` als zentrale Autorität einführen

Eine neue, deterministische Hilfslogik extrahiert aus dem Originalbriefing:

- explizite Gesamtdauer
- explizite Hauptszenenanzahl
- ob es eine durchgehende Szene ist
- Timingsegmente
- Sprecher-Turns
- Endcard/Overlay-Hinweise

Für dein Beispiel muss diese Funktion exakt liefern:

```ts
{
  durationSec: 15,
  sceneCount: 1,
  continuousScene: true,
  source: 'explicit-briefing',
  timingSegments: [
    { start: 0, end: 3 },
    { start: 3, end: 6 },
    { start: 6, end: 9 },
    { start: 9, end: 12 },
    { start: 12, end: 15, kind: 'endcard' }
  ],
  speakerTurns: [
    { label: 'Sprecher 1', text: 'Mit AdTool AI erstellst du…' },
    { label: 'Sprecher 2', text: '…realistische Lip-Sync-Videos…' },
    { label: 'Sprecher 3', text: '…mit mehreren Sprechern…' },
    { label: 'Sprecher 4', text: '…die perfekt zusammenpassen.' }
  ]
}
```

### 2. Parser-Priorität ändern

Neue Regel:

```text
Explizite Hauptszenenanzahl gewinnt immer vor Timingsegmenten und Sprecherblöcken.
```

Konkret:

- `Szenen: 1 durchgehende Szene` gewinnt vor `0–3`, `3–6`, `6–9`, `9–12`, `12–15`.
- `Eine Szene, 15 Sekunden` gewinnt vor `Sprecher 1–4`.
- Nur wenn keine Hauptszenenanzahl angegeben ist, dürfen Timingmarker Hauptszenen erzeugen.

### 3. Server-Prompt und Server-Guard korrigieren

Der Server darf bei `continuousScene=true` nicht mehr sagen:

```text
one scene per speaker/shot marker
```

Sondern:

```text
Emit exactly 1 scene.
Put all speaker lines into dialogTurns of that scene.
Use timing segments as internal timing hints only.
```

Außerdem wird nach Pass A deterministisch geprüft:

- Wenn Contract `sceneCount=1`, aber Modell 5 Szenen liefert:
  - merge zu 1 Szene
  - alle Dialog-Turns übernehmen
  - alle Cast-Slots deduplizieren
  - Location/Setting/Kamera/Movement zusammenführen
  - Endcard als `textOverlay`/Brand-Hinweis behalten

### 4. Client-Finalizer erweitern

`finalizePlanCanonical` bekommt zusätzlich zur Dauer-Invariante eine Szenenanzahl-Invariante:

```text
Wenn canonical_timing.sceneCount vorhanden ist:
  plan.scenes.length muss exakt sceneCount sein
```

Wenn nicht:

- bei `sceneCount=1`: Szenen mergen
- bei `sceneCount>1`: Szenen trimmen/padden/redistributieren nur nach explizitem Contract
- UI darf erst dann grün werden, wenn Dauer UND Szenenanzahl passen

### 5. Local Fallback reparieren

Der lokale Fallback ist aktuell ebenfalls verdächtig:

```ts
const sceneCount = Math.max(canonicalTiming?.sceneCount ?? 0, hints.length, defaultBeats.length)
```

Das ist bei explizit `1 Szene` falsch, weil `defaultBeats.length = 3` die 1 überschreiben kann.

Neue Regel:

```text
Wenn sceneCount explizit erkannt wurde, darf defaultBeats nicht erhöhen.
```

### 6. Tests mit deinem Briefing

Ich ergänze Regressionen für genau deinen Text:

- `15 Sekunden` erkannt
- `1 durchgehende Szene` erkannt
- `0–3 / 3–6 / 6–9 / 9–12 / 12–15` werden als interne Segmente erkannt
- `Sprecher 1–4` werden als Dialog-Turns erkannt
- Server-artiger Fehlplan mit 5 Szenen wird zu 1 Szene gemerged
- Local fallback erzeugt nicht mehr 3 oder 5 Szenen
- SafePlanNotice ist nur grün bei `15s · 1 Szene`

## Ergebnis

Nach Umsetzung muss dein Beispiel im Production Plan anzeigen:

```text
Plan passt zu deinem Briefing
15s · 1 Szene
Quelle: Briefing/Skript
```

Und in der Szene:

```text
Cast: 4 Personen
DialogTurns: 4 Sprecher
Setting: Creator-Studio / Startup-Büro / Filmset
Movement: langsames gemeinsames Tracking auf Kamera
Endcard: AdTool AI / Multi-Speaker-Lip-Sync in Minuten
```

Das löst nicht nur diesen Einzelfall, sondern die Grundlogik: Hauptszenen, Sprecherwechsel und Timingsegmente werden künftig nicht mehr vermischt.