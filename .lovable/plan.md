# v431 G3.2 — Callback-Apply-Migration: autoritativer Endvertrag

Endfassung nach Review-Runde 2. Keine Migration, kein Code, kein Deploy in diesem Schritt. G3.0b/G3.1 bleiben frozen; `composer_fail_scene_with_mirrors`, `composer_finalize_talking_head`, `composer_finalize_upload_scene` werden nicht angefasst.

## 1. Writer-Inventar (Ist-Zustand, am Code verifiziert)

### compose-clip-webhook
| Pfad | heutige Writes | Ziel |
| --- | --- | --- |
| success | `composer_scenes.update` (L282): `materializeCompatibilityOutput('base')` → `base_video_url`+`clip_url`, `continuityRenderedPatch`, `clip_status='ready'`, `clip_error=null`, ggf. `lip_sync_status='pending'`/`twoshot_stage='master_clip'`, `audio_plan.ambientGate` | **A** `composer_finalize_plate_scene` |
| success/nachgelagert | `video_creations`-Archiv, Continuity-Chain, `composer_projects.status` (L780) | bleibt Handler, **nach** Commit, nur bei `applied:true` |
| handoff-fail | `update{lip_sync_status:'failed',twoshot_stage:'failed'} .eq(clip_status,'ready')` (L503) | **H** `composer_fail_post_plate_handoff` (run-bound, kein Ledger-Job) |
| legacy talking-head block | `update{clip_status:'failed',clip_error,…, dialog_shots:null}` (L532) | **D** `ccw:legacy_route_blocked` |
| failed | `update{clip_status:'failed',retry_count,clip_error, ggf. lip_sync_status/twoshot_stage/dialog_shots=null}` (L683) + Refund + Chain-Release | **D** `ccw:failed`; Refund/Chain nach Commit |
| auto-retry | `replaceLedgerAttempt` + `update{clip_status:'generating',retry_count,replicate_prediction_id}` (L645) | G3.1-Retry-Vertrag, **unverändert** |
| stale | L139 Run/Generation-Gate, `guardCallback`, `observeCallbackProvenance` | Gate wandert in den RPC; Observe bleibt |

### sync-so-webhook
| Pfad | heutige Writes | Ziel |
| --- | --- | --- |
| pass done/failed, Fan-in offen | `update_dialog_pass_slot` + `update{lip_sync_status:'running',twoshot_stage:'syncso_fanout_x_of_n'}` (L1073/L1084) | **F** `composer_apply_sync_segment_result` |
| Fallback bei RPC-Fehler | Whole-JSON `dialog_shots`-Rewrite (L1096) | **entfällt ersatzlos** (G3.0b §4) |
| single, nicht-tight (direct final) | Whole-JSON + `materializeCompatibilityOutput('processed')` + `clip_status='ready'`, `lip_sync_status='applied'`, `lip_sync_applied_at`, `twoshot_stage='complete'` (L1144) | **F** mit `_final_mode='finalize'` (Pass + Scene-Finalize + Job in einem Commit) |
| single-tight / N≥2 all done | `try_claim_mux_dispatch` + Whole-JSON `status:'audio_muxing'` + `lip_sync_status='audio_muxing'` (L1201) + `acquireLedgerJob(audio_mux)` + Dispatch | **F** mit `_final_mode='mux'` (kein Scene-State-Write) → danach Claim + Ledger + Dispatch |
| noop-ladder exhausted | Slot-RPC + `update{lip_sync_status:'failed',twoshot_stage:'needs_clip_rerender',clip_error}` (L809) | **F** mit `_final_mode='fail'`, Verdikt `sso:noop_unrecoverable` |
| partial-mux refused (≥3) | Whole-JSON + `lip_sync_status/twoshot_stage='failed'` + Wallet-Direktschreibung (L1035/L1042) | **F** `_final_mode='fail'`, Verdikt `sso:partial_mux_refused`; Refund nach Commit über Refund-RPC, **nie** direktes `wallets.update` |
| failed/rejected/canceled | Slot-Patches, Retry-Ladder, Whole-JSON-Fails (L1493/L1704/L1780/L1806) | **F** (Segment-Fail; `_final_mode='fail'`, wenn Fan-in terminal) |
| watchdog-recover | `update{dialog_shots:{...,status:'rendering'}}` (L461) | schmaler Progress-Patch (E-Logik) |

