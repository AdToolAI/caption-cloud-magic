# v431 G3 — Webhooks / Fan-in: Analyse & Scope

Ziel: Ein verbindlicher Endvertrag, der beschreibt, wie `sync-so-webhook`, `remotion-webhook` (dialog-stitch), `compose-clip-webhook` und `render-sync-segments-audio-mux` ihre Zustands- und Output-Schreibvorgänge auf die G0/G2-Primitive (`composer_scene_transition_core` + Legacy-Spiegel) umziehen. Keine Code-Änderung in diesem Auftrag — nur Scope, Schnittstellen und Abnahmekriterien.

## 1. Ausgangslage (bestätigt am Code)

Die folgenden Schreibstellen sind im v431-Vorbereitungsinventar (`docs/v431-prep-inventory.md`) als `callbackRisk: high` markiert und schreiben heute nur per `.eq("id", sceneId)` — ohne atomaren Run-/Generation-Abgleich:

| Pfad | Datei | Zustände | Besonderheit |
| --- | --- | --- | --- |
| `sync-so-webhook` | `supabase/functions/sync-so-webhook/index.ts` | `lipsync_running`, `audio_muxing`, `complete`, `failed` | Pass-Fan-in auf `dialog_shots.passes[]`, teilweise Refund, Recovery aus selbst-verschuldetem Watchdog-Fail |
| `remotion-webhook` (dialog-stitch) | `supabase/functions/remotion-webhook/index.ts` | `complete`, `failed` | Schreibt `clip_url` + `lip_sync_applied_at` atomar mit `dialog_shots` |
| `compose-clip-webhook` | `supabase/functions/compose-clip-webhook/index.ts` | `failed`, `clip_status=ready` | Replicate-Callback, hat bereits manuellen Run-/Generation-Check (Zeilen 131–149) und v427-callback-guard |
| `render-sync-segments-audio-mux` | `supabase/functions/render-sync-segments-audio-mux/index.ts` | `audio_muxing`, `failed` | Lambda-Dispatcher, schreibt `audio_mux.render_id` und Fail-State |

Bestehende G0/G2-Primitive (bestätigt in `supabase/migrations/`):

- `composer_scene_transition_core(scene_id, to_state, guard_mode, run_id, generation, ...)` — zentrale State-Maschine mit Row-Lock, Run-/Generation-Guard und Transition-Log.
- `composer_fail_scene_with_mirrors(...)` — atomares Fail inkl. Legacy-Spiegel, Write-ID-Allowlist.
- `composer_finalize_upload_scene(...)` — atomares Finalisieren von Upload-Szenen inkl. Legacy-Spiegel.
- `composer_pipeline_jobs` + `composer-pipeline-jobs.ts` — Job-Ledger für Run-/Job-Identität und Callback-Claiming.

## 2. Zielvertrag G3

Jeder Callback-Handler muss vor einem Zustandswechsel beweisen:

1. **Run-Provenienz**: `active_run_id` / `plate_generation` der Szene stimmen mit dem im Callback transportierten Run überein.
2. **Job-Provenienz**: Der externe Job (`job_id`, `render_id`, `prediction_id`) gehört zu einem existierenden, nicht-terminalen `composer_pipeline_jobs`-Eintrag für diesen Run.
3. **Claiming**: Ein Completion-Event wird idempotent geclaimed (`claimPipelineCallback`); ein verspäteter oder duplizierter Callback wird ignoriert.
4. **Atomarität**: State-Transition + Legacy-Spiegel + Output-Materialisierung laufen im selben RPC unter `FOR UPDATE`.
5. **Fail-Closed**: Wenn Run oder Job nicht passen, wird 200 OK zurückgegeben (Provider-Deklaration), aber die Szene nicht verändert.

## 3. Scope-Grenzen

### In G3

