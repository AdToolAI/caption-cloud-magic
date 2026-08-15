# v431 G3.2 — Callback-Apply-Migration: autoritativer Implementierungsvertrag

Analyse-Ergebnis + Endvertrag. Keine Migration, kein Code, kein Deploy in diesem Schritt. G3.0b/G3.1 bleiben unverändert frozen; `composer_fail_scene_with_mirrors`, `composer_finalize_talking_head`, `composer_finalize_upload_scene` werden nicht angefasst.

## 1. Writer-Inventar (Ist-Zustand, verifiziert am Code)

### compose-clip-webhook (803 Z.)
| Pfad | heutige Writes | Ziel |
| --- | --- | --- |
| success | `composer_scenes.update` (L282): `materializeCompatibilityOutput('base')` → `base_video_url`+`clip_url`, `continuityRenderedPatch`, `clip_status='ready'`, `clip_error=null`, ggf. `lip_sync_status='pending'`/`twoshot_stage='master_clip'`, `audio_plan.ambientGate` | **A** `composer_finalize_plate_scene` |
| success/nachgelagert | `video_creations` Archiv, Continuity-Chain, `composer_projects.status` (L780) | bleibt Handler, **nach** Commit, nur bei `applied:true` |
| handoff-fail | `update{lip_sync_status:'failed',twoshot_stage:'failed'} .eq(clip_status,'ready')` (L503) | **D** `ccw:handoff_failed` |
| legacy talking-head block | `update{clip_status:'failed',clip_error,…, dialog_shots:null}` (L532) | **D** `ccw:legacy_route_blocked` |
| failed | `update{clip_status:'failed',retry_count,clip_error, ggf. lip_sync_status/twoshot_stage/dialog_shots=null}` (L683) + Refund + Chain-Release | **D** `ccw:failed`; Refund/Chain nach Commit |
| auto-retry | `replaceLedgerAttempt` + `update{clip_status:'generating',retry_count,replicate_prediction_id}` (L645) | G3.1-Retry-Vertrag, **unverändert** |
| stale | L139 Run/Generation-Gate, `guardCallback`, `observeCallbackProvenance` | Gate wandert in RPC; Observe bleibt |

### sync-so-webhook (1852 Z.)
| Pfad | heutige Writes | Ziel |
| --- | --- | --- |
| pass done, Fan-in offen | `update_dialog_pass_slot` + `update{lip_sync_status:'running',twoshot_stage:'syncso_fanout_x_of_n'}` (L1073/L1084) | Slot-RPC bleibt; Top-Level-Spiegel via **E** `composer_touch_lipsync_progress` (kein State-Wechsel) |
| Fallback bei RPC-Fehler | Whole-JSON `dialog_shots`-Rewrite (L1096) | **entfällt ersatzlos** (G3.0b §4) |
| single, nicht-tight | Whole-JSON `dialog_shots` + `materializeCompatibilityOutput('processed')` + `clip_status='ready'`, `lip_sync_status='applied'`, `lip_sync_applied_at`, `twoshot_stage='complete'` (L1144) | **B** `sso:applied` |
| single-tight / N≥2 all done | `try_claim_mux_dispatch` + Whole-JSON `status:'audio_muxing'` + `lip_sync_status='audio_muxing'` (L1201) + `acquireLedgerJob(audio_mux)` + Dispatch | **State-Write entfällt hier** (G3.0b §6): nur Claim + Ledger + Dispatch |
| noop-ladder exhausted | Slot-RPC + `update{lip_sync_status:'failed',twoshot_stage:'needs_clip_rerender',clip_error}` (L809) | **D** `sso:noop_unrecoverable` |
| partial-mux refused (≥3) | Whole-JSON + `lip_sync_status/twoshot_stage='failed'` + Wallet-Direktschreibung (L1035/L1042) | **D** `sso:partial_mux_refused`; Refund nach Commit über Refund-RPC, **nie** direktes `wallets.update` |
| failed/rejected/canceled | Slot-Patches, Retry-Ladder, Whole-JSON-Fails (L1493/L1704/L1780/L1806) | **D** `sso:failed` + Slot-RPC |
| watchdog-recover | `update{dialog_shots:{...,status:'rendering'}}` (L461) | **E**, schmaler Patch |