### render-sync-segments-audio-mux
| Pfad | heutige Writes | Ziel |
| --- | --- | --- |
| preflight fail | `update{lip_sync_status/twoshot_stage:'failed',clip_error, dialog_shots Whole-JSON}` (L753) | **G** `mux:preflight_failed` (job-bound, ohne External-ID) |
| dispatch | `video_renders.insert`, `resolveLedgerDispatch`, `bindLedgerExternalJob(renderId)`, dann `update{dialog_shots.audio_mux.render_id, lip_sync_status/twoshot_stage:'audio_muxing'}` (L916) | **C** `composer_enter_lipsync_mux` (nach `bindLedgerExternalJob`, vor Lambda-Invoke) |
| invoke fail | `video_renders.update(failed)` + Whole-JSON-Rollback + `lip_sync_status='failed'` (L961) + `settleLedgerDispatchFailure` | **G** `mux:invoke_failed` als einziger Owner; `settleLedgerDispatchFailure()` für diesen Job **entfällt** |

### remotion-webhook / dialog-stitch
| Pfad | heutige Writes | Ziel |
| --- | --- | --- |
| stitch success | `video_renders.update`, dann unter `withDialogLock`: `materializeCompatibilityOutput('processed', {baseUrl: prevState.source_clip_url})`, `clip_status='ready'`, `lip_sync_source_clip_url`, `lip_sync_applied_at`, `lip_sync_status='done'`, `twoshot_stage='done'`, Whole-JSON `dialog_shots` (L291) | **B** `stitch:done`; `baseUrl` serverseitig aus Scene/Run, nicht aus `dialog_shots` (G3.0b §5) |
| stitch fail | `update{lip_sync_status:'failed', dialog_shots Whole-JSON}` + `increment_balance` (L679) | **D** `stitch:failed`; Refund nach Commit |
| preclip success/fail | Shot-Array-Patch (L250/L640) | **außerhalb G3.2**, bleibt `withDialogLock` |
| DC / Exporte / Sora / UVC | eigene Tabellen | **außerhalb G3.2** |

## 2. Gemeinsame Regeln

