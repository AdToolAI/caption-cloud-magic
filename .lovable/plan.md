

## Echter Befund — warum es noch leicht abgehackt klingt

Die großen Cuts/Wiederholungen sind weg (Cache-Bug gefixt). Was bleibt, ist ein **subtiles Stottern** an manchen Übergängen. Beim genauen Lesen finde ich **drei** wahrscheinliche Ursachen:

### Ursache 1 — `OffthreadVideo` mit `pauseWhenBuffering={false}` während Crossfade-Overlap

In der jetzigen Architektur überlappen Szenen-Sequences während einer Transition (extendStart/extendEnd). Während dieses Overlaps rendert Remotion **zwei `<OffthreadVideo>`-Decoder gleichzeitig** für 12 Frames (0.4s @ 30fps). 

`OffthreadVideo` mit `pauseWhenBuffering={false}` zwingt den Decoder, einen Frame zu liefern **auch wenn er nicht bereit ist** → Lambda-Worker kann an dieser Stelle einen leeren/wiederholten Frame ausgeben. Das blockiert die Render-Pipeline kurz und der **Audio-Mux-Schritt** am Ende verschiebt Audio-Samples um wenige ms → "abgehackt" klingender Übergang.

### Ursache 2 — `framesPerLambda: 270` + `concurrencyPerLambda: 1`

Bei z.B. 7 Szenen × 6s = 1260 Frames → 5 Lambda-Chunks (270, 270, 270, 270, 180). Die Chunk-Boundaries fallen bei Frame 270, 540, 810, 1080. Wenn ein Crossfade (12 Frames) zufällig nahe einer Boundary liegt (z.B. Übergang bei Frame 540), **muss ein einzelner Chunk Audio-Samples für genau diese Boundary stitching** — jeder Chunk rendert sein eigenes Audio-Segment, am Ende werden sie via ffmpeg concat gemerged. Die concat-Operation ist sample-akkurat, aber wenn ein Chunk das VO an Position X.XXX5s endet und der nächste bei X.XXX5s beginnt, gibt es einen **1-sample-Glitch** (~0.02ms) — bei manchen Übergängen hörbar als kleines Knacken/Stottern.

### Ursache 3 — `audioCodec: 'aac'` + variable Bitrate

AAC-Encoder bei Lambda nutzen standardmäßig VBR. An Chunk-Grenzen kann VBR-AAC kleine Diskontinuitäten erzeugen. PCM-WAV als Zwischenformat wäre stabiler, aber ist nicht direkt verfügbar.

## Plan — Drei gezielte Fixes

### Fix 1 — `pauseWhenBuffering` umkehren auf den Video-Elementen
In `src/remotion/templates/ComposedAdVideo.tsx`:
```tsx
<OffthreadVideo
  src={videoUrl}
  ...
  pauseWhenBuffering={true}  // war false → true
  delayRenderTimeoutInMilliseconds={30000}
/>
```
Bei `OffthreadVideo` ist `pauseWhenBuffering={true}` der **richtige** Default für Lambda-Renders. `false` ist nur für Live-Preview sinnvoll. Im Lambda-Renderer **wartet** der Worker dann bis der Frame bereit ist (statt einen leeren zu liefern) — das eliminiert den Decoder-Hiccup während des Overlaps.

### Fix 2 — `framesPerLambda` an Komposition anpassen
In `supabase/functions/compose-video-assemble/index.ts` Z. 269:
```ts
// Sicherstellen, dass Chunk-Boundaries möglichst NICHT in Crossfade-Fenster fallen.
// Statt fixe 270 dynamisch wählen: Vielfaches von (Szenen-Frames + Transition).
const avgSceneFrames = Math.ceil(durationInFrames / Math.max(1, remotionScenes.length));
const framesPerLambda = Math.max(150, Math.min(450, avgSceneFrames));
```
Das sorgt dafür, dass jede Lambda-Instanz **eine ganze Szene plus deren Transition** rendert → der kritische Audio-Mux passiert nur an Szenen-Enden, nicht mitten in Crossfades.

### Fix 3 — Audio-Track als Top-Level mit explizitem `startFrom={0}` + Pre-Roll
In `ComposedAdVideo.tsx`:
```tsx
<Audio
  src={voiceoverUrl as string}
  volume={1}
  pauseWhenBuffering={true}  // war false
  toneFrequency={1}
  playbackRate={1}
  startFrom={0}
  endAt={durationInFrames}
/>
```
`pauseWhenBuffering={true}` auf dem `<Audio>` sorgt dafür, dass das VO an Chunk-Grenzen sample-akkurat fortgesetzt wird (Remotion buffert intern statt Samples zu droppen). Plus explizites `startFrom`/`endAt` verhindert, dass jeder Chunk seine eigene Audio-Position berechnet — der Renderer nutzt eine **einheitliche** Sample-Position-Map über alle Chunks.

## Geänderte Dateien

- `src/remotion/templates/ComposedAdVideo.tsx` — `pauseWhenBuffering={true}` auf `OffthreadVideo` UND beiden `<Audio>`-Komponenten, `startFrom`/`endAt` auf Audio
- `supabase/functions/compose-video-assemble/index.ts` — `framesPerLambda` dynamisch an Szenen-Länge angepasst
- `mem://infrastructure/aws-lambda/rendering-concurrency-stability-policy` — Policy-Notiz: dynamisches `framesPerLambda` für Composer-Renders

## Warum diesmal das Rest-Problem trifft

Die vorherigen Fixes haben die **großen** Wiederholungen (Cache-Bug) gelöst. Was übrig blieb, sind **mikroskopische Sample-Diskontinuitäten** an Lambda-Chunk-Grenzen, verstärkt durch `pauseWhenBuffering={false}` (Decoder-Hiccup). Mit `pauseWhenBuffering={true}` + szenen-aligned Chunks wird das VO sample-akkurat über alle Chunks gestitched.

## Verify

1. 7-Szenen-Projekt mit `speed=1.2` rendern → VO durchgehend sauber, **kein** Knacken/Stottern mehr an Übergängen
2. Render-Logs prüfen: `framesPerLambda` Wert in Logs ≈ Szenen-Länge in Frames
3. Crossfades visuell weiterhin smooth
4. Render-Zeit: leicht länger (~10-15%) durch szenen-aligned Chunking — akzeptabel für Audio-Stabilität

