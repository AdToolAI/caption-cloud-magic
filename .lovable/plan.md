# Plan: Sync.so Face-Gate ohne lucataco/Replicate

## Umgesetzt

- `supabase/functions/_shared/face-frame-extract.ts`
  - Replicate/lucataco-Frame-Extraction vollständig entfernt.
  - Server-Pfad prüft nur noch bereits vorhandene Client-Canvas Frames im `composer-frames` Bucket.
  - Wenn kein Frame vorhanden ist: deterministisch `server_extract_disabled_use_client_canvas`.

- `supabase/functions/_shared/syncso-face-gate.ts`
  - Video-Fallback entfernt, damit ein MP4/Gemini-Hinweis nie mehr als harter `no_face`-Blocker zählt.
  - Harte Blocks (`no_face`, `not_at_coord`, `multiple_faces`) entstehen nur noch nach echter Still-Image-Prüfung.
  - Ohne Client-Canvas/Cache-Frame wird sauber `probe_unavailable` zurückgegeben und Dispatch läuft weiter.
  - Preclip-validierte Runs werden im Grund als `source=preclip-validated` geloggt.

- `supabase/functions/compose-dialog-segments/index.ts`
  - Übergibt `preclipTrusted` an den Face-Gate, wenn `preclip_face_count === 1` und die Preclip-Ambiguity `risk === "clean"` ist.
  - Logs auf `v129.23.2_face_gate` angehoben, inklusive `preclip_trusted=true/false`.
  - Face-Gate-Meta-Version auf `v129.23.2` aktualisiert.

## Erwartetes Verhalten

- Kein `replicate_create_404` mehr im Sync.so Face-Gate-Pfad.
- Kein harter `FACE_GATE_BLOCKED` mehr nur deshalb, weil serverseitig kein MP4-Frame extrahiert werden konnte.
- Saubere Preclips (`face_count=1`, `risk=clean`) laufen bei fehlendem Probe-JPEG als `FACE_GATE_PROBE_UNAVAILABLE` weiter bis zum Sync.so Dispatch.

## Nicht geändert

- Kein Umbau von AWS Rekognition.
- Kein Umbau der Client-Canvas/Continuity-Guardian-Erzeugung.
- Keine Migration, keine Credits-/Refund-Logik und keine Sync.so Payload-Optionen verändert.