Alle neuen RPCs: `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, schema-qualifiziert, `REVOKE ALL FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE TO service_role`.

Ablauf in jedem job-gebundenen RPC: `SELECT … FROM composer_pipeline_jobs WHERE id=_pipeline_job_id FOR UPDATE` → `SELECT … FROM composer_scenes WHERE id=job.scene_id FOR UPDATE` → Identitätsprüfung → From-State-Matrix → Writes → Job-Statuswechsel → Return. Rückgabe einheitlich `jsonb`: `{applied, verdict, scene_id, run_id, plate_generation, stage, job_status}`. Jeder Versuch (applied **und** rejected) schreibt eine Audit-Zeile.

**Job-Terminalisierung ist nicht generisch:** **A**, **B**, **D**, **F**, **G** terminalisieren den adressierten Job; **C** terminalisiert bewusst **nicht** (der Job gehört dem späteren Remotion-Callback); **E** ist ein reiner interner SQL-Helper ohne Job-Bezug; **H** hat überhaupt keinen Ledger-Job.

**Terminalstatus normativ:** die bestehende CHECK-Allowlist von `composer_pipeline_jobs.status` lautet `pending, dispatching, dispatched, running, callback_processing, succeeded, failed, cancelled, stale, dispatch_uncertain` (in der DB verifiziert). Erfolgreicher Terminalstatus ist durchgängig **`succeeded`**; `completed` existiert nicht und wird nicht eingeführt.

Identitätsprüfung (exakte Reihenfolge, job-gebundene RPCs):
1. Job existiert, `stage` = erwartete Stage → sonst `wrong_stage`.
2. `job.external_job_id IS NULL` → `binding_pending` (§4) — **vor** jedem Wertvergleich.
3. `_external_job_id = job.external_job_id` → sonst `wrong_job`.
4. `job.run_id = scene.active_run_id` → sonst `stale_run`.
5. `job.plate_generation = scene.plate_generation` → sonst `stale_generation`.
6. Job bereits terminal `succeeded` → `duplicate_callback` (No-op, `applied:false`).
7. Job terminal `failed`/`cancelled`/`stale`/`replaced_by IS NOT NULL` → `attempt_superseded`.

Schritte 2–3 entfallen ausschließlich in **G** (interner Dispatch-Fail ohne External-Bindung); Schritte 1–3 und 6–7 entfallen in **H** (kein Ledger-Job, run-gebundene Provenienz).

## 3. RPC-Verträge

### A. `composer_finalize_plate_scene(_pipeline_job_id uuid, _external_job_id text, _write_id text, _base_video_url text, _clip_source_hint text, _extra jsonb)`
- Write-ID geschlossen: `ccw:plate-complete`. Stage `base_video`.
- From-State: **ausschließlich** `plate_rendering` → `plate_ready`; `plate_queued` → `from_state_rejected` (No-op).
- Writes: `base_video_url`, `clip_url`, `clip_status='ready'`, `clip_error=NULL`; schmale Keys aus `_extra` (Allowlist `continuity_rendered_*`, `audio_plan.ambientGate`, `lip_sync_status='pending'`, `twoshot_stage='master_clip'`). `processed_video_url` unberührt.
- Job: `succeeded`.
- Handoff, Archiv, Continuity-Chain, Projektstatus: erst nach Commit, nur bei `applied:true`. Scheitert der Handoff, läuft der Fehler über **H** — nie über einen zweiten Apply auf denselben Job.

### B. `composer_finalize_lipsync_scene(_pipeline_job_id uuid, _external_job_id text, _write_id text, _processed_url text, _dialog_patch jsonb)`
- **Nur noch ein Write-ID:** `stitch:done`, Stage `audio_mux`, From-State ausschließlich `lipsync_muxing → complete`. `sso:applied` gibt es nicht mehr — der Sync-Direct-Final läuft vollständig über **F** (§5).
- Writes: `processed_video_url`, `clip_url`, `clip_status='ready'`, `lip_sync_applied_at=now()`, `clip_error=NULL`; Legacy-Spiegel `lip_sync_status='done'`, `twoshot_stage='done'`.
- `base_video_url` wird nicht aus dem Callback gesetzt; `lip_sync_source_clip_url` = bestehendes `base_video_url` der Scene.
- `_dialog_patch`: Allowlist `status`, `final_url`, `finished_at` — Top-Level-Merge via `jsonb_set`, kein Blob-Overwrite, `passes` unantastbar.
- Job: `succeeded`.

### C. `composer_enter_lipsync_mux(_pipeline_job_id uuid, _external_job_id text, _write_id text, _render_id text)`
- Write-ID geschlossen: `mux:dispatched`. Stage `audio_mux`. `_render_id` non-null Pflicht (`render_id_required`).
- From-State: **ausschließlich** `lipsync_running → lipsync_muxing`; `pipeline_substate='audio_mux'`; Legacy `lip_sync_status='audio_muxing'`, `twoshot_stage='audio_muxing'`; schmaler Patch `dialog_shots.audio_mux.render_id`/`dispatched_at`.
- **Kein Job-Statuswechsel:** der Job ist über `bindLedgerExternalJob(renderId)` an den Remotion-Render gebunden und wird später durch **B** (`stitch:done`) oder **D** (`stitch:failed`) geschlossen.
- **Keine Reaper-Garantie:** ein bereits gebundener `audio_mux`-Job ohne eintreffenden Callback ist nicht der Fall, den `composer_reap_orphaned_dispatches` abdeckt (dieser adressiert die ungebundene Dispatch-Phase). Diese Recovery ist ausdrücklich **G4/Watchdog-Restschuld**.
- Einziger Mux-State-Owner: `sync-so-webhook` ruft **C** nicht auf.

### D. `composer_fail_callback_scene(_pipeline_job_id uuid, _external_job_id text, _write_id text, _error_text text, _dialog_patch jsonb)`
Nur echte Provider-Callback-Failures mit gebundener External-ID, deren Job noch nicht terminal ist. Geschlossene Matrix:

| write_id | Stage | erlaubte From-States | → State / Substate | Legacy-Spiegel | Outputs | dialog_shots | Job |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ccw:failed` | base_video | `plate_queued`, `plate_rendering` | `failed` / `plate_failed` | `clip_status='failed'`, `clip_error`, `retry_count+1`; bei cinematic-sync `lip_sync_status=NULL`,`twoshot_stage=NULL`,`lip_sync_source_clip_url=NULL` | unverändert | `NULL` nur bei cinematic-sync | `failed` |
| `ccw:legacy_route_blocked` | base_video | `plate_ready`, `plate_rendering` | `failed` / `legacy_route_blocked` | `clip_status='failed'`, `clip_error`, `lip_sync_status=NULL`, `twoshot_stage=NULL` | `clip_url` bleibt | `NULL` | `failed` |
| `stitch:failed` | audio_mux | `lipsync_muxing` | `failed` / `stitch_failed` | `lip_sync_status='failed'`, `twoshot_stage='failed'` | unverändert | schmal: `status`,`error`,`finished_at` | `failed` |

