# v120 — Lipsync Zombie-Fix + Pass-4 Root-Cause-Pfad

## Ziel
1. **Kernfehler beheben**: Sarah's Pass 4 läuft auf `bbox-url-pro` reproduzierbar in `provider_unknown_error` → künftig nach 2 stillen Fails automatisch auf den funktionierenden Preclip-Pfad (Single-Face-Crop) zwingen, mit dem Pass 2/3 erfolgreich liefen.
2. **Zombie-Symptom abschalten**: Stale `retrying`-Passes ohne aktiven Provider-Job dürfen das Szenen-Terminal nicht mehr blockieren; Watchdog erkennt auch `lip_sync_status='running'` bei `clip_status='ready'`.

## Änderungen

### 1. `compose-dialog-segments/index.ts` — Pass-4-Pfad reparieren (Kernfix)
- Vor jedem Sync.so-Dispatch pro Pass prüfen: Zähle in `syncso_dispatch_log` die letzten Fails desselben `(scene_id, speaker_index, retry_variant='bbox-url-pro')` mit `error_code IN ('provider_unknown_error', NULL)`.
- Wenn `>=2`: erzwinge `retry_variant='preclip-single'` (Single-Face-Crop dieses Sprechers aus der Plate, gleicher Pfad wie Pass 2/3) und logge `v120_pass4_preclip_forced`.
- Sarahs `bounding_boxes_url`-Box zusätzlich loggen (x,y,w,h relativ zum Plate-Frame) für spätere Diagnose, ohne sie zu verändern.

### 2. `sync-so-webhook/index.ts` — Terminal-Logic härten
- Im Fan-Out-Branch: ein `retrying`-Pass zählt nur dann als "blocking", wenn in `syncso_inflight_jobs` ein Eintrag mit `provider_job_id` und Alter `<10min` existiert. Sonst gilt der Pass als endgültig `failed`.
- Wenn alle mandatorischen Passes terminal `failed` sind → Szene `clip_status='failed'`, `lip_sync_status='failed'`, `twoshot_stage='terminal_failed_v120'`, idempotenter Refund über deterministische UUID `(scene_id, 'v120_terminal')`.

### 3. `lipsync-watchdog/index.ts` + SQL-Watchdog
- Bedingung erweitern: trigger auch wenn `lip_sync_status='running'` AND `last_lipsync_update < now()-interval '12 min'`, unabhängig von `clip_status`.
- SQL-Watchdog `lipsync_watchdog_15min` analog erweitern (zusätzliche OR-Klausel, nicht ersetzen).
- Bei Treffer: Szene als `terminal_failed_v120_watchdog` markieren + Refund.

### 4. Cleanup der aktuell hängenden Szene
- Szene `ec4290f2-d555-4a3c-af44-9413e467fd2f` einmalig terminal `failed` + Refund, damit der User die Szene neu starten kann (frischer Versuch profitiert dann sofort von #1).

## Akzeptanzkriterien
- Keine Szene bleibt länger als 12 min in `lip_sync_status='running'` ohne aktiven Provider-Job.
- Pass 4 für Sarah loopt nicht mehr in `provider_unknown_error`: nach max. 2 Fails Preclip-Pfad, der nachweislich funktioniert.
- Refund läuft idempotent (keine doppelte Gutschrift bei mehrfachem Webhook).

## Out of Scope
- Keine Änderung am Plate-Builder oder an der Box-Berechnung (Box-Validierung nur als Logging, nicht als Auto-Fix).
- Keine Änderungen an Engine-Auswahl, Cinematic-Sync oder UI.

## Technische Notizen
- Betroffene Files: `supabase/functions/compose-dialog-segments/index.ts`, `supabase/functions/sync-so-webhook/index.ts`, `supabase/functions/lipsync-watchdog/index.ts`, neue Migration für SQL-Watchdog-Bedingung, `mem/architecture/lipsync/v120-zombie-failsafe-and-pass4-preclip-forcing.md`, `mem/index.md`.
- Refund nutzt vorhandenes Pattern aus v118 (deterministische UUID, `credit_transactions` upsert).