### render-sync-segments-audio-mux (994 Z.)
| Pfad | heutige Writes | Ziel |
| --- | --- | --- |
| preflight fail | `update{lip_sync_status/twoshot_stage:'failed',clip_error, dialog_shots Whole-JSON}` (L753) | **D** `mux:preflight_failed` |
| dispatch | `video_renders.insert`, `resolveLedgerDispatch`, `bindLedgerExternalJob(renderId)`, dann `update{dialog_shots.audio_mux.render_id, lip_sync_status/twoshot_stage:'audio_muxing'}` (L916) | **C** `composer_enter_lipsync_mux` (nach `bindLedgerExternalJob`, vor Lambda-Invoke) |
| invoke fail | `video_renders.update(failed)` + Whole-JSON-Rollback + `lip_sync_status='failed'` (L961) + `settleLedgerDispatchFailure` | **D** `mux:invoke_failed`; Ledger-Settle bleibt G3.1 |

### remotion-webhook / dialog-stitch (878 Z.)
| Pfad | heutige Writes | Ziel |
| --- | --- | --- |
| stitch success | `video_renders.update`, dann unter `withDialogLock`: `materializeCompatibilityOutput('processed', {baseUrl: prevState.source_clip_url})`, `clip_status='ready'`, `lip_sync_source_clip_url`, `lip_sync_applied_at`, `lip_sync_status='done'`, `twoshot_stage='done'`, Whole-JSON `dialog_shots` (L291) | **B** `stitch:done`; `baseUrl` **nicht** aus `dialog_shots`, sondern serverseitig aus Scene/Run (G3.0b §5) |
| stitch fail | `update{lip_sync_status:'failed', dialog_shots Whole-JSON}` + `increment_balance` (L679) | **D** `stitch:failed`; Refund nach Commit |
| preclip success/fail | Shot-Array-Patch (L250/L640) | **außerhalb G3.2** (kein Scene-State), bleibt `withDialogLock` |
| DC / Exporte / Sora / UVC | eigene Tabellen | **außerhalb G3.2** |

## 2. Finale RPC-Verträge