`ccw:handoff_failed` gehört zu **H**, `mux:*` zu **G**, alle `sso:*`-Verdikte zu **F**. Ist der Job bereits `succeeded` und trifft ein Failure ein → `duplicate_callback`, **kein** Rollback. Ist er bereits `failed` und trifft ein Success ein → `attempt_superseded`; `complete` wird nie aus `failed` erreicht.

### E. `composer_touch_lipsync_progress(...)` — interner Helper, kein externer Aufruf
Kein eigener Callback-Besitz, **kein** `EXECUTE`-Grant nach außen. Wird ausschließlich **innerhalb von F** verwendet: bleibt zwingend in `lipsync_running`, patcht nur `twoshot_stage` (Regex `^syncso_fanout_\d+_of_\d+$`) und schmale `dialog_shots`-Top-Level-Keys. Terminalisiert nichts.

**Watchdog-Recover benutzt E nicht.** Der Recover-Pfad (`dialog_shots.status → 'rendering'`, `sync-so-webhook` L461) bekommt in G3.2.4 einen eigenen geschlossenen, gegrantneten RPC `composer_touch_lipsync_recover(_scene_id uuid, _run_id uuid, _plate_generation integer, _write_id text)`: run-/generation-gebundene Provenienz (kein Ledger-Job), From-State ausschließlich `lipsync_running`, einziger erlaubter Write `dialog_shots.status='rendering'`, kein Job-Write, keine Output-/Mirror-Änderung.

