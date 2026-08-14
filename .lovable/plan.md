# v431 G2.3 — Verbindlicher Endvertrag

## G2.3 Scope

Genau **drei** Pfade:

1. `compose-twoshot-audio:failed` (`supabase/functions/compose-twoshot-audio/index.ts:653`)
   - Nur der G2-Caller `compose-video-clips` mit vollständigem `run_id` + `plate_generation` im Body.
   - Verwendet das bestehende `composer_fail_scene_with_mirrors` (G2.2, unverändert).
   - Andere Caller (`compose-clip-webhook`, `autopilotComposerBridge`) bleiben Legacy.

2. `cvc:upload-complete` (`supabase/functions/compose-video-clips/index.ts:4117`)
   - Neues Primitive `composer_finalize_upload_scene`.

3. `cvc:failed/pika` (`supabase/functions/compose-video-clips/index.ts:4904`)
   - Verwendet das bestehende `composer_fail_scene_with_mirrors`.

## Nicht G2.3

Gesamtes `compose-dialog-segments` — Circuit-Open, Deferred und Diagnosezweige — sowie `lipsync-watchdog`, `useTwoShotAutoTrigger`, `ClipsTab`-Auto-Trigger, `compose-clip-webhook`, `autopilotComposerBridge`, Reset-Pfade, `clip_error`-only-Diagnosen, Output-Writes ohne Statuswechsel und Job-Metadata.

`composer_park_lipsync_dispatch` wird **nicht** erstellt.

## composer_finalize_upload_scene

`SECURITY DEFINER` mit:

- `SET search_path = pg_catalog, public`
- Tabellen/Funktionen im Rumpf explizit `public.` bzw. `auth.` qualifiziert
- `REVOKE ALL ... FROM PUBLIC, anon, authenticated`
- `GRANT EXECUTE ... TO service_role`

Verhalten:

- Signatur: `public.composer_finalize_upload_scene(_scene_id uuid, _run_id uuid, _generation int, _write_id text, _upload_url text)`
- Akzeptiert ausschliesslich `_write_id = 'cvc:upload-complete'`, sonst `invalid_write_id` ohne Write
- `SELECT ... FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE` als erste Anweisung
- Run-Gate: `active_run_id = _run_id` sonst `stale_run`; `plate_generation = _generation` sonst `stale_generation`
- From-Set: fest `{idle, plate_queued}`, sonst `unexpected_from_state`
- To-State: fest `complete`, kein Parameter
- `pipeline_state_run_id = _run_id` + Generation-Spiegel
- Output-Tripel (`clip_url`, `base_video_url`, `processed_video_url`) + `pipeline_state='complete'` + `clip_status='ready'` in einem Commit
- Audit-Eintrag in `public.composer_scene_transition_log`
- Kein Output-Write bei Ablehnung (stale/unzulässiger From-State)
- Keine neuen globalen Transition-Kanten, keine Änderung am G0-Core

## Neue Primitive in G2.3

Genau **eins**: `composer_finalize_upload_scene`.

Keine Runless-Regeln, kein Grandfathering, keine G0-Core-Erweiterung.

## Umsetzungsreihenfolge nach GO

1. DB-Migration: `composer_finalize_upload_scene`.
2. Writer-Migration der drei Pfade:
   - `compose-twoshot-audio:failed` — caller-spezifisch nur mit Body-Provenienz.
   - `cvc:upload-complete` — auf `composer_finalize_upload_scene`.
   - `cvc:failed/pika` — auf `composer_fail_scene_with_mirrors`.
3. Verifikation: `tsgo`, Composer-/Lip-Sync-Suite, Writer-Inventar-Test um das neue Primitive erweitert, transaktionale DB-Smokes.
4. STOP.
