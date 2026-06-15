# v126 Lip-Sync Pipeline – Recovery Reference

Ziel: Den aktuellen, funktionierenden Stand der Sync.so Dialog-Pipeline schriftlich einfrieren, damit wir ihn nach einer Regression 1:1 wiederherstellen können.

## Deliverable

Neue Memory-Datei: `mem/architecture/lipsync/v126-recovery-reference.md`
Index-Eintrag in `mem/index.md` ergänzen (1 Zeile unter "Memories").

Keine Code-Änderungen. Nur Dokumentation.

## Inhalt der Recovery-Datei

### 1. Goldene Regeln (must-hold invariants)
- **Eine Pipeline für alle N (1..4 Sprecher)**: single-face square preclip via Remotion Lambda, danach Sync.so mit Preclip-Video.
- **Niemals** `full_plate` + `bounding_boxes_url` / `bounding_boxes` / `coordinates` / `frame_number` an Sync.so senden.
- Sync.so Optionen sind **doc-strict** (siehe `mem/architecture/lipsync/sync-3-doc-strict-options-v106.md`): nur `sync_mode: "cut_off"` + `active_speaker_detection: { auto_detect: true }`, **kein** `temperature`, **kein** `occlusion_detection_enabled`, **kein** `bounding_boxes*`.
- Model: `sync-3` (Sync.so Creator $19/mo plan – siehe `sync-so-pro-model-policy`).
- Wenn ein Preclip nicht produziert werden kann → Pass failt clean mit Refund, **kein** Fallback auf full_plate.

### 2. Default-Variant
- `freshDefaultVariant = "coords-pro"` in `compose-dialog-segments/index.ts` für **alle** Dispatches (Initial + Retry).
- Entfernt: `bbox-url-pro`, `sync3-coords`, `coords-pro-lp2pro`, `auto-pro`, `auto-standard` als Auto-Routen.
- Entfernt: `v118_preclip_facegate_bypass`, `v118_preclip_dropped_for_variant`, "edge-speaker skip" Batch-Preclip-Block.
- `v107_multispeaker_preclip_required_BLOCK` wurde zu `v126_preclip_required_BLOCK` (gilt für jedes N).

### 3. Retry-Verhalten (`sync-so-webhook/index.ts`)
Bei `retrying` Pass zwingend folgende Felder clearen, sonst blockt dead provider state den nächsten Dispatch:
- `job_id = null`
- `output_url = null`
- `started_at = null`
- `finished_at = null`
- `preclip_url = null`
- `preclip_face_count = null`
- `last_error = null` (nach Reset)
Variant beim Retry: erzwungen `coords-pro`.

### 4. Watchdog (`lipsync-watchdog/index.ts`)
- Läuft alle 2 min (pg_cron).
- `retrying` passes ohne live `job_id` → re-dispatch (`advance`), nicht killen.
- Provider-TTL: 10 min (sync-3 preclips sind Minuten, nicht 10–15 min).
- `STALE_HARD_MS`: **25 min** (von 20 erhöht, gibt Recovery extra Zyklen).
- Scene wird erst dann als `watchdog_provider_timeout` failed gemarkt, wenn **alle** non-done passes wirklich stale sind.

### 5. Verifizierte End-to-End Kennzahlen (Scene `cba18767-…`)
- Pure Lipsync: 29 min 24 s (4 Sprecher seriell).
- Einzelner Recovery-Pass nach v126: 2 min 45 s.
- 5/5 v126-Dispatches erfolgreich. 1× legacy full_plate Dispatch failte mit `provider_unknown_error` → bestätigt warum legacy weg muss.

### 6. DB-Validierung (jede neue Dispatch-Row prüfen)
In `syncso_dispatch_log.meta`:
- `dispatch_video_kind === 'preclip'`
- `payload_summary.options.active_speaker_detection.auto_detect === true`
- `payload_summary.options.sync_mode === 'cut_off'`
- **fehlt**: `bounding_boxes_url`, `bounding_boxes`, `coordinates`, `frame_number`, `temperature`, `occlusion_detection_enabled`

Wenn eine dieser Bedingungen nach einer Code-Änderung verletzt ist → Regression, Pipeline kaputt.

### 7. Wiederherstellung nach Regression
1. `git log` auf die 3 Dateien fahren und auf v126-State zurücksetzen:
   - `supabase/functions/compose-dialog-segments/index.ts`
   - `supabase/functions/sync-so-webhook/index.ts`
   - `supabase/functions/lipsync-watchdog/index.ts`
2. Edge Functions deployen.
3. Stuck scenes resetten: betroffene `dialog_shots` rows auf `pending`, `job_id/output_url/preclip_url/last_error = null`, `retry_count = 0`. Scene auf `lip_sync_status = 'running'`.
4. Watchdog manuell triggern (oder auf nächsten Cron warten).
5. Nach erstem neuen Dispatch: DB-Validierung aus Abschnitt 6 fahren.

### 8. Verwandte Memory-Dateien (nicht löschen)
- `mem/architecture/lipsync/v126-unified-preclip-pipeline.md` (Hauptdoku)
- `mem/architecture/lipsync/sync-3-doc-strict-options-v106.md` (Option-Whitelist)
- `mem/architecture/lipsync/sync-so-pro-model-policy.md` (Pricing/Plan)
- `mem/architecture/lipsync/syncso-default-segments-engine.md` (Routing v5)
- `mem/architecture/lipsync/sync-so-webhook-stage5.md` (Webhook + 8min Watchdog)

## Index-Update

In `mem/index.md` unter "Memories" ergänzen:
`- [v126 Recovery Reference](mem://architecture/lipsync/v126-recovery-reference) — Invariants, default-variant, retry-clear-list, watchdog TTLs, DB-validation checklist und Schritt-für-Schritt Restore-Prozedur für die unified preclip pipeline`