### F. `composer_apply_sync_segment_result(_pipeline_job_id uuid, _external_job_id text, _write_id text, _pass_idx integer, _pass_patch jsonb, _final_mode text, _final_verdict text, _processed_url text, _error_text text, _progress_patch jsonb)`
**Vollständiger und einziger Owner des Sync-Segment-Callback-Apply.** Ein Commit für Pass-Slot, Progress, Fan-in-Verdikt und Job-Terminalisierung. Nach F gibt es für denselben Job **niemals** einen zweiten Apply über B oder D.
- Write-IDs geschlossen: `sso:segment_succeeded`, `sso:segment_failed`. Stage `sync_segment`; zusätzlich `job.segment_id`/`job.speaker_id` gegen den adressierten Pass (`wrong_segment` → No-op).
- Ablauf unter gemeinsamem Lock: Job `FOR UPDATE` → Scene `FOR UPDATE` → Identitätsprüfung (§2) → Pass-Slot-Write mit der Logik von `update_dialog_pass_slot()` (`_pass_idx` + Allowlist-Patch, kein Whole-JSON, andere Passes unantastbar) → Fan-in-Auswertung **auf dem frisch geschriebenen Zustand** → Scene-Verdikt gemäß `_final_mode` → Job-Terminalstatus.
- **Zwei entkoppelte Wahrheiten (verbindlich):**
  - **Job-Terminalstatus** folgt ausschließlich `_write_id`: `sso:segment_succeeded` → `succeeded`, `sso:segment_failed` → `failed`. `_final_mode` hat darauf **keinen** Einfluss.
  - **Scene-Verdikt** folgt ausschließlich dem frisch gelockten Fan-in-Zustand aller Passes.
  - Die Kombination `sso:segment_succeeded` + `_final_mode='fail'` ist ausdrücklich **zulässig und erwartet** (letztes Segment erfolgreich, ein früheres bereits fehlgeschlagen): Job `succeeded`, Scene `failed`. Ebenso zulässig: `sso:segment_failed` + `_final_mode='progress'`/`'mux'` ist **nicht** zulässig für `mux` (Mux verlangt alle Passes erfolgreich), aber zulässig für `progress`.
- `_final_mode` geschlossen, vom Handler vorgeschlagen und im RPC gegen den tatsächlichen Fan-in-Zustand validiert (Mismatch → `final_mode_rejected`, No-op — auch der Pass-Write wird zurückgerollt):

| `_final_mode` | Vorbedingung (nach Pass-Write geprüft) | Scene-Wirkung |
| --- | --- | --- |
| `progress` | mindestens ein Pass noch nicht terminal | bleibt `lipsync_running`; nur Progress-Spiegel (E-Logik) |
| `mux` | alle Passes terminal **und alle erfolgreich**, Mux nötig (N≥2 oder single-tight) | bleibt `lipsync_running`, **kein** State-Write; Handler darf danach nur `try_claim_mux_dispatch` + `acquireLedgerJob('audio_mux')` + Dispatch ausführen |
| `finalize` | single, nicht-tight, kein Mux nötig, Pass erfolgreich, `_processed_url` non-null | `lipsync_running → complete`; `processed_video_url`, `clip_url`, `clip_status='ready'`, `lip_sync_applied_at=now()`, `clip_error=NULL`, `lip_sync_status='applied'`, `twoshot_stage='complete'`, `lip_sync_source_clip_url` = bestehendes `base_video_url` |
| `fail` | alle Passes terminal, mindestens einer fehlgeschlagen bzw. Ladder/Partial-Verdikt | `lipsync_running → failed`, Substate + Spiegel nach `_final_verdict` (s. u.) |


- Geschlossene `_final_verdict`-Werte für `_final_mode='fail'`:

| `_final_verdict` | Substate | Legacy-Spiegel | dialog_shots (schmal) |
| --- | --- | --- | --- |
| `sso:failed` | `lipsync_failed` | `lip_sync_status='failed'`, `twoshot_stage='failed'`, `clip_error` | `status`,`error`,`finished_at`,`refunded` |
| `sso:noop_unrecoverable` | `needs_clip_rerender` | `lip_sync_status='failed'`, `twoshot_stage='needs_clip_rerender'`, `clip_error` | wie oben |
| `sso:partial_mux_refused` | `partial_mux_refused` | wie `sso:failed` + `partial_done_count`, `partial_failed_speakers` | wie oben |

- Outputs bleiben in allen Fail-Modi unverändert; `passes[]` wird nie als Blob überschrieben.
- Rückgabe zusätzlich `{final_mode_applied, all_passes_terminal, done_count, failed_count}` — ausschließlich als Steuerinformation für Post-Commit-Arbeit (Mux-Claim, Refund, Benachrichtigung), nie als Trigger für einen zweiten Scene-Apply.

