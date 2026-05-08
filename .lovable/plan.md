## Problem

Der Storyboard-Generator (`compose-video-storyboard`) erlaubt im Tool-Schema nur **ein** `characterShot` pro Szene (`characterShot: { characterId, shotType }`). Sobald zwei oder mehr Charaktere definiert sind (z.B. Sarah + Matthew), wählt die LLM für jede Szene exakt einen Charakter — dadurch tauchen die beiden in der Cast Consistency Map nie zusammen in derselben Spalte (S1, S2 …) auf, obwohl sie thematisch zusammengehören.

Der bestehende Client-Sync (`syncCastFromPrompt`) hilft nur, wenn die LLM den zweiten Namen im `aiPrompt` erwähnt — was sie aber nach aktueller System-Instruktion gerade nicht tut, weil die Anweisung lautet *"pick the primary one for characterShot"*.

## Lösung — Multi-Cast direkt im Storyboard

### 1. Schema-Erweiterung (`compose-video-storyboard/index.ts`)
- Tool-Schema: zusätzlich zum bestehenden `characterShot` ein optionales **`characterShots`**-Array (max. 4 Einträge, gleiche Item-Form wie `characterShot`). `characterShot` bleibt zur Abwärtskompatibilität als „primärer Slot" enthalten.
- System-Prompt im SMART-CHARACTER-USAGE-Block ergänzen:
  - Bei ≥ 2 definierten Charakteren **soll** die LLM in 30–60 % der character-tragenden Szenen **zwei (selten drei) Charaktere gleichzeitig** zeigen — mit individuellem `shotType` pro Charakter (z.B. Sarah `full`, Matthew `profile`).
  - Diese Mehrfach-Slots gehören in das neue `characterShots`-Array; der primäre/erstgenannte zusätzlich in `characterShot` (Backcompat).
  - Im `aiPrompt` müssen alle gelisteten Namen + Signature-Items wörtlich vorkommen.
  - Solo-Szenen bleiben erlaubt (Variation), aber kein „nur 1 Charakter pro Szene"-Zwang mehr.

### 2. Server-Side Mapping
- In `parsed.scenes.map(...)`: aus `s.characterShots` (falls vorhanden) ein bereinigtes Array bauen (Duplikate raus, max. 4, nur gültige `characterId`s aus `briefing.characters`), in das fertige Scene-Objekt als `characterShots` übernehmen. Wenn nur `s.characterShot` kommt → wie bisher in `characterShots: [s.characterShot]` spiegeln.
- `pickClipSource` / `isStockCandidate`: „featured a character" zählt jetzt als „mindestens ein Eintrag in `characterShots` mit `shotType !== 'absent'`".
- Hard-Anchor-Block (Zeilen ~541-590, der den Namen ins Prompt zwingt): über alle Einträge in `characterShots` iterieren statt nur `characterShot`.

### 3. Floor/Cap (Frequency-Repair)
- Aktuell läuft Floor/Cap nur über `primaryChar` (`briefing.characters![0]`). Erweitern: für **jeden** definierten Charakter eine eigene Floor/Cap-Schleife laufen lassen, die in/aus `characterShots` einfügt bzw. entfernt. Reihenfolge: erst alle Floors, dann alle Caps.
- Wenn ein Charakter via Floor in eine Szene neu eingefügt wird, in der bereits ein anderer steht → einfach an `characterShots` anhängen (max. 4).

### 4. Client-Konsistenz
- `syncCastFromPrompt` bleibt unverändert (idempotent, Append-only) und greift weiterhin als Sicherheitsnetz, falls die LLM Namen erwähnt aber `characterShots` vergisst.
- `SceneCard` und Cast Consistency Map konsumieren `scene.characterShots` bereits korrekt — keine Änderung nötig (laut bestehendem Code-Pfad in der Memory `[Multi-Character Scene Composition]`).

## Out of Scope
- Keine UI-Änderungen am Wizard/SceneCard, keine DB-Migrationen.
- Keine Änderung am Anchor-Compose oder Render-Pfad — die nutzen bereits `portraitUrls[]` aus `characterShots` (siehe Memory `[Multi-Character Scene Composition]`).
- Frequency-Tags pro Charakter bleiben semantisch unverändert; nur die Repair-Schleife wird multi-fähig.

## Dateien
- **edit**: `supabase/functions/compose-video-storyboard/index.ts` (Schema, System-Prompt, Mapping, Floor/Cap, Hard-Anchor)

## Verifikation
1. Briefing mit zwei Charakteren (Sarah + Matthew, beide `balanced`) → in der Cast Consistency Map taucht in mindestens 1–2 Szenen die grüne Markierung **bei beiden Zeilen in derselben Spalte** auf.
2. Cast-Zeile dieser Szenen zeigt beide Chips ohne dass der „Auto-erkannt"-Sync feuern muss.
3. `aiPrompt` dieser Szenen nennt beide Namen; Anker-Compose schickt zwei `portraitUrls[]` an Nano Banana 2.
4. Solo-Szenen funktionieren weiter wie bisher (nicht jede Szene wird zwangsweise multi-cast).