- `sync-so-webhook` v5 sync-segments Pfad (single + multi-speaker).
- `remotion-webhook` dialog-stitch Branch (success + failure).
- `compose-clip-webhook` success/failure inkl. Auto-Retry-Logik.
- `render-sync-segments-audio-mux` Dispatch- und Fail-Pfade.
- Einführung neuer Domain-Primitive, wo die bestehenden (`composer_fail_scene_with_mirrors`, `composer_finalize_upload_scene`) nicht passen.

### Außerhalb G3

- `compose-dialog-segments` Deferred-Refund / Credit-Race — eigener Track, blockiert G3 nicht.
- `autopilotComposerBridge` und `continuity-chain` Fan-in — G5.
- UI-Writer (`SceneCard`, `useSceneGenerate`, `useTwoShotAutoTrigger`) — G5.
- Watchdog/Recovery-Override (`qa-watchdog`, `lipsync-watchdog`, etc.) — G4.
- Reverse-Bridge-Abschaltung — G6.

## 4. Vorgeschlagene neue Primitive

### 4.1 `composer_finalize_lipsync_scene`

Zustandsübergang `lipsync_running | lipsync_muxing -> complete` mit atomarer Output-Materialisierung.

Parameter:

```text
_scene_id uuid
_run_id uuid
_generation integer
_write_id text          -- 'sso:applied' | 'stitch:done'
_processed_video_url text
_source_clip_url text NULL
_dialog_shots jsonb NULL
```

Verhalten:
- Row-Lock auf `composer_scenes`.
- Guard: `active_run_id = _run_id`, `plate_generation = _generation`, `pipeline_state IN ('lipsync_running','lipsync_muxing')`.
- Setzt `pipeline_state = 'complete'`, `pipeline_substate = NULL`.
- Materialisiert Legacy-Spiegel: `processed_video_url = _processed_video_url`, `base_video_url = COALESCE(_source_clip_url, base_video_url)`, `clip_url = _processed_video_url`, `clip_status = 'ready'`, `lip_sync_applied_at = now()`.
- Schreibt `dialog_shots` nur wenn übergeben (Fan-in-Handler).
- Audit-Eintrag in `composer_scene_transition_log`.

### 4.2 `composer_finalize_lipsync_mux`

Zustandsübergang `lipsync_running -> lipsync_muxing` ohne Output-Finalisierung (nur Dispatch-Marker).

Parameter:

```text
_scene_id uuid
_run_id uuid
_generation integer
_write_id text          -- 'sso:audio_muxing'
_render_id text         -- Lambda render_id
```

Verhalten:
- Guard: `pipeline_state = 'lipsync_running'`.
- Setzt `pipeline_state = 'lipsync_muxing'`, `twoshot_stage = 'audio_muxing'` (Legacy), `dialog_shots.audio_mux.render_id = _render_id`.

### 4.3 Erweiterung `composer_fail_scene_with_mirrors`

Neue Write-IDs:
- `sso:failed` — Sync.so terminal failure.
- `sso:partial_mux_refused` — v36 3+ speakers refusal.
- `stitch:failed` — dialog-stitch Lambda failure.
- `cvc:failed` — compose-clip-webhook terminal failure (ohne Auto-Retry).
- `mux:preflight_failed` — render-sync-segments-audio-mux preflight failure.
- `mux:invoke_failed` — render-sync-segments-audio-mux Lambda invoke failure.

Jede Write-ID bekommt eine eigene Legacy-Spiegel-Regel (z. B. `cvc:failed` darf `lip_sync_*` Felder nur dann löschen, wenn `engine_override = 'cinematic-sync'`).

## 5. Migrationspfade pro Handler

### 5.1 `sync-so-webhook`

Heutige Logik:
- Lädt Szene per `id`.
- Prüft `lip_sync_applied_at`, `canceled`, `failed` (inkl. Recovery aus Watchdog-Fail).
- v5: matched `jobId` gegen `dialog_shots.passes[].job_id` oder `sync_job_id`.
- Schreibt `dialog_shots`, `lip_sync_status`, `twoshot_stage`, `clip_error`.
- Bei `COMPLETED`:
  - single non-tight: direkt `complete`.
  - single tight: dispatch `render-sync-segments-audio-mux`.
  - multi: claim mux dispatch, set `audio_muxing`.
