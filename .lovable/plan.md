## Problem

Bei jedem Sprecher gibt es am Ende seines Turns einen sichtbaren "Animorph"-Effekt — die Mimik des lipsync-Gesichts gleitet sichtbar zurück in das ruhende Anchor-Gesicht.

## Ursache

Mit v72 (statisches Anchor-Bild als Master) + v73 (windowed Overlays) blendet `CroppedOverlay` in `DialogStitchVideo.tsx` an jedem Segment-Ende über 6 Frames (CROSSFADE_FRAMES) von **opacity 1 → 0** aus. Darunter liegt das **statische Anchor-Foto** mit geschlossenem Mund. Weil das Sync.so-Lipsync-Gesicht und das Anchor-Gesicht leicht andere Position, Skala und Expression haben, wirkt der 6-Frame-Opacity-Crossfade wie ein Morph zurück ins Standbild.

Vor v72 lag darunter das bewegte i2v-Video — die Bewegung kaschierte den Crossfade, deshalb war der Effekt vorher unsichtbar.

Zusätzlich: Sync.so erzeugt pro Pass ein Output, das (bei `sourceTiming='absolute'`) **bereits die volle Szenen-Länge hat** — wir blenden also unnötigerweise mitten in der Szene wieder aus, obwohl der Pass-Output über die gesamte Dauer ein sauberes Gesicht liefert.

## Plan (v74 — Hold-On-End Overlays, kein Morph mehr)

### 1. `render-sync-segments-audio-mux/index.ts`
Pro Pass nur **EINEN** Overlay-Shot emittieren statt mehrere windowed:

- **Non-tight (`audio_tight=false`, sourceTiming='absolute'):**
  Ein Shot `[0, totalSec]`. Der Pass-Output ist bereits voll-lang mit geschlossenem Mund außerhalb des Speaks → kein Morph möglich, keine Mid-Scene Fade-Outs mehr.

- **Tight (`audio_tight=true`, sourceTiming='relative'):**
  Ein Shot `[firstSegStart, totalSec]` (statt pro Speech-Segment). Der kurze Preclip läuft natürlich ab; danach friert Remotion `<Video>` auf dem **letzten Frame ein** (geschlossener Mund) und bleibt an der Crop-Position stehen bis Szenenende. Kein Crossfade-Übergang zurück zum Anchor → kein Morph.

- Fallback wie gehabt: Pass ohne Segments → ein Shot `[0, totalSec]`.

### 2. `src/remotion/templates/DialogStitchVideo.tsx`
`CroppedOverlay` (und analog `FaceMaskOverlay` / `FullFrameOverlay`) so anpassen, dass **kein Fade-Out am Sequence-Ende** mehr passiert, wenn der Shot bis `totalSec` läuft:

- Neue optionale Prop `holdToEnd: boolean`.
- Wenn `true`: nur Fade-In am Anfang, danach permanent `opacity = 1` — kein interpolierter Ausstieg.
- Wenn `false` (Legacy): bestehendes Verhalten beibehalten (Rückwärtskompatibilität für Single-Speaker / non-static-master Pfade).
- `holdToEnd` aus `render-sync-segments-audio-mux` setzen, wenn `endSec >= totalSec - 0.05`.

### 3. Single-Speaker / kein Anchor-Master
Verhalten **unverändert** lassen — dort ist der Master das i2v-Video, dort braucht es weiter den Fade-Out an den Original-Segment-Rändern, weil das Bild darunter natürlich weiterläuft.

### 4. Verifikation
- Edge-Log: `mode=fanout-N-speakers-static shots=N` (genau ein Shot pro Pass, nicht pro Segment).
- Render: jeder Sprecher bleibt nach seinem Turn ruhig im Frame, kein sichtbarer Übergang zurück zum Anchor.
- Audio-Sync und Lippenbewegung während des Turns unverändert.

### 5. Out of Scope
Sync.so-Pipeline, Refunds, Webhook, Preclip-Render, FaceMap, Frontend-Progress — alles unverändert. Reine Render-Composition-Änderung.

### Lambda-Bundle
Nach den Änderungen `bash scripts/deploy-remotion-bundle.sh` ausführen, sonst greift `holdToEnd` nicht im Lambda.
