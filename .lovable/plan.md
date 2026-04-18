

## Diagnose — Gummibandeffekt nach allen vorherigen Fixes

Nach 6+ Iterationen am Audio/Versionspinning besteht das Problem weiterhin an **immer denselben 2-3 Stellen**. Das ist ein **deterministisches** Symptom — nicht zufällig, nicht race-bedingt. Zeit für eine echte Code-Analyse statt weiterer Spekulation.

Lass mich den aktuellen Zustand der relevanten Dateien lesen, bevor ich eine neue Hypothese aufstelle. Ich brauche:

1. Den aktuellen `ComposedAdVideo.tsx` (wurde mehrfach umgeschrieben)
2. Den aktuellen `compose-video-assemble/index.ts` 
3. Den `VoiceSubtitlesTab.tsx` mit der WAV-Padding-Logik
4. Die Scene-Daten-Struktur aus DB (welche Werte für Szenen-Dauer + Transitions liegen wirklich an?)

## Was "Gummibandeffekt" technisch bedeutet

- **Visuell**: Das Bild wird kurz beschleunigt UND dann wieder verlangsamt (oder umgekehrt) → Eindruck eines Gummibands
- **NICHT**: Audio-Stotterer, Wiederholung, Cut (das waren die alten Symptome)
- **Ursache-Klasse**: `playbackRate`-Manipulation oder asymmetrische `Sequence`-Geometrie wo das Video schneller/langsamer abgespielt wird als seine echte Dauer

## Hypothesen die ich prüfen muss

1. **`<TransitionSeries>` + `<OffthreadVideo>` Speed-Mismatch**: Wenn eine Szene `durationInFrames=90` hat, aber das echte Video 92 Frames lang ist, "rennt" Remotion am Ende → Gummiband
2. **Szenen-Dauer falsch berechnet**: `Math.ceil(seconds * fps)` vs. `Math.floor` — bei 30fps und ungeraden Sekundenwerten gibt es konsistent 1-Frame-Abweichungen genau an den 2-3 Stellen
3. **Voiceover-Padding diktiert eine andere Gesamtdauer als die `<TransitionSeries>` ergibt** → Audio-Track ist länger/kürzer als Video-Komposition → Remotion stretched eines von beiden
4. **`playbackRate` aus Scene-Trim**: Falls Szenen durch User-Trimming einen anderen `playbackRate` haben, multipliziert sich das mit `<TransitionSeries>`-Timing

## Plan

### Schritt 1 — Code-Inspektion (ohne Änderungen)

Lese diese Dateien um die echten aktuellen Werte zu sehen:
- `src/remotion/templates/ComposedAdVideo.tsx` (aktuelle TransitionSeries-Implementierung)
- `supabase/functions/compose-video-assemble/index.ts` (Duration-Math + Payload-Struktur)
- `src/components/video-composer/VoiceSubtitlesTab.tsx` (WAV-Padding-Logik)
- DB-Query: ein konkretes `video_creations`-Projekt mit den problematischen Scenes anschauen → echte `duration` + `transitionType` Werte

### Schritt 2 — Hypothese verifizieren mit konkreten Zahlen

Berechne für die 2-3 problematischen Übergänge:
- Erwartete Frames: `seconds × 30`
- Tatsächlich gerundete Frames in `<TransitionSeries.Sequence>`
- Echte Video-Dauer (aus ffprobe-Daten in der DB falls vorhanden)
- Differenz → erklärt sie den Gummibandeffekt?

### Schritt 3 — Fix implementieren (in Default-Mode)

Je nach Ursache:
- **Falls Frame-Rounding-Mismatch**: `Math.round(seconds × fps)` durchgängig verwenden, ODER `useVideoMetadata`-Hook nutzen um die echte Video-Frame-Anzahl als `durationInFrames` zu setzen
- **Falls Audio/Video-Längen-Mismatch**: `<Audio>`-Komponente mit `endAt` exakt auf Komposition-Länge clampen, WAV-Padding in `VoiceSubtitlesTab` an die **gerundete** Composition-Frames-Länge anpassen statt an die Roh-Sekunden
- **Falls `<OffthreadVideo>` über das Szenen-Ende hinaus ziehen**: `endAt`-Prop auf der Szenen-Video-Komponente setzen, damit Remotion nicht das letzte Frame "stretched"
- **Falls `<TransitionSeries>` selbst speed-affine ist**: Zurück zu manuellen `<Sequence>` mit präzisem Frame-Snapping (deterministisch, keine `floor`/`ceil`-Asymmetrie)

### Schritt 4 — Verify

- Render mit den 2-3 problematischen Scenes
- Frame-by-Frame an den Übergangs-Boundaries prüfen (z.B. bei `frame=N-2 ... N+2` jeweils Stills)
- User testet finalen Render

## Geänderte Dateien (voraussichtlich)

- `src/remotion/templates/ComposedAdVideo.tsx` — Frame-Snapping + `endAt`-Clamping pro Szene
- `supabase/functions/compose-video-assemble/index.ts` — konsistente Duration-Math (Math.round statt ceil/floor)
- `src/components/video-composer/VoiceSubtitlesTab.tsx` — WAV-Padding an gerundete Composition-Frames anpassen

## Warum das diesmal anders ist

Ich höre auf zu spekulieren und lese **die echten Werte** aus der DB für ein konkretes problematisches Projekt. Bisher habe ich Hypothesen ohne Daten gefixt — daher die Wiederholungs-Loop. Mit echten Frame-Zahlen lässt sich der Gummibandeffekt mathematisch nachweisen oder ausschließen.