Alle neu: `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, schema-qualifiziert, `REVOKE ALL FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE TO service_role`. Reihenfolge in jedem RPC: `SELECT … FROM composer_pipeline_jobs WHERE id=_pipeline_job_id FOR UPDATE` → `SELECT … FROM composer_scenes WHERE id=job.scene_id FOR UPDATE` → Identitätsprüfung → From-State-Matrix → Writes → Job-Terminalisierung → Return. Rückgabe einheitlich `jsonb`: `{applied, verdict, scene_id, run_id, plate_generation, stage, job_status}`. Jeder Versuch (applied **und** rejected) schreibt eine Audit-Zeile.

Identitätsprüfung (identisch in allen vier):
1. Job existiert, `stage` = erwartete Stage → sonst `wrong_stage`.
2. `_external_job_id` = `job.external_job_id` → sonst `wrong_job`.
3. `job.external_job_id IS NULL` → `binding_pending` (siehe §3).
4. `job.run_id = scene.active_run_id` → sonst `stale_run`.
5. `job.plate_generation = scene.plate_generation` → sonst `stale_generation`.
6. Job bereits terminal `completed` → `duplicate_callback` (No-op, `applied:false`).
7. Job terminal `failed`/`stale`/`replaced_by IS NOT NULL` → `attempt_superseded`.

### A. `composer_finalize_plate_scene(_pipeline_job_id uuid, _external_job_id text, _write_id text, _base_video_url text, _clip_source_hint text, _extra jsonb)`
- Write-ID geschlossen: nur `ccw:plate-complete`. Stage `base_video`.
- From-State: **ausschließlich** `plate_rendering` → `plate_ready`. `plate_queued` → `from_state_rejected` (No-op).
- Writes: `base_video_url`, `clip_url`, `clip_status='ready'`, `clip_error=NULL`, Continuity-Stempel + `audio_plan.ambientGate` als schmale Keys aus `_extra` (Allowlist: `continuity_rendered_*`, `audio_plan.ambientGate`, `lip_sync_status='pending'`, `twoshot_stage='master_clip'`). `processed_video_url` bleibt unberührt.
- Job: `completed`. Audit über `composer_scene_transition_v2`-Pfad.
- Handoff (`compose-twoshot-audio` → `compose-dialog-segments`), Archiv, Continuity-Chain, Projektstatus: erst nach Commit, nur bei `applied:true`.

### B. `composer_finalize_lipsync_scene(_pipeline_job_id uuid, _external_job_id text, _write_id text, _processed_url text, _dialog_patch jsonb)`
- Geschlossene Matrix: `sso:applied` nur `lipsync_running → complete` (Stage `sync_segment`); `stitch:done` nur `lipsync_muxing → complete` (Stage `audio_mux`).
- Writes: `processed_video_url`, `clip_url`, `clip_status='ready'`, `lip_sync_applied_at=now()`, `clip_error=NULL`; Legacy-Spiegel `lip_sync_status='applied'|'done'`, `twoshot_stage='complete'|'done'` je Write-ID.
- `base_video_url` wird **nicht** aus dem Callback gesetzt; `lip_sync_source_clip_url` = bestehendes `base_video_url` der Scene.
- `_dialog_patch`: Allowlist `status`, `final_url`, `sync_so_url`, `finished_at` — Top-Level-Merge via `jsonb_set`, kein Blob-Overwrite, `passes` unantastbar.
- Job: `completed`.

### C. `composer_enter_lipsync_mux(_pipeline_job_id uuid, _external_job_id text, _write_id text, _render_id text)`
- Write-ID geschlossen: `mux:dispatched`. Stage `audio_mux`. `_render_id` non-null Pflicht (`render_id_required`).
- From-State: **ausschließlich** `lipsync_running → lipsync_muxing`; `pipeline_substate='audio_mux'`; Legacy `lip_sync_status='audio_muxing'`, `twoshot_stage='audio_muxing'`; `dialog_shots.audio_mux.render_id`/`dispatched_at` als schmaler Patch.
- **Job-Lifecycle-Entscheidung:** der `audio_mux`-Ledger-Job wird hier **nicht** terminalisiert. Er ist über `bindLedgerExternalJob(renderId)` an genau den Remotion-Render gebunden, dessen Callback ihn später über **B** (`stitch:done`) oder **D** (`stitch:failed`) schließt. Terminalisierung hier würde Regel 2 (Apply + terminaler Claim atomar) für den Remotion-Callback unmöglich machen und den Reaper blind stellen. Bleibt der Callback aus, greift der bestehende `dispatch_uncertain`-Reaper.
- Einziger Mux-State-Owner: `sync-so-webhook` ruft C **nicht** auf.

### D. `composer_fail_callback_scene(_pipeline_job_id uuid, _external_job_id text, _write_id text, _error_text text, _dialog_patch jsonb)`
Keine frei übergebbaren From-States, keine Clear-Flags. Geschlossene Matrix:

| write_id | Stage | erlaubte From-States | → State / Substate | Legacy-Spiegel | Outputs | dialog_shots | Job |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ccw:failed` | base_video | `plate_queued`, `plate_rendering` | `failed` / `plate_failed` | `clip_status='failed'`, `clip_error`, `retry_count+1`; bei cinematic-sync `lip_sync_status=NULL`,`twoshot_stage=NULL`,`lip_sync_source_clip_url=NULL` | unverändert | `NULL` nur bei cinematic-sync | `failed` |
| `ccw:handoff_failed` | base_video | `plate_ready` | `failed` / `handoff_failed` | `lip_sync_status='failed'`, `twoshot_stage='failed'` | **unverändert** (`clip_status='ready'` bleibt) | unverändert | `completed` (Plate war erfolgreich) |
| `ccw:legacy_route_blocked` | base_video | `plate_ready`, `plate_rendering` | `failed` / `legacy_route_blocked` | `clip_status='failed'`, `clip_error`, `lip_sync_status=NULL`, `twoshot_stage=NULL` | `clip_url` bleibt | `NULL` | `failed` |
| `sso:failed` | sync_segment | `lipsync_running` | `failed` / `lipsync_failed` | `lip_sync_status='failed'`, `twoshot_stage='failed'`, `clip_error` | unverändert | schmal: `status`,`error`,`finished_at`,`refunded` | `failed` |
| `sso:noop_unrecoverable` | sync_segment | `lipsync_running` | `failed` / `needs_clip_rerender` | `lip_sync_status='failed'`, `twoshot_stage='needs_clip_rerender'`, `clip_error` | unverändert | schmal | `failed` |
| `sso:partial_mux_refused` | sync_segment | `lipsync_running` | `failed` / `partial_mux_refused` | wie `sso:failed` + `partial_done_count`, `partial_failed_speakers` | unverändert | schmal | `failed` |
| `mux:preflight_failed` | audio_mux | `lipsync_running` | `failed` / `mux_preflight_failed` | `lip_sync_status='failed'`, `twoshot_stage='failed'` | unverändert | schmal: `status`,`error`,`preflight` | `failed` |
| `mux:invoke_failed` | audio_mux | `lipsync_running`, `lipsync_muxing` | `failed` / `mux_invoke_failed` | `lip_sync_status='failed'`, `twoshot_stage='audio_mux_failed'` | unverändert | schmal + `audio_mux` entfernt | `failed` (Ledger-Settle bleibt G3.1) |
| `stitch:failed` | audio_mux | `lipsync_muxing` | `failed` / `stitch_failed` | `lip_sync_status='failed'`, `twoshot_stage='failed'` | unverändert | schmal | `failed` |

