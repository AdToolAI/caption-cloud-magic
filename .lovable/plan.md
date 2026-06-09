## Befund (Live-DB für Szene `ec22e048…`)

**Sync.so v3 wird tatsächlich für alle 4 Sprecher genutzt.** Das ist in `composer_scenes.dialog_shots.passes[*]` und in `syncso_dispatch_log.meta.payload_summary.model` eindeutig: alle 4 Passes haben `model: "sync-3"`, `sync_mode: "cut_off"`, `retry_variant: "coords-pro"`, und jeder Pass läuft auf seinem eigenen 512x512-Preclip-Crop (multi-face plate → per-face preclip).

| Pass | Speaker        | Coords    | Preclip x   | Voice-Window         | tight dur | Sync.so job-id | Status |
|------|----------------|-----------|-------------|----------------------|-----------|----------------|--------|
| 0    | Samuel         | 863,163   | x=734  s=258 | 0.00 – 2.23 s       | 2.31 s    | afb95162…      | done ✅ Mund bewegt sich |
| 1    | Matthew        | 560,140   | x=442  s=234 | 2.48 – 3.50 s       | 1.18 s    | dcffdc3a…      | done ✅ Mund bewegt sich |
| 2    | **Kailee**     | 301,170   | x=184  s=234 | 3.75 – 6.63 s       | 3.04 s    | 50389f23…      | done ⚠ Mund bleibt zu |
| 3    | **Sarah**      | 1149,177  | x=1020 s=258 | 6.88 – 8.69 s       | 1.97 s    | 2d2fa6a2…      | done ⚠ Mund bleibt zu |

Beobachtung: genau die beiden Sprecher an den **Bildrändern** (Kailee links: preclip-x=184, Sarah rechts: preclip-x=1020 bei video_width=1376) bekommen keinen Lipsync, während die beiden mittigen Sprecher korrekt animiert werden. Audio-Gate (`audio_diagnostics`) ist für beide grün (voiced 1.48 s / 2.28 s), die Sync.so-Jobs sind „COMPLETED", `output_url` existiert. D. h. Sync.so liefert ein Ergebnis, aber das gelieferte Crop-Video zeigt einen geschlossenen Mund.

## Wahrscheinliche Ursache

Per-Face-Preclip (`pass-face-preclip.ts`) schneidet ein quadratisches 512x512-Sprecherfeld aus dem 1376×768-Plate. Für die Randsprecher landet das Crop-Rechteck am Bildrand (Kailee x=184…418, Sarah x=1020…1278). Sync.so v3 mit `auto_detect:true` auf einer 512x512-Plate sucht **eine** Face — wenn die Face am Rand des 512er-Crops sitzt oder durch das Quadrat-Padding (Hintergrund) verdünnt ist, fällt die Active-Speaker-Detection auf „kein Sprecher" zurück und Sync.so animiert nichts → der Output ist Pixel-identisch zum Eingangs-Preclip. Im Mux wird dann dieser unbewegte Crop wieder in die Master-Plate eingesetzt — geschlossener Mund.

Beweisstütze in den Logs:
- `preclip_face_count: null` bei allen Passes → Face-Quality-Gate wurde nicht ausgeführt
- `retry_variant: "coords-pro"` schon im 1. Anlauf — aber im Preclip-Modus (siehe `compose-dialog-segments` Z. 2108–2111) wird trotzdem `auto_detect:true` auf das 512x512-Crop gesendet, weil dort „nur eine Face" angenommen wird. Bei Randspeakern stimmt diese Annahme aber nicht zuverlässig.

## Plan

### 1. Beweis sichern (schnell, kein Render-Spend)

- `output_url` von Pass 2 (Kailee) und Pass 3 (Sarah) per `ffprobe` / Frame-Diff gegen das Preclip prüfen.
  - Erwartung: SSIM ≈ 1.0 → Sync.so hat tatsächlich nicht animiert.
