# Plan v250 — Frame-Extractor Reaktivierung für v249 Lip-Sync

## Ehrliche Antwort vorab
Nein — die Pipeline läuft nach v249 **noch nicht garantiert** durch mit Lip-Sync. v249 hat zwei Dinge erledigt:

1. Metriken (`face_share_in_preclip`, `mouth_center_offset_px`, `detector_used`) werden jetzt in `syncso_dispatch_log` persistiert.
2. Der Escalation-Ladder in `report-lipsync-motion-probe` reagiert face-share-aware.

**Aber**: Der server-seitige Frame-Extractor in `supabase/functions/_shared/face-frame-extract.ts` ist noch gestubbt (Client-Canvas-Fallback). Das heißt:

- Beim Dispatch kommt kein JPEG an Rekognition an → `FACE_GATE_PROBE_UNAVAILABLE`.
- Rekognition-Landmarks werden nur ausgewertet, wenn der Client rechtzeitig einen Frame nachliefert.
- Bei kurzen Szenen oder wenn der Client keinen Frame-Probe schickt, bleibt der neue face-share-Ladder blind und wir fallen auf den alten Pfad zurück (kein Lip-Sync bei kleinen Gesichtern).

Solange dieser Gap besteht, funktioniert v249 nur in einem Teil der Szenen zuverlässig. Deshalb dieser Plan.

## Ziel
Frame-Extractor server-seitig aktivieren, damit Face-Gate + v247 Mouth-Anchored-Zoom + v249 Metrik-Ladder in **jeder** Szene greifen — unabhängig vom Client.

## Umfang

### 1. Server-side Frame-Extractor
`supabase/functions/_shared/face-frame-extract.ts`:
- Stub entfernen, echten Extractor implementieren.
- Ansatz: Replicate `ffmpeg` still-frame route (mittlere Zeitstempel-Extraktion, JPEG-Bytes, ≤ 1280px lange Kante).
- Fallback: signed URL zum Anchor-Frame, falls Video-still fehlschlägt.
- Timeout hart auf 8s begrenzen, damit Dispatch nicht blockiert.

### 2. Face-Gate Verdrahtung
`supabase/functions/_shared/plate-face-detect.ts`:
- Beim Dispatch: `face-frame-extract` aufrufen → JPEG → Rekognition `DetectFaces`.
- Mouth-Landmarks + BoundingBox in `syncso_dispatch_log` schreiben (`detector_used = 'rekognition-server'`).
- Bei Extract-Fail: sauber auf `FACE_GATE_PROBE_UNAVAILABLE` fallen (keine falschen Positives, kein Log-Spam).

### 3. Escalation-Ladder scharfschalten
`supabase/functions/report-lipsync-motion-probe/index.ts`:
- Sicherstellen, dass bei `face_share < 0.30` UND `detector_used = 'rekognition-server'` der Re-Dispatch mit `mouth-anchored-zoom` sofort feuert (nicht erst nach Client-Probe).
- Refund-Pfad bleibt bei `yavg < 4.0` nach 2. Anlauf.

### 4. Observability
- `syncso_dispatch_log`-Query zum Verifizieren: nach 5 Test-Szenen sollten ≥ 90 % `detector_used = 'rekognition-server'` haben und `face_share_in_preclip` NICHT NULL sein.
- Version bump: `v250-server-frame-extract-live`.

## Explizit NICHT im Umfang
- Keine Änderungen am Rekognition-SigV4-Client (bereits korrekt, v249 auditiert).
- Kein Umbau des Preclip-Renderers.
- Keine Prompt- oder Cast-Union-Änderungen.

## Verifikation
1. Testszene mit 2 Sprechern, kleines Gesicht (< 30 % face-share) rendern.
2. Log prüfen: `detector_used`, `face_share_in_preclip`, `mouth_center_offset_px` müssen gesetzt sein.
3. Bei kleinem Gesicht: Re-Dispatch mit `mouth-anchored-zoom` muss automatisch triggern.
4. Lip-Sync im finalen Clip visuell prüfen.

## Technische Details
- Replicate-Modell für Still-Extract: `fofr/video-to-frames` oder Lambda-Route falls schon verdrahtet.
- JPEG-Quality 85, max 1280px, mittlerer Zeitstempel des Preclips.
- Rekognition-Region primary `eu-central-1`, Fallback `us-east-1` (bereits konfiguriert).

Nach Umsetzung sollte die Pipeline zuverlässig durchlaufen und Lip-Sync auch bei kleinen/entfernten Gesichtern generieren.