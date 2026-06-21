## v164 — "Silent-Faces Overlay" (Plate-Mouth-Mute für Nicht-Sprecher)

### Was wirklich passiert

Pass 3 dispatcht korrekt:
- Preclip-Crop x=676 ⇒ Kailee
- BBox-JSON [264,247,454,452] ⇒ Kailees Mund im 720×720-Frame
- Overlay im Final-Mux pastet Pass 3 wieder bei x=676 ⇒ Kailee

Du siehst trotzdem Samuels Mund sich bewegen, weil `render-sync-segments-audio-mux` nur die **aktive** Sprecher-Region per Preclip überklebt. Unter dem Overlay läuft der originale AI-Plate weiter — und in dem Plate haben *alle vier* Gesichter eine natürliche Mund-Animation. Während Kailees Audio läuft, sieht man Samuel/Matthew/Sarah aus dem AI-Plate weiter "reden". Das interpretierst du (zurecht) als "falsche Person spricht Pass 3".

### Lösung: stumme Standbild-Patches für alle Nicht-Sprecher

Während jedes Sprecher-Turn-Fensters legen wir auf jedes *andere* Gesicht ein eingefrorenes Standbild-Patch, sodass nur der aktive Sprecher (Preclip-Overlay) sich bewegt.

### Technische Schritte

1. **Neues Shared-Modul `_shared/plate-silent-frames.ts`**
   - `extractSilentFaceFrames(plateUrl, plateIdentity)`
   - Liest 1 Frame ~0.2s aus `plate` (ffmpeg via Replicate oder `image-resizer`-EdgeFn — bevorzugt: Browser-Canvas-Extraktion wie `continuity-guardian-frame-extraction`, aber serverseitig via existing `face-frame-extract`).
   - Pro Speaker-Slot croppt es eine quadratische Region um `bbox` (gleicher Algorithmus wie `pass-face-preclip.ts` für Crop-Geometrie, **kein Lambda-Render**, nur PNG-Crop) und lädt sie in den `lipsync-plates`-Bucket hoch: `shared/<sceneId>/silent-slot-<idx>.png`.
   - Cache: in `dialog_shots.plate_identity.silentFrames[]` persistieren `{ slot, url, crop:{x,y,size} }`.

2. **Aufruf in `compose-dialog-segments` direkt nach plate-identity-Hydration** (≈ Z. 1500–1525, hinter `v158_plate_hydration`-Log)
   - Bei `speakers.length >= 2` UND fehlendem `silentFrames` → Extraktion einmal pro Szene, persistieren.
   - Fail-open: schlägt es fehl, läuft v163 wie bisher (alter Look).

3. **`render-sync-segments-audio-mux` — neuer Layer `silentFaceOverlays`** (Z. ~224 fanoutShots-Erzeugung)
   - Für jede Pass-Window `[startSec..endSec]` zusätzlich pro **anderem** Slot einen Shot bauen:
     ```
     { startSec, endSec, imageUrl: silentFrames[otherSlot].url, crop: silentFrames[otherSlot].crop, layer: 'silent' }
     ```
   - Diese Layer rendern *unter* dem Preclip-Overlay, aber *über* dem Master-Plate.
   - Wenn `silentFrames` fehlt → Layer überspringen (keine Regression).

4. **Remotion-Composition `DialogStitchVideo` erweitern**
   - Neuer Shot-Typ mit `imageUrl` statt `outputUrl`: rendert ein statisches `<Img>` mit `style={{ position:'absolute', left:crop.x, top:crop.y, width:crop.size, height:crop.size }}` für die Window-Dauer.
   - Z-Reihenfolge: `plate < silentFaceOverlays < activeSpeakerOverlay`.

5. **Versions-Bump & Logs**
   - `COMPOSE_DIALOG_SEGMENTS_VERSION = "v164"`.
   - Neuer Log: `v164_silent_frames extracted=4/4 cached=true` und im Mux: `v164_silent_layer slots_painted=[0,1,3] active=2`.

6. **Szene-Reset**: `becaa5ce-e4c3-47b7-933d-766e83807b9c` zurücksetzen (`lip_sync_status`, `dialog_shots`, `twoshot_stage`, `clip_error`) — KEINE Änderung an `plate_identity` Cache, damit die Mouth-/BBox-Hydration sofort verfügbar ist und nur die 4 silent-frames neu extrahiert werden müssen.

7. **Deploy**: `compose-dialog-segments` + `render-sync-segments-audio-mux` + ggf. Remotion-Bundle neu deployen.

### Akzeptanzkriterien

- Logs zeigen `v164_silent_frames extracted=4/4` und für jeden Pass `v164_silent_layer slots_painted=[…3 andere…]`.
- Im finalen MP4 bewegt sich während Kailees Audio nur Kailees Mund; Samuel/Matthew/Sarah stehen still (frozen face crops).
- Bei N=1-Szenen wird die Logik geskippt (kein "anderer" Slot).

### Was wir explizit **nicht** ändern

- Sync.so-Payload-Form (bleibt v163 bbox-url-pro mit `sync_mode:cut_off` und `auto_detect:false`).
- Preclip-Render/-Frame-Count-Logik (v163 bleibt unverändert).
- Plate-Identity-Resolver (Slot-Mapping bleibt korrekt — wurde durch DB verifiziert).