### G. `composer_fail_internal_dispatch(_pipeline_job_id uuid, _write_id text, _error_text text, _dialog_patch jsonb)`
Job-gebundener Internal-Failure-Vertrag **ohne** External-ID-Voraussetzung.
- Kein `_external_job_id`-Parameter. Geprüft: Job existiert, `stage='audio_mux'`, `job.run_id = scene.active_run_id`, `job.plate_generation = scene.plate_generation`, Job nicht terminal, `replaced_by IS NULL`.
- Write-IDs geschlossen: `mux:preflight_failed` (From `lipsync_running`, Substate `mux_preflight_failed`, Legacy `lip_sync_status='failed'`/`twoshot_stage='failed'`, `dialog_shots`-Allowlist `status`,`error`,`preflight`) und `mux:invoke_failed` (From `lipsync_running`,`lipsync_muxing`, Substate `mux_invoke_failed`, Legacy `lip_sync_status='failed'`/`twoshot_stage='audio_mux_failed'`, `audio_mux`-Key entfernt).
- **Einziger Ledger-Owner:** G setzt Scene-Fail und Job-`failed` (`error_code` = Write-ID) in einem Commit; `settleLedgerDispatchFailure()` für denselben Job entfällt im Handler.
- `video_renders.update(failed)` bleibt Handler-Arbeit nach Commit.

### H. `composer_fail_post_plate_handoff(_scene_id uuid, _run_id uuid, _plate_generation integer, _write_id text, _error_text text)`
Der Plate-Job ist hier legitim bereits `succeeded`; ein zweiter Apply darauf wäre zwingend `duplicate_callback`. Der Handoff-Fehler ist deshalb kein Provider-Callback:
- Kein `_pipeline_job_id`. Provenienz über `_run_id = scene.active_run_id` **und** `_plate_generation = scene.plate_generation` (sonst `stale_run`/`stale_generation`, No-op).
- Write-ID geschlossen: `ccw:handoff_failed`. From-State ausschließlich `plate_ready` → `failed` / Substate `handoff_failed`.
- Legacy-Spiegel `lip_sync_status='failed'`, `twoshot_stage='failed'`; Plate-Outputs (`base_video_url`, `clip_url`, `clip_status='ready'`) und `dialog_shots` bleiben unverändert.
- Kein Job-Write. Eine eigene Handoff-Stage wird bewusst nicht eingeführt: die `stage`-CHECK-Allowlist (`base_video, audio_plan, tts, preclip, sync_segment, audio_mux, final_render`) bleibt unangetastet.

## 4. Callback vor `external_job_id`-Bindung

Entscheidung: **fail-closed + retrybar**, kein Binden aus dem Callback.
- Prüfreihenfolge normativ: `external_job_id IS NULL` **vor** dem Wertvergleich, damit der NULL-Fall nie als `wrong_job` fehlklassifiziert wird.
- Provenienz: Binden aus dem Callback würde die Payload zur zweiten Provenienzquelle machen und die Ledger-Immutabilität aufweichen.
- Telemetrie: G3.1 hat über das gesamte Post-T0-Fenster `binding_pending = 0` gemessen.
- Provider-Semantik: Replicate, Sync.so und Remotion stellen Webhooks erneut zu; ein `409 binding_pending` wird wiederholt.
- Handler: HTTP 409, `applied:false`, `verdict='binding_pending'`, Observation wie in G3.1, keine Scene-Mutation.

## 5. Fan-in-Invarianten (Multi-Speaker)

`passes[]` wird ausschließlich innerhalb von **F** geschrieben; `update_dialog_pass_slot()` bleibt die Schreiblogik, wird aber nie mehr direkt aus einem Handler aufgerufen. Szene bleibt `lipsync_running`, bis F selbst `finalize`, `mux` oder `fail` entscheidet. Genau ein Mux-Gewinner über `try_claim_mux_dispatch` **und** `acquireLedgerJob` (`already_in_flight` → Abbruch). Der Whole-JSON-Fallback entfällt ersatzlos. **F → B auf demselben Job ist verboten**; der Single-Final-Pfad ist F (`finalize`), B gehört ausschließlich dem Remotion-Stitch.