Ist der Job bereits `completed` und trifft ein Failure ein → `duplicate_callback`, **kein** Rollback auf `failed`. Ist der Job bereits `failed` und trifft ein Success ein → nur der in der Matrix erlaubte From-State entscheidet; `complete` wird nie aus `failed` erreicht (No-op `from_state_rejected`).

### E. `composer_touch_lipsync_progress(_pipeline_job_id uuid, _external_job_id text, _write_id text, _dialog_patch jsonb, _twoshot_stage text)`
Fan-in-Fortschritt ohne State-Wechsel: prüft dieselbe Identität, bleibt zwingend in `lipsync_running`, patcht nur `twoshot_stage` (Regex `^syncso_fanout_\d+_of_\d+$` oder `rendering`) und die schmalen `dialog_shots`-Top-Level-Keys. Terminalisiert **keinen** Job. Segmentstatus bleibt ausschließlich bei `update_dialog_pass_slot()`.

## 3. Callback vor `external_job_id`-Bindung

Entscheidung: **fail-closed + retrybar**, kein Binden aus dem Callback.
- Begründung Provenienz: Binden aus dem Callback würde die Payload zur zweiten Provenienzquelle machen und Regel 1 sowie die Ledger-Immutabilität aufweichen.
- Begründung Telemetrie: G3.1 hat über das gesamte Post-T0-Fenster `binding_pending = 0` gemessen — der Fall ist real nicht aufgetreten; ein Sonderpfad hätte keinen Nutzen, aber vollen Angriffs-/Fehlerraum.
- Begründung Provider-Semantik: Replicate, Sync.so und Remotion liefern Webhooks mit Wiederholung; ein `409 binding_pending` wird erneut zugestellt. Nach Ablauf greift der bestehende `dispatch_uncertain`-Reaper.
- Handler-Verhalten: HTTP 409, `applied:false`, `verdict='binding_pending'`, Observation wie in G3.1; keine Scene-Mutation.

## 4. Fan-in-Invarianten (Multi-Speaker)

`update_dialog_pass_slot()` bleibt alleinige Autorität für Segmentstatus. Szene bleibt `lipsync_running` bis alle Passes terminal sind. Genau ein Mux-Dispatch-Gewinner über `try_claim_mux_dispatch` **und** `acquireLedgerJob` (`already_in_flight` → Abbruch). Kein Handler schreibt `passes[]` außerhalb des Slot-RPC; der Whole-JSON-Fallback wird ersatzlos entfernt.

## 5. Handler → RPC-Mapping (Ziel)

```text
compose-clip-webhook            success → A | failure → D(ccw:*)      | retry → G3.1 replace
sync-so-webhook                 pass    → E | single-final → B(sso:applied)
                                fan-in  → claim + Ledger + Dispatch (kein State-Write)
                                failure → D(sso:*)
render-sync-segments-audio-mux  dispatch→ C(mux:dispatched)           | failure → D(mux:*)
remotion-webhook (dialog-stitch) success→ B(stitch:done)              | failure → D(stitch:failed)
```