- Bei `FAILED`: Refund, dann `failed`.

Zielvertrag:
1. Extrahiere `run_id` aus `dialog_shots.run_id` (muss beim Dispatch gesetzt werden) oder aus `syncso_dispatch_log`.
2. Rufe `claimPipelineCallback({ sceneId, runId, stage: 'sync_segment', externalJobId: jobId })` auf.
3. Bei `proceed=false`: 200 OK, Log, keine State-Änderung.
4. Bei `proceed=true`:
   - `COMPLETED` all done single non-tight → `composer_finalize_lipsync_scene(..., 'sso:applied', finalUrl, ...)`.
   - `COMPLETED` multi → `composer_finalize_lipsync_mux(...)`.
   - `FAILED` → `composer_fail_scene_with_mirrors(..., 'sso:failed', ...)`.
5. Refund-Logik: muss den **selben** Run spenden, der im Callback geprüft wurde. Kein Rückgriff auf aktuelle Szene nach Transition.

Offene Designfrage (im Scope zu klären): Woher kommt `run_id` im Sync.so-Webhook? Heute steht er nicht im `dialog_shots` Payload. Optionen:
- A) `syncso_dispatch_log` erweitern um `run_id` / `plate_generation`.
- B) `dialog_shots` erweitern um `run_id` / `plate_generation` beim Dispatch.
- C) Beides redundant, mit Präferenz B (Szene ist SSoT).

Empfohlene Option: **B + A als Fallback**.

### 5.2 `remotion-webhook` (dialog-stitch)

Heutige Logik:
- `isDialogStitch` erkannt über `source === 'dialog-stitch'`.
- `withDialogLock` um Read-Modify-Write.
- Schreibt `clip_url`, `lip_sync_applied_at`, `lip_sync_status='done'`, `twoshot_stage='done'`, `clip_status='ready'`, `dialog_shots.status='done'`.
- Failure-Branch: Refund, dann `lip_sync_status='failed'`, etc.

Zielvertrag:
1. `customData` enthält `run_id` und `plate_generation` (muss `render-sync-segments-audio-mux` beim Lambda-Dispatch setzen).
2. `claimPipelineCallback({ sceneId, runId, stage: 'audio_mux', externalJobId: renderId })`.
3. Success → `composer_finalize_lipsync_scene(..., 'stitch:done', finalOutputUrl, source_clip_url, dialog_shots)`.
4. Failure → `composer_fail_scene_with_mirrors(..., 'stitch:failed', ...)`.

### 5.3 `compose-clip-webhook`

Heutige Logik:
- Manueller Run-/Generation-Check (Zeilen 131–149).
- v427-callback-guard für `stage: 'base_video'`.
- Success: Download, Storage, `clip_url`, `clip_status='ready'`, ggf. Auto-Lip-Sync-Handoff.
- Failure: Auto-Retry, dann `clip_status='failed'` + ggf. `lip_sync_*` Reset.

Zielvertrag:
1. Behält manuellen Run-/Generation-Check bei (er ist bereits fail-closed).
2. Ersetzt State-Write durch `composer_finalize_plate_scene` (neues Primitive analog `composer_finalize_upload_scene`, aber für AI-Plate) ODER erweitert `composer_finalize_upload_scene` um AI-Plate-Modus.
3. Failure → `composer_fail_scene_with_mirrors(..., 'cvc:failed', ...)`.
4. Auto-Retry-Logik bleibt, aber Retry-Dispatch muss ein neues `composer_pipeline_jobs`-Segment für den neuen Versuch anlegen.

### 5.4 `render-sync-segments-audio-mux`

Heutige Logik:
- Lädt Szene, prüft `audio_plan.twoshot.url`.
- Preflight-HEAD-Check; bei Fehler direkt `failed`.
- Lambda invoke fail → `failed`.
- Dispatch success → `audio_muxing` + `dialog_shots.audio_mux.render_id`.

