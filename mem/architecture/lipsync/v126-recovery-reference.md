---
name: v126 Recovery Reference
description: Invariants, default-variant, retry-clear-list, watchdog TTLs, DB-validation checklist und Schritt-für-Schritt Restore-Prozedur für die unified preclip pipeline
type: feature
---

# v126 Lip-Sync Pipeline — Recovery Reference

Schriftlicher Snapshot des funktionierenden Stands. Falls die Pipeline jemals wieder brechen sollte, kann sie 1:1 aus diesem Dokument wiederhergestellt werden.

## 1. Goldene Regeln (must-hold invariants)

- **Eine Pipeline für alle N (1..4 Sprecher)**: single-face square **preclip** via Remotion Lambda, dann Sync.so mit Preclip-Video.
- **Niemals** `full_plate` + `bounding_boxes_url` / `bounding_boxes` / `coordinates` / `frame_number` an Sync.so senden.
- Sync.so Optionen sind **doc-strict** (siehe `sync-3-doc-strict-options-v106.md`): nur
  - `sync_mode: "cut_off"`
  - `active_speaker_detection: { auto_detect: true }`
  - **kein** `temperature`, **kein** `occlusion_detection_enabled`, **kein** `bounding_boxes*`
- Model: `sync-3` (Sync.so Creator $19/mo Plan — siehe `sync-so-pro-model-policy.md`).
- Wenn ein Preclip nicht produziert werden kann → Pass failt **clean mit Refund**, kein Fallback auf full_plate.

## 2. Default-Variant

- `freshDefaultVariant = "coords-pro"` in `supabase/functions/compose-dialog-segments/index.ts` für **alle** Dispatches (Initial + Retry).
- Entfernt als Auto-Routen: `bbox-url-pro`, `sync3-coords`, `coords-pro-lp2pro`, `auto-pro`, `auto-standard`.
- Entfernt: `v118_preclip_facegate_bypass`, `v118_preclip_dropped_for_variant`, sowie der "edge-speaker skip" Block in der Batch-Preclip-Logik.
- `v107_multispeaker_preclip_required_BLOCK` wurde zu `v126_preclip_required_BLOCK` (gilt jetzt für **jedes N**, nicht nur N≥2).

## 3. Retry-Verhalten (`supabase/functions/sync-so-webhook/index.ts`)

Bei einem `retrying` Pass müssen **alle** folgenden Felder gecleared werden, sonst blockt dead provider state den nächsten Dispatch:

- `job_id = null`
- `output_url = null`
- `started_at = null`
- `finished_at = null`
- `preclip_url = null`
- `preclip_face_count = null`
- `last_error = null`
- `retry_count` bleibt erhalten (Budget-Tracking)

Variant beim Retry: erzwungen `coords-pro` (kein Variant-Escalation mehr).

## 4. Watchdog (`supabase/functions/lipsync-watchdog/index.ts`)

- Cron: alle 2 min (pg_cron).
- `retrying` passes ohne live `job_id` → **re-dispatch (`advance`)**, nicht killen.
- Provider-TTL: **10 min** (sync-3 preclips sind Minuten, nicht 10–15 min wie legacy).
- `STALE_HARD_MS`: **25 min** (von 20 erhöht, gibt Recovery zusätzliche Zyklen).
- Scene wird erst dann als `watchdog_provider_timeout` failed gemarkt, wenn **alle** non-done passes wirklich stale sind.

## 5. Verifizierte End-to-End Kennzahlen

Referenz-Scene `cba18767-be99-454a-95b8-939d6ad6f107`:

- Pure Lipsync gesamt: **29 min 24 s** (4 Sprecher seriell)
- Einzelner Recovery-Pass nach v126: **2 min 45 s**
- 5/5 v126-Dispatches erfolgreich
- 1× legacy `full_plate` Dispatch failte mit `provider_unknown_error` → bestätigt warum legacy weg muss

## 6. DB-Validierung (jede neue Dispatch-Row prüfen)

In `syncso_dispatch_log.meta` müssen folgende Felder so aussehen:

- `dispatch_video_kind === 'preclip'`
- `payload_summary.options.active_speaker_detection.auto_detect === true`
- `payload_summary.options.sync_mode === 'cut_off'`
- **fehlen müssen**: `bounding_boxes_url`, `bounding_boxes`, `coordinates`, `frame_number`, `temperature`, `occlusion_detection_enabled`

Wenn eine dieser Bedingungen nach einer Code-Änderung verletzt ist → **Regression, Pipeline kaputt**.

Validation-Query:
```sql
SELECT created_at,
       meta->>'dispatch_video_kind' AS kind,
       meta->'payload_summary'->'options' AS options
FROM   syncso_dispatch_log
ORDER  BY created_at DESC
LIMIT  20;
```

## 7. Wiederherstellung nach Regression

1. `git log` auf die 3 Dateien fahren und auf den v126-State zurücksetzen:
   - `supabase/functions/compose-dialog-segments/index.ts`
   - `supabase/functions/sync-so-webhook/index.ts`
   - `supabase/functions/lipsync-watchdog/index.ts`
2. Edge Functions deployen.
3. Stuck scenes resetten — für betroffene `dialog_shots`:
   ```sql
   UPDATE dialog_shots SET
     status = 'pending',
     job_id = NULL,
     output_url = NULL,
     preclip_url = NULL,
     preclip_face_count = NULL,
     last_error = NULL,
     retry_count = 0,
     started_at = NULL,
     finished_at = NULL
   WHERE scene_id = '<scene-uuid>' AND status <> 'done';

   UPDATE composer_scenes SET lip_sync_status = 'running'
   WHERE id = '<scene-uuid>';
   ```
4. Watchdog manuell triggern (oder auf nächsten Cron warten).
5. Nach erstem neuen Dispatch: DB-Validierung aus Abschnitt 6 fahren.

## 8. Verwandte Memory-Dateien (nicht löschen)

- `mem/architecture/lipsync/v126-unified-preclip-pipeline.md` — Hauptdoku der v126-Änderung
- `mem/architecture/lipsync/sync-3-doc-strict-options-v106.md` — Option-Whitelist
- `mem/architecture/lipsync/sync-so-pro-model-policy.md` — Pricing/Plan
- `mem/architecture/lipsync/syncso-default-segments-engine.md` — Routing v5
- `mem/architecture/lipsync/sync-so-webhook-stage5.md` — Webhook + 8min Watchdog