## 6. DB-Smoke-Matrix (je RPC A–G, transaktional, mit Rollback)

`current job success → applied` · `stale run → No-op` · `stale generation → No-op` · `wrong external job → No-op` · `wrong stage → No-op` · `wrong from-state → No-op` · `duplicate callback → No-op` · `binding_pending → No-op/409` (auch: NULL-Bindung wird **nicht** als `wrong_job` klassifiziert) · zwei parallele Completion-Callbacks (`FOR UPDATE`) → genau ein Apply · Failure nach Success → kein Rollback auf `failed` · Success nach terminalem Failure → gemäß Matrix · RPC-Fehler nach Scene-Mutation → vollständiger Rollback inkl. Job · kein Whole-JSON-`dialog_shots` (Vergleich `passes[]` byte-identisch) · bei Rejection Outputs/Mirrors/`updated_at` vollständig unverändert · Fan-in-Barriere: Szene bleibt `lipsync_running`, genau ein Mux-Gewinner.

Zusätzliche Smokes aus den fünf geschlossenen Punkten:
- **F (Segment-Apply):** Pass-Slot-Write und Job-`succeeded` sind in derselben Transaktion sichtbar; künstlicher Fehler nach dem Slot-Write rollt Pass **und** Job zurück; zweiter identischer Callback → `duplicate_callback`, `passes[]` unverändert; letzter Pass setzt `all_passes_terminal:true` genau einmal.
- **G (Internal Failure):** Preflight-Fail ohne `external_job_id` → `applied:true`; derselbe Aufruf mit fremdem `run_id`/`plate_generation` → No-op; `mux:invoke_failed` terminalisiert den Job genau einmal, ein zusätzlicher `settleLedgerDispatchFailure()` auf denselben Job ist im Code nicht mehr vorhanden (Grep-Test).
- **Post-Plate-Handoff:** `ccw:handoff_failed` gegen den bereits `succeeded` Plate-Job → Vertragsverletzung (RPC existiert dafür nicht); run-bound Aufruf mit veraltetem `run_id` → No-op; Plate-Outputs bleiben nach Handoff-Fail vollständig erhalten.
- **Terminalstatus:** kein RPC schreibt jemals den String `completed`; Statuswerte bleiben in der bestehenden CHECK-Allowlist.

## 7. Umsetzungsreihenfolge (kleine Blöcke, STOP nach jedem)

| Block | Inhalt | STOP-Gate |
| --- | --- | --- |
| G3.2.1 | Migration A + `composer_fail_post_plate_handoff` + D-Zeilen `ccw:failed`/`ccw:legacy_route_blocked`; Handler `compose-clip-webhook` umstellen | Smokes A/D-ccw/Post-Plate grün, Frozen-Suite, `tsgo`, `deno check` → STOP |
| G3.2.2 | Migration C + G (`mux:preflight_failed`, `mux:invoke_failed`); `render-sync-segments-audio-mux` umstellen, doppelten Ledger-Settle entfernen | Smokes C/G, Mux-Owner-Test (genau ein Ledger-Owner) → STOP |
| G3.2.3 | Migration B (`stitch:done`) + D (`stitch:failed`); `remotion-webhook` umstellen | Smokes B/D-stitch, Base-URL-Invariante → STOP |
| G3.2.4 | Migration F + B (`sso:applied`) + D-Zeilen `sso:*`; `sync-so-webhook` umstellen, Whole-JSON-Fallback entfernen | Smokes F/B/D-sso, Fan-in-Matrix, kein Whole-JSON → STOP |
| G3.2.5 | Deploy aller berührten Functions, neues T0, Drain-Beobachtung über `composer_callback_observations` | Post-T0 0/0/0 je Kanal → Abnahme |

Restschulden außerhalb des Scopes: `watchdog_no_prediction_id` sowie die Recovery gebundener Jobs ohne eintreffenden Callback (G4/Watchdog). G3.1-Artefakte (Observe-Telemetrie, Reaper, Acquire/Replace, Ledger-Immutabilität) bleiben unverändert.