Zielvertrag:
1. Erhält `run_id` / `plate_generation` im Request-Body (muss Caller mitgeben).
2. Preflight fail → `composer_fail_scene_with_mirrors(..., 'mux:preflight_failed', ...)`.
3. Invoke fail → `composer_fail_scene_with_mirrors(..., 'mux:invoke_failed', ...)`.
4. Dispatch success → `composer_finalize_lipsync_mux(...)`.
5. Schreibt `run_id` / `plate_generation` in `video_renders.content_config` und `customData` des Lambda-Webhook.

## 6. Caller-Anpassungen (notwendige Voraussetzungen)

Damit die Webhooks ihre Run-Provenienz haben, müssen folgende Stellen `run_id` / `plate_generation` mitführen:

| Caller | Änderung |
| --- | --- |
| `compose-dialog-segments` (v5 Dispatch) | `dialog_shots.run_id`, `dialog_shots.plate_generation` setzen; `composer_pipeline_jobs` für jedes Segment anlegen. |
| `render-sync-segments-audio-mux` | Request-Body akzeptiert `run_id`/`plate_generation`; in Lambda-`customData` weitergeben. |
| `sync-so-webhook` URL / Payload | `run_id`/`plate_generation` optional in URL, falls Sync.so `customData` erlaubt; sonst aus `dialog_shots` lesen. |

## 7. Risiken & Abhilfe

| Risiko | Abhilfe |
| --- | --- |
| Sync.so Callback enthält keinen `run_id` | `dialog_shots` erweitern; Fallback auf `syncso_dispatch_log`. |
| Multi-speaker Pass-Fan-in Race | `claimPipelineCallback` pro Segment + `update_dialog_pass_slot` (bereits vorhanden) behält Autorität über Slot-Updates; State-Transition nur wenn alle Segments `succeeded`. |
| Remotion webhook `customData` Größenlimit | Nur `run_id`, `plate_generation`, `scene_id`, `render_id` mitgeben; keine großen Objekte. |
| Auto-Retry von `compose-clip-webhook` erzeugt neue Run-Identität | Retry als neues `composer_pipeline_jobs`-Segment mit `attempt_no` inkrementieren. |
| Watchdog-Recovery aus selbst-verschuldetem Fail | Bleibt erlaubt, muss aber ebenfalls `claimPipelineCallback` durchlaufen und darf nur innerhalb desselben Runs geschehen. |

## 8. Teststrategie

| Test | Nachweis |
| --- | --- |
| Out-of-order Callback | Älterer Sync.so-Callback für Run A wird ignoriert, während Run B aktiv ist. |
| Duplicate Callback | Zweiter `COMPLETED`-Callback für dasselbe Segment ist no-op. |
| Wrong Job | Callback mit unbekanntem `job_id` wird ignoriert. |
| Run-Mismatch | Callback mit korrektem Job aber falschem `run_id` wird ignoriert. |
| Atomarität | State-Transition + Legacy-Spiegel + Transition-Log in einem RPC. |
| Fan-in Barrier | Szene bleibt `lipsync_running`, bis alle Segmente `succeeded`. |
| Mux Dispatch Race | `try_claim_mux_dispatch` (bereits vorhanden) gewinnt nur einmal. |

## 9. Deliverables dieses Auftrags

1. Dieser Plan als verbindlicher Endvertrag (`.lovable/plan.md`).
2. Ein detailliertes Schnittstellen-Dokument pro Primitive (Parameter, Guard-Bedingungen, Legacy-Spiegel-Regeln).
3. Eine Mapping-Tabelle: aktuelle Write-ID -> zukünftige Write-ID -> RPC.
4. Klare GO/NO-GO Punkte für die eigentliche Migration.

## 10. STOP

Keine Code-Änderung ohne ausdrückliches GO für G3.1 (erster Migrations-Block).
