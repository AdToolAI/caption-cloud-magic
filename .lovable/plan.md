
## Kontext (Slice 1 ist grün)

- `src/lib/composer/computeMouthCenteredCrop.ts` + 12 Unit-Tests ✅ (12/12 grün, verifiziert).
- `_shared/face-detect-mediapipe.ts` liest bereits AWS Rekognition-Landmarks (`mouthLeft/Right/Up/Down`) und leitet `mouth` = Corner-Midpoint ab ✅.
- Migration hat `face_share_in_preclip`, `mouth_center_offset_px`, `noop_mouth_yavg`, `detector_used`, `retry_count` auf `syncso_dispatch_log` ✅.
- Preclip-Generator = `_shared/pass-face-preclip.ts` → nutzt heute `computeFaceCrop(coords, bbox, …)` (face-bbox-center, KEINE Mouth-Anchor).
- Webhook = `sync-so-webhook/index.ts` hat bereits eine `noopSuspect`-Ladder (Zeilen 604–740) mit `NOOP_LADDER` — dort dockt YAVG als zusätzliches Signal an, **ohne** die bestehende Ladder umzubauen.

## Ziel Slice 2

Mouth-Anchor-Crop live schalten und Post-Dispatch-Beweis erbringen (YAVG < 2.0 = Sync.so no-op). Nichts an der v242 Assignment-Lock- oder v246 Cast-Union-Logik anfassen.

## Änderungen (klein, additiv)

### 1. Neuer Shared-Helper für Deno
`supabase/functions/_shared/compute-mouth-centered-crop.ts` — 1:1-Deno-Port der Node-Utility (pure fn, keine Imports). Getrennte Datei, damit `src/lib` weiter im Client-Bundle bleibt und die Edge-Function-Bundler keine `src/`-Pfade auflösen müssen.

### 2. `pass-face-preclip.ts` erweitern
- Neuer optionaler Input: `mouth?: [number, number]`, `faceBbox?: [number,number,number,number]`.
- Wenn `mouth` gesetzt → `computeMouthCenteredCrop({face:{bbox, center: coords, mouth}, plateWidth: sW, plateHeight: sH, targetFaceShare: 0.42, outputSize: nativeOut})` verwenden.
- Fallback: bestehender `computeFaceCrop`-Pfad bleibt unverändert (kein Regression-Risk, wenn Landmarks fehlen).
- Rückgabe zusätzlich: `faceShareInCrop`, `mouthOffsetPx`, `anchor`, `clamped` (weiterreichen zum Caller).

### 3. `compose-dialog-segments/index.ts` — 2 Call-Sites
An beiden `renderPassFacePreclip(...)`-Aufrufen (Zeilen ~4232 und ~4951) den Mouth-Landmark aus `matchedFace.mouth`/`landmarks.mouth` mitgeben (kommt bereits aus `face-detect-mediapipe.ts`). Ergebnisfelder auf `pass` mitschreiben: `preclip_face_share`, `preclip_mouth_offset_px`, `preclip_anchor`.
Log-Marker: `v247_mouth_anchor_preclip`.

### 4. `syncso_dispatch_log`-Insert erweitern
Beim Dispatch (bereits vorhandener Insert im gleichen Modul) `face_share_in_preclip`, `mouth_center_offset_px`, `detector_used` mitschreiben. Keine neuen Inserts, nur Felder erweitern.

### 5. YAVG-Probe in `sync-so-webhook/index.ts`
- Neuer Helper `probeMouthBandYavg(outputUrl, cropRegion)` — ruft `chigozienri/ffmpeg-extract-frame` via Replicate für 3 Frames (25% / 50% / 75% der Dauer), rechnet auf einer 20%-hohen Mund-Band-ROI die Y-Varianz, gibt `delta = max(YAVG) − min(YAVG)` zurück. Timeouts: `withTimeout` 25s, best-effort.
- Nur laufen wenn: `status==="COMPLETED"` **und** Pass hat `preclip_crop` **und** noch nicht durch die vorhandene `syncOutputUnchanged`-Detection als NOOP erkannt.
- `delta < 2.0` → `noopSuspect = true` mit `noopReason = "yavg_below_threshold"`. Läuft danach durch die **bestehende** NOOP-Ladder — kein Fork, kein neuer State.
- Wert wird in `syncso_dispatch_log.noop_mouth_yavg` geschrieben (Observability, auch bei Erfolg).

### 6. Refund-Anschluss
Kein neuer Refund-Pfad. Die vorhandene `sync_noop_unrecoverable`-Route (webhook Zeile ~724) übernimmt automatisch die Rückerstattung über den bestehenden Credit-Refund-Automation-Weg (siehe `mem://architecture/failure-credit-refund-automation`).

## Nicht-Ziele Slice 2

- Kein Admin-Cockpit-Dashboard (`/admin/lipsync-health`) — kommt in Slice 3.
- Kein Auto-Retry-Ladder-Umbau — nutzt bestehende `NOOP_LADDER`.
- Kein Kling/Hailuo-spezifisches Verhalten.

## Verifikation

- Unit-Tests bleiben 12/12 grün.
- Neuer Deno-Test `supabase/functions/_shared/compute-mouth-centered-crop.test.ts` (2 Sanity-Cases) via `supabase--test_edge_functions`.
- Manueller Re-Render der Referenz-Szene aus dem letzten Ticket → erwartet: `preclip_anchor=mouth`, `face_share_in_preclip ≥ 0.35`, Sync.so animiert alle 4 Sprecher.
- Log-Grep: `v247_mouth_anchor_preclip` muss in `edge_function_logs` erscheinen.

## Technische Details

```text
Frame → face-detect (AWS primary, MediaPipe fallback)
      → landmarks {bbox, center, mouth}
      → renderPassFacePreclip(mouth) → computeMouthCenteredCrop
      → preclip_url + preclip_crop{x,y,size,outputSize=720}
      → dispatch Sync.so (auto_detect:true, single face)
      → webhook COMPLETED → probeMouthBandYavg
        - delta ≥ 2.0 → OK
        - delta < 2.0 → NOOP-ladder (bestehend) → retry oder refund
```

Nach Approval baue ich Punkte 1–6 in **einem** Build-Turn.