## 6. Handler → RPC-Mapping (Ziel)

```text
compose-clip-webhook             plate success  → A
                                 plate failure  → D(ccw:failed | ccw:legacy_route_blocked)
                                 handoff (post-commit) → H
                                 retry → G3.1 replace
sync-so-webhook                  jeder Segment-Callback → F(progress | mux | finalize | fail)
                                 nach F(mux) → try_claim_mux_dispatch + Ledger + Dispatch
render-sync-segments-audio-mux   dispatch → C(mux:dispatched)
                                 interner Fail → G(mux:preflight_failed | mux:invoke_failed)
remotion-webhook (dialog-stitch) success → B(stitch:done) | failure → D(stitch:failed)
```

## 7. DB-Smoke-Matrix (transaktional, mit Rollback)

Für jeden job-gebundenen RPC: `current job success → applied` · `stale run` · `stale generation` · `wrong external job` · `wrong stage` · `wrong from-state` · `duplicate callback` · `binding_pending` (NULL-Bindung nie als `wrong_job`) · zwei parallele Callbacks (`FOR UPDATE`) → genau ein Apply · Failure nach Success → kein Rollback · RPC-Fehler nach Scene-Mutation → vollständiger Rollback inkl. Job · bei Rejection Outputs/Mirrors/`updated_at` unverändert.

Zusätzlich:
- **F:** Pass-Write und Job-Terminalstatus sind in derselben Transaktion sichtbar; künstlicher Fehler nach dem Slot-Write rollt Pass **und** Job zurück; `_final_mode` gegen den realen Fan-in-Zustand (falscher Modus → No-op); letzter fehlgeschlagener Pass mit `fail` setzt Scene-Fail **im selben Commit**; `finalize` nur bei single/non-tight; `mux` schreibt keinen Scene-State; `passes[]` anderer Speaker byte-identisch; kein B/D-Aufruf auf einen von F terminalisierten Job (Code-Grep + Runtime-Test).
- **G:** Fail ohne `external_job_id` → `applied:true`; fremdes `run_id`/`plate_generation` → No-op; kein zweiter `settleLedgerDispatchFailure()` auf denselben Job (Grep-Test).
- **H:** run-bound Apply nach `succeeded` Plate-Job → `applied:true`; veraltetes `run_id` → No-op; Plate-Outputs bleiben erhalten.
- **Global:** kein RPC schreibt den String `completed`; kein Whole-JSON-`dialog_shots` mehr im Code.

## 8. Umsetzungsreihenfolge (kleine Blöcke, STOP nach jedem)

| Block | Inhalt | STOP-Gate |
| --- | --- | --- |
| G3.2.1 | Migration A + H + D-Zeilen `ccw:*`; `compose-clip-webhook` umstellen | Smokes A/H/D-ccw, Frozen-Suite, `tsgo`, `deno check` → STOP |
| G3.2.2 | Migration C + G; `render-sync-segments-audio-mux` umstellen, doppelten Ledger-Settle entfernen | Smokes C/G, Mux-Owner-Test → STOP |
| G3.2.3 | Migration B + D (`stitch:failed`); `remotion-webhook` umstellen | Smokes B/D-stitch, Base-URL-Invariante → STOP |
| G3.2.4 | Migration E + F; `sync-so-webhook` vollständig auf F umstellen, Whole-JSON-Fallback entfernen | Smokes F (alle vier Modi), Fan-in-Matrix, kein Whole-JSON → STOP |
| G3.2.5 | Deploy aller berührten Functions, neues T0, Drain-Beobachtung über `composer_callback_observations` | Post-T0 0/0/0 je Kanal → Abnahme |

Restschulden außerhalb des Scopes: `watchdog_no_prediction_id` sowie die Recovery gebundener Jobs ohne eintreffenden Callback (G4/Watchdog). G3.1-Artefakte (Observe-Telemetrie, Reaper, Acquire/Replace, Ledger-Immutabilität) bleiben unverändert.
