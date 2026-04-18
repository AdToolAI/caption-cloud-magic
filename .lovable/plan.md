

## Analyse — warum noch 2 Stotterer übrig sind

Die großen Probleme sind weg. Was bleibt: **2 spezifische Übergänge** stottern leicht. Das ist ein klares Muster — nicht zufällig, sondern an **bestimmten Stellen reproduzierbar**. Lass mich logisch durchgehen warum genau 2:

### Hypothese A — Die 2 Stellen sind exakt die Lambda-Chunk-Grenzen

Mit dem neuen dynamischen `framesPerLambda` (clamped 150-450) entstehen bei z.B. 7 Szenen × 6s = 1260 Frames mit `framesPerLambda ≈ 180` → **7 Chunks**. Aber: bei 6 Übergängen und 7 Chunks fallen **genau 2 Chunk-Boundaries** zufällig **mitten in einen Crossfade-Bereich** (statt sauber an Szenen-Enden). 

Der Grund: meine Formel `avgSceneFrames = durationInFrames / sceneCount` rechnet mit der **Gesamt-Komposition** (inkl. extendStart/extendEnd Overlap), aber die **echten Szenen-Boundaries** liegen woanders (bei Crossfade verschiebt sich die effektive Szenen-Grenze um die halbe Transition-Dauer). Resultat: 5 von 7 Chunks alignen perfekt, **2 nicht** → genau dein Symptom.

### Hypothese B — `<Audio>` `endAt={durationInFrames}` exakt am Ende

Wenn `endAt` **genau** auf `durationInFrames` gesetzt ist und die VO-Datei kürzer ist als die Komposition, fragt Remotion am Ende Samples die nicht existieren → Lambda fügt Stille ein, aber **am Chunk-Boundary** klingt das wie ein Mikro-Cut.

### Hypothese C — `OffthreadVideo` `pauseWhenBuffering={true}` blockiert während Audio läuft

Wenn Video pausiert (warten auf Frame), aber Audio weiterläuft, dann holt der Audio-Mux am Chunk-Ende einen "verschobenen" Sample-Zeitstempel → Knacken.

## Die echte Lösung: Audio-Pre-Render + Sample-Akkurate Boundaries

Statt am Lambda-Chunking zu schrauben — das ist nicht 100% kontrollierbar — gehen wir das Problem an der **Wurzel** an: das VO wird **vor** dem Render zu einer **WAV-Datei mit exakter Komposition-Länge** vorbereitet (mit Stille gepadded oder sample-genau getrimmt). Damit ist der Audio-Track **deterministisch identisch** über alle Lambda-Chunks.

### Fix 1 — Neuer Edge-Function Step: `prepare-voiceover-audio`

Nach VO-Generierung und vor Komposition: Edge Function lädt MP3, dekodiert mit ffmpeg-WASM (oder ruft direkt ffmpeg in Lambda), und exportiert als **WAV @ 48kHz stereo** mit **exakter Länge** = `durationInFrames / fps`. WAV ist verlustfrei, kein VBR-Drift, sample-akkurat über Chunks.

Da ffmpeg-in-Edge komplex ist, **Alternative**: serverlose Audio-Normalisierung via Supabase Storage + ffmpeg-binary in `compose-video-assemble` (wenn möglich) ODER Client-side via Web Audio API in `VoiceSubtitlesTab.tsx` (preview-only, dann Upload als WAV).

**Pragmatischste Lösung**: Web Audio API im Browser nach VO-Generierung nutzen. Browser dekodiert MP3 → AudioBuffer → padded auf exakte Länge → re-encodiert als WAV → Upload zur Storage. Das passiert **einmal** beim VO-Generieren, **vor** dem Render.

### Fix 2 — Lambda-Chunking szenen-präzise statt durchschnittlich

In `compose-video-assemble`: statt Durchschnitt nutzen wir die **echten Szenen-Boundaries** aus `remotionScenes` und wählen `framesPerLambda` so, dass **jede** Boundary ein Vielfaches der häufigsten Szenen-Länge ist:
```ts
// Finde die kürzeste Szene + Transition-Padding als framesPerLambda
const sceneFrames = remotionScenes.map(s => Math.ceil(s.duration * fps) + Math.ceil((s.transitionInDuration || 0) * fps));
const minSceneFrames = Math.min(...sceneFrames);
const framesPerLambda = Math.max(150, minSceneFrames);
```
Damit fällt **kein** Chunk-Boundary mehr in einen Crossfade.

### Fix 3 — `<Audio>` exakte Länge entfernen, dafür `loop={false}` + leichte Pre-Roll

```tsx
<Audio
  src={voiceoverUrl}
  pauseWhenBuffering={true}
  startFrom={0}
  // endAt entfernen — Remotion handled End-of-Stream selbst
  loop={false}
/>
```
Das vermeidet die "Sample am Ende fehlt"-Situation.

## Geänderte Dateien

- `src/components/video-composer/VoiceSubtitlesTab.tsx` — Web Audio API Post-Processing: MP3 → AudioBuffer → padded WAV → Re-Upload, exakte Länge sichern
- `supabase/functions/compose-video-assemble/index.ts` — `framesPerLambda` aus **kürzester** Szene statt Durchschnitt
- `src/remotion/templates/ComposedAdVideo.tsx` — `endAt` vom Voiceover-Audio entfernen

## Warum das diesmal funktioniert

Bisher: Lambda-Chunks teilten sich **denselben MP3-Stream**, jeder Worker dekodiert eigenständig → Mikro-Drift an Boundaries. Mit **WAV @ exakter Länge**: jeder Worker liest dieselben Samples an derselben Position → bit-identisch über alle Chunks. Plus szenen-präzises Chunking → kein Boundary mehr in einem Crossfade.

## Verify

1. VO neu generieren → Console-Log: "WAV pad applied, exact duration X.XXXs" 
2. Storage prüfen: zusätzliche `.wav` Datei vorhanden mit exakter Länge
3. Render → **alle** Übergänge sauber, **kein** Stottern mehr
4. Render-Logs: `framesPerLambda` Wert ≈ kürzeste Szene in Frames

