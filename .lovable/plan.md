## v181 — N=1 Depicted-Face Lock

**Ziel:** Bei Single-Speaker-Szenen mit einem zweiten Gesicht im Bild (Handy-Display, Foto, Spiegel, Bildschirm, Hintergrund-Person) zwingt die ASD-Strategie Sync.so deterministisch auf das Gesicht des Cast-Sprechers. Kein Pfad mehr, auf dem Sync.so "freiwillig" das falsche Gesicht animiert.

### Änderungen (eng begrenzt)

**1. `supabase/functions/_shared/asd-strategy.ts` — Rule 4 erweitern**
- Neue Bedingung am Anfang von Rule 4 (N=1 + plate-native Box vorhanden):
  - Wenn `plateFaceCount >= 2` → strategy `single_face_bbox_strict`:
    - `active_speaker_detection: false`
    - `bounding_boxes: [<castSpeakerBox>]` (plate-native px-Koordinaten, single entry)
    - Telemetry-Tag `v181_n1_depicted_face_lock`
  - Sonst (plateFaceCount ≤ 1): bestehender `single_face_auto`-Pfad bleibt unverändert.
- Keine Änderung an Rule 0/1/2/3/5.

**2. `supabase/functions/compose-dialog-segments/index.ts` — plateFaceCount durchreichen**
- Aus dem bestehenden Plate-Identity-Map / Face-Detector-Ergebnis die Anzahl Gesichter lesen.
- An die `chooseAsdStrategy()`-Aufrufstelle als neuer Parameter `plateFaceCount` übergeben.
- Kein Verhalten ändern, wenn das Feld 0/1 ist.

**3. `_shared/asd-sync3-sanitizer.ts` — keine Änderung nötig**
- v124 entfernt bereits unzulässige Felder; `bounding_boxes` ist für sync-3 erlaubt.

**4. Telemetry**
- `console.log('[v181] n1_depicted_face_lock', { sceneId, plateFaceCount, castBox })` in `asd-strategy.ts`.
- In `dialog_shots.diagnostics` (falls vorhanden) das Tag `v181_n1_depicted_face_lock` persistieren.

**5. Tests**
- `asd-strategy.test.ts`: zwei neue Cases
  - N=1, plateFaceCount=2, castBox vorhanden → `single_face_bbox_strict`, kein `auto_detect: true`.
  - N=1, plateFaceCount=1 → unverändert `single_face_auto`.

### Was explizit NICHT angefasst wird

HappyHorse/Hailuo Plate-Generation, Anchor-Pipeline (v168/v170), Sync.so Webhook & Watchdog, Audio-Mux, Refund-Logik, Briefing→Storyboard-Mapping, Voice-Pool, Multi-Speaker-Pfade (Rule 2/3).

### Deploy & Verify

- Deploy: `compose-dialog-segments`, geteilt: `asd-strategy.ts` wird mit beiden compose-Functions neu gebündelt → auch `compose-video-clips` redeployen, falls es das Shared-Modul mitzieht.
- Verify: nächste N=1-Szene mit Handy/Foto im Bild rendern; Logs auf `v181_n1_depicted_face_lock` prüfen; Lip-Sync muss auf Cast-Gesicht sitzen.
- Memory: neues File `mem://architecture/lipsync/v181-n1-depicted-face-lock.md` + Index-Eintrag.
