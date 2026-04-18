

## Pragmatischer Ansatz: Übergänge entfernen

Du hast absolut recht — und das ist der **klügste Move**, den wir machen können. Nach 6+ Iterationen am Audio/Video-Sync mit Übergängen ist klar:

**Das Übergangs-System im Composer ist die Quelle der Bugs.** Es ist nicht ein Bug, sondern eine ganze Klasse von Bugs:
- Frame-Math-Drift zwischen Edge/Renderer
- Audio-Geometrie vs. Video-Overlap-Asymmetrie  
- Reale vs. nominelle Dauern desynchronisieren das WAV
- Hailuo-Clips haben unvorhersehbare reale Längen

Der Composer hat einen klaren Job: **Szenen aneinanderreihen + Voiceover drüberlegen**. Übergänge gehören in den **Universal Director's Cut**, der genau dafür gebaut ist (Ping-Pong-Architektur, RAF-Renderer, Boundary-Marker — Memory bestätigt das).

## Plan: Hard-Cuts only im Composer

### Was geändert wird

**1. Renderer (`src/remotion/templates/ComposedAdVideo.tsx`)**
- `<TransitionSeries>` durch `<Series>` ersetzen
- Komplette Transition-Logik raus: keine `transitionFrames`, kein `Math.floor(baseFrames/2)`, kein Overlap-Handling
- Jede Szene ist eine simple `<Series.Sequence>` mit `durationInFrames = round(durationSeconds * fps)`
- Audio-Track unverändert — er wird durch das Wegfallen der Overlaps automatisch korrekt aligniert

**2. Edge Function (`supabase/functions/compose-video-assemble/index.ts`)**
- `sumSceneFrames` rechnet bereits ohne Overlap-Korrektur (war eh nie drin) → bleibt
- `transitionType` und `transitionDuration` aus dem Payload **können** drinbleiben (zukunftssicher), werden aber vom Renderer ignoriert
- Optional: im Log einen Hinweis "transitions disabled — hard cuts only"

**3. UI (`src/components/video-composer/...`)**
- Übergangs-Auswahl im Composer-UI ausblenden oder mit Hinweis "Übergänge im Director's Cut nachträglich hinzufügen" ersetzen
- Nicht hart entfernen — nur visuell deaktivieren, falls wir es später reaktivieren wollen

### Warum das funktioniert

Mit Hard-Cuts verschwinden **alle** der bisher debugten Probleme auf einen Schlag:
- Kein Overlap → keine asymmetrische Frame-Math
- Kein Crossfade → kein Audio-Decoder-Chunk-Schnitt zwischen Szenen
- Audio-Timeline = exakte Summe der realen Szenen-Dauern → kein Drift
- VO-Slot pro Szene endet **genau** wenn das Video endet

Der User-Workflow wird sogar besser:
1. Composer: schnelles Zusammenstellen + Voiceover (in 3 Min)
2. Director's Cut: gezielt 2-3 Übergänge an gewünschten Stellen hinzufügen (in 2 Min)

Statt bei jedem Render ein Glücksspiel.

### Lambda-Bundle

Da `ComposedAdVideo.tsx` sich ändert: **Bundle-Redeploy nötig** nach den Code-Änderungen.

### Geänderte Dateien

1. `src/remotion/templates/ComposedAdVideo.tsx` — `<TransitionSeries>` → `<Series>`, Transition-Logik raus
2. `src/components/video-composer/ClipsTab.tsx` (oder wo Transitions konfiguriert werden) — UI-Hinweis "Übergänge in Director's Cut"
3. **Optional**: `supabase/functions/compose-video-assemble/index.ts` — Log-Hinweis, Payload bleibt kompatibel

### Verify nach Fix

1. Frischen Composer-Render starten
2. **Alle** Übergänge prüfen: harte Cuts, kein Audio-Cut, keine Wiederholung
3. Resultierendes Video in den Director's Cut laden → 2-3 Übergänge dort hinzufügen → exportieren
4. Endergebnis sollte sauber sein

### Klärungsfrage

Bevor ich code: soll der Composer-UI-Hinweis 
- (a) die Übergangs-Dropdowns **komplett ausblenden** mit einem Banner "Übergänge werden im Director's Cut hinzugefügt", oder
- (b) die Dropdowns **sichtbar lassen** aber als "Vorschau (im Director's Cut anwenden)" markiert, oder
- (c) erstmal **gar nichts** an der UI ändern (nur Renderer-Fix), und wir kümmern uns um die UI-Klärung später?

Mein Vorschlag: **(a)** — klar kommuniziert, kein User-Frust durch nicht-funktionierende Optionen.

