## Befund

Das Lip-Sync selbst läuft jetzt korrekt: alle 4 Passes erzeugen saubere Single-Face-Preclips, Sync.so liefert pro Sprecher das richtige animierte Gesicht. Die Audio-Mux-Lambda overlayt jeweils per `crop` an den richtigen Plate-Koordinaten (x=124/366/592/830, size=422 auf 1280×720).

Sichtbares Problem in der finalen Datei:

- Die **Master-Plate** (Hailuo i2v Output, `source_clip_url`) bleibt nicht stabil. Sie startet mit allen 4 Charakteren in Reihe und wechselt mitten in der Szene auf eine Einzelperson-Einstellung.
- Unsere Overlay-Logik blendet jeden Preclip nur **während des eigenen Voice-Turns** ein (`startSec/endSec = segment ± 0.08s`). Wenn die Plate auf eine Einzelperson schneidet, sind Sprecher 3/4 weder in der Plate noch in einem aktiven Overlay zu sehen — daher „nur die ersten zwei Sprecher sichtbar".
- Sprecher 1/2 sind sichtbar, weil ihre Turns vor dem Plate-Schnitt liegen.

Root Cause: Hailuo i2v garantiert keine Kamerakonstanz über 9s mit 4 statischen Charakteren — wir behandeln das i2v-Ergebnis fälschlicherweise als verlässlichen 4-Face-Hintergrund.

## Plan (v72)

### 1. Master = Static Anchor Image (Dialog-Szenen, N≥2)

In `render-sync-segments-audio-mux`:

- Für Szenen mit `donePasses.length >= 2` (Multi-Speaker-Fan-Out) zusätzlich `scene.lock_reference_url || scene.reference_image_url` lesen.
- Wenn vorhanden, neuen Payload-Eintrag `masterImageUrl` an den Lambda-Job mitgeben (statt/zusätzlich zu `masterVideoUrl`).
- Bei N=1 bleibt der bisherige Pfad (Video-Master + Single-Tight-Overlay) unverändert.

In `DialogStitchVideo.tsx`:

- Schema um optionales `masterImageUrl?: string` erweitern.
- Wenn gesetzt, statt `<Video src={masterVideoUrl} />` ein `<Img src={masterImageUrl}>` für die volle Composition-Dauer rendern (Standbild, kein Audio).
- Fallback: `masterImageUrl` fehlt → bisheriger Video-Pfad.

### 2. Always-On Preclip-Overlays (multi-speaker)

Im Multi-Speaker-Fan-Out-Branch von `render-sync-segments-audio-mux`:

- Pro Pass nur **einen** Shot über die volle Szenendauer emittieren (`startSec: 0`, `endSec: totalSec`) anstatt pro Segment fenstern.
- `sourceTiming` bleibt für Tight-Passes `relative` (Sync.so-Output ist nur Sprech-Dauer lang).
- Da Sync.so bei Stille im Audio (Pass-Audio = nur dieser Sprecher mit Stille drumherum) das Gesicht im Ruhezustand zeigt, bleibt jeder Speaker permanent im Frame ohne Mouth-Movement außerhalb des eigenen Turns. → Effekt: alle 4 Köpfe permanent sichtbar, animiert ausschließlich während des jeweiligen Sprech-Turns.

Wichtig: Für `audio_tight` Passes ist der Sync.so-Output kürzer als `totalSec`. In dem Fall:

- Pre-Roll: vor `tightStartOnTimeline` wird der **letzte Frame** des Preclips (oder ein parallel hinterlegtes statisches Crop-Frame der Anchor-Komposition) gezeigt.
- Post-Roll: nach `tightEndOnTimeline` analog.
- Pragmatischer Erstwurf: solange Tight-Output kürzer ist, simpel `loop` oder Standbild des Anchor-Crops einsetzen. Implementierung:
  - In `DialogStitchVideo` `CroppedOverlay` um `tightWindow: { startSec, endSec }` erweitern → außerhalb des Fensters statisches Crop des `masterImageUrl` an derselben (x, y, size) Region anzeigen, im Fenster den Sync.so-Preclip abspielen.

### 3. v68/v69-Logik unangetastet

- `compose-dialog-segments` Preclip-Render-Pfad, FaceMap, Tight-Audio, Refunds, Self-Retry: keine Änderung.
- 1-Sprecher-Pfad: unverändert.
- `sync-so-webhook`: unverändert.

### 4. Aktuelle Szene neu rendern

Nach Deployment:

- Szene `12ea3e1b-d376-418f-b3e9-96f73e7007e4`: `dialog_shots.audio_mux` löschen + `dialog_shots.status='audio_muxing'`/`lip_sync_status='audio_muxing'` wieder anstoßen, sodass `render-sync-segments-audio-mux` mit v72-Logik erneut dispatcht. Bestehende Sync.so-Outputs der 4 Passes werden wiederverwendet — kein neuer Sync.so-Spend.

### 5. Verifikation

- Finales Video zeigt durchgehend alle 4 Köpfe (statisches Anchor-Image als Master).
- Während Sprecher k spricht, animiert nur sein Crop-Overlay; die anderen 3 bleiben als statisches Bild stehen.
- Edge-Log `render-sync-segments-audio-mux` zeigt `mode=fanout-4-speakers master=image:<lock_reference_url>` und `shots=4` (statt `shots=N_segments`).

## Nicht ändern

- Kein neuer Hailuo i2v-Render-Pfad.
- Keine Änderung am Sync.so-Dispatch, Tight-Slice, Refund.
- 1-Sprecher- und Single-Tight-Overlay-Pfad bleiben video-basiert.

## Geänderte Dateien (geplant)

- `supabase/functions/render-sync-segments-audio-mux/index.ts`
- `src/remotion/templates/DialogStitchVideo.tsx`
- (SQL one-shot) Reaktivierung der betroffenen Szene