- `preclip_url` Bounding-Box prüfen: liegt die Face vollständig im 512x512-Quadrat?
- Aus den Sync.so-Job-Results das Feld `active_speaker_detected` / `face_count` lesen (steht im Webhook-Payload).

### 2. Preclip-Fix für Rand-Sprecher

Datei: `supabase/functions/_shared/pass-face-preclip.ts`

- Crop-Center auf die echten Face-Koordinaten zwingen, nicht auf das Plate-Center clampen.
- Padding nach außen NICHT mit Schwarz/Background füllen, sondern mit gemirrortem Plate-Inhalt **oder** den Crop verkleinern, damit die Face zentriert im 512x512 sitzt (mit `letterbox-extend` statt clamp).
- Output mit `preclip_face_count` befüllen (face-detect lokal vor Sync.so-Aufruf). Wenn `face_count !== 1` → sofort `retry_variant = "bbox-url-pro"` auf der **vollen Plate** mit `bounding_boxes_url`, statt blind `coords-pro` auf einem schlechten Crop.

### 3. Retry-Ladder für „mute pass" einbauen

Datei: `supabase/functions/compose-dialog-segments/index.ts`

- Nach Sync.so-Webhook-Completion ein **Lip-Motion-Gate** im Pass: per ffmpeg `cropdetect`+`scenechange` oder einfache Mund-Pixel-Diff zwischen Frame 0 und Frame mid_voice prüfen.
- Wenn Bewegung unter Schwelle → Pass als `silent_lipsync` markieren und automatisch eine Retry-Stufe höherschalten (`coords-pro` → `bbox-url-pro` → `coords-pro-lp2pro`).
- Aktuell springt die Retry-Ladder nur bei harten Provider-Fehlern an, nicht bei einer „leeren" Animation. Diese Lücke ist der eigentliche Bug.

### 4. Mux-Fallback härten

Datei: `supabase/functions/render-sync-segments-audio-mux/index.ts`

- Falls für einen Sprecher das Lip-Motion-Gate fehlschlägt UND keine Retry-Stufe mehr Geld kosten soll: Overlay für diesen Sprecher in seiner Window weglassen und stattdessen das pristine Plate zeigen — verhindert Optik „toter Mund während Audio läuft" und reduziert User-Verwirrung.

### 5. Rescue für die aktuell betroffene Szene

- Pass 2 + Pass 3 gezielt mit `retry_variant=bbox-url-pro` auf der vollen Plate neu dispatchen (kein neuer Multipass-Run, nur die beiden Sprecher).
- Danach `render-sync-segments-audio-mux` erneut anstoßen, gleiche `final_url` überschreiben.
- Keine doppelten Credit-Belastungen: idempotent über `passes[idx].retry_count`.

### 6. Validierung

- Neuer Pass 2/3 muss `lip_motion_ratio > 0.15` haben (neuer Metrik-Wert in `passes[*]`).
- Visueller Vergleich der neuen `final_url`: alle 4 Sprecher öffnen Mund in ihrem Voice-Window.
- Dispatch-Log zeigt sauberen Pfad `DISPATCH_ATTEMPT_STARTED → DISPATCHED → COMPLETED` mit `lip_motion_ok=true`.

## Technische Details (für Implementierung)

- Sync.so v3 Doku: `options.active_speaker_detection` darf entweder `auto_detect:true` ODER `coordinates: [x,y]` ODER `bounding_boxes_url` sein. Bei Randspeakern auf 16:9-Plates ist **`bounding_boxes_url` auf der vollen Plate** robuster als `auto_detect` auf einem 512x512-Crop.
- Lip-Motion-Gate kann via Remotion-`@remotion/media-utils.getVideoMetadata` + einfache YOLO-mouth-keypoint-Distanz im Webhook-Handler laufen (kein zusätzlicher Provider-Call).
- Keine Änderung an der Default-Engine: bleibt `sync-segments` mit Sync 3, nur die Preclip-Qualität und Retry-Auslöser werden gehärtet.
