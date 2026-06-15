# Revert auf v126 Recovery-State (Code-basiert)

Statt manuell in der History zurückzuspringen, setze ich die Lipsync-Pipeline im Code 1:1 auf den dokumentierten v126-Stand aus `mem/architecture/lipsync/v126-recovery-reference.md` zurück. Damit verschwinden alle Änderungen aus v127 (Parallel-6-Slots) und alle danach diskutierten v128-Ideen (bbox_url, soft-fallback, auto_detect-Varianten).

## Was wiederhergestellt wird (v126-Invariants)

1. **Eine Pipeline für alle 1..N Sprecher**: single-face square **preclip** via Remotion Lambda → Sync.so mit Preclip-Video.
2. **Niemals** `full_plate` + `bounding_boxes*` / `coordinates` / `frame_number` an Sync.so.
3. Sync.so options **doc-strict**: nur `sync_mode: "cut_off"` + `active_speaker_detection: { auto_detect: true }`. Kein `temperature`, kein `occlusion_detection_enabled`, kein `bounding_boxes*`.
4. Model: `sync-3`.
5. Preclip nicht produzierbar → Pass failt **clean mit Refund**, kein full_plate Fallback.

## Konkrete Code-Änderungen

### A) `supabase/functions/compose-dialog-segments/index.ts`
- `freshDefaultVariant = "coords-pro"` für **alle** Dispatches (Initial + Retry).
- Entfernen aller Auto-Routen: `bbox-url-pro`, `sync3-coords`, `coords-pro-lp2pro`, `auto-pro`, `auto-standard`.
- Entfernen: `v118_preclip_facegate_bypass`, `v118_preclip_dropped_for_variant`, edge-speaker-skip Block in Batch-Preclip-Logik.
- `v107_multispeaker_preclip_required_BLOCK` → `v126_preclip_required_BLOCK` (für **jedes N**, nicht nur N≥2).
- v127-Parallelisierung (6 gleichzeitige Sync.so Slots, MAX_INFLIGHT=6) **entfernen** → zurück auf serielle / v126-konforme Dispatch-Reihenfolge.
- Alle v128-Diskussionsreste (preflight_soft_fallback, generate-speaker-bbox-track Aufrufe, bbox_per_frame_dispatch Flag) entfernen, falls vorhanden.

### B) `supabase/functions/sync-so-webhook/index.ts`
Bei `retrying` Pass **alle** folgenden Felder clearen:
- `job_id = null`, `output_url = null`, `started_at = null`, `finished_at = null`
- `preclip_url = null`, `preclip_face_count = null`, `last_error = null`
- `retry_count` **bleibt** (Budget-Tracking).
- Retry-Variant erzwungen `coords-pro` (keine Variant-Escalation mehr).

### C) `supabase/functions/lipsync-watchdog/index.ts`
- Cron alle 2 min.
- `retrying` ohne live `job_id` → **re-dispatch** (`advance`), nicht killen.
- Provider-TTL: **10 min**.
- `STALE_HARD_MS`: **25 min**.
- Scene-Fail (`watchdog_provider_timeout`) erst wenn **alle** non-done passes stale.

### D) Edge Functions deployen
Alle drei Functions neu deployen.

### E) Stuck Scenes resetten
Für die aktuell hängende Scene (und alle weiteren betroffenen) den SQL-Reset aus dem Recovery-Doc fahren:
```sql
UPDATE dialog_shots SET
  status='pending', job_id=NULL, output_url=NULL,
  preclip_url=NULL, preclip_face_count=NULL, last_error=NULL,
  retry_count=0, started_at=NULL, finished_at=NULL
WHERE scene_id = '<scene-uuid>' AND status <> 'done';

UPDATE composer_scenes SET lip_sync_status='running'
WHERE id = '<scene-uuid>';
```
Watchdog manuell triggern.

### F) DB-Validierung nach erstem neuen Dispatch
Query aus Recovery-Doc Abschnitt 6 fahren. Erwartet pro Row:
- `meta.dispatch_video_kind == 'preclip'`
- `payload_summary.options.active_speaker_detection.auto_detect == true`
- `payload_summary.options.sync_mode == 'cut_off'`
- **fehlen**: `bounding_boxes_url`, `bounding_boxes`, `coordinates`, `frame_number`, `temperature`, `occlusion_detection_enabled`

Wenn ein Feld auftaucht → Regression, sofort stoppen.

## Memory-Updates
- `mem/architecture/lipsync/v127-parallel-6-slots.md` → als **superseded** markieren (nicht löschen, nur Hinweis dass Pipeline auf v126 zurückgesetzt).
- `mem/architecture/lipsync/v126-recovery-reference.md` → bleibt unverändert (ist die Source of Truth).
- `mem/index.md` → v127-Eintrag entsprechend annotieren.

## Welche Scene(s) reseten?
Brauche kurz die Scene-UUID(s) die aktuell hängen (oder „alle non-done dialog_shots der letzten 24 h"). Default falls keine Angabe: nur die letzte fehlgeschlagene Scene aus dem aktuellen Vorfall (`9a1787ae-c83b-4fd8-af7d-de6ab2d54518`).

## Nicht angefasst
- Pricing/Plan (`sync-so-pro-model-policy`)
- Webhook-Stage-5 Logik außerhalb des Retry-Clear-Blocks
- Credit-Refund Idempotenz
- Composer-Scenes / Frontend
