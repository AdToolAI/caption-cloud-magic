# v431 RS3 — Option A: Atomic Lip-Sync Reset Cancellation (Rev. 3)

Status: IMPLEMENTATION PLAN — awaiting GO. Kein Deploy, kein Produktions-Resmoke, kein Cleanup historischer Rows.

Dieses Dokument ist der einzige gültige RS3-Vertrag. Rev. 1 (additiver Zweig in `composer_acquire_pipeline_attempt`) ist verworfen und in dieser Datei nicht mehr enthalten.

## Belegte Ausgangslage

- `composer_acquire_pipeline_attempt` (G3.1b, `20260815084640_…sql`): aktiver Vorgänger ⇒ `already_in_flight`; **jeder** terminale Vorgänger ⇒ `predecessor_exists`. Initial-Acquire erzeugt nie Attempt > 1. Bleibt **frozen**.
- Statusmengen (`_shared/composer-pipeline-jobs.ts`): `NON_TERMINAL_STATUSES = pending, dispatching, dispatched, running, callback_processing`; `TERMINAL_STATUSES = succeeded, failed, cancelled, stale`. `dispatch_uncertain` ist dort bewusst in keiner der beiden Listen.
- `adoptPreAcquiredLedgerJob()` (`_shared/v431-ledger.ts`) adoptiert eine vorab erzeugte Zeile (`pending|dispatching`, kein `external_job_id`, kein `replaced_by`, Identitätsprüfung scene/stage/run/generation); `compose-dialog-segments` nutzt sie bei gesetztem `body.pipeline_job_id` (§5961 ff.).
- `composer_apply_sync_segment_result` (`20260815185301_…sql`, Z. 419) noopt bereits bei `cancelled`.
- `reset-lipsync-scene` schreibt `dialog_shots: null` und ein **komplett neu gebautes** `audio_plan`-Objekt (Key-Deletes auf `twoshot`, übrige Keys bleiben erhalten) — der Rearm-Pointer darf deshalb nicht in `dialog_shots` liegen und muss nach der Reset-Mutation geschrieben werden (§3).
- Beide Blockade-Aufrufer (`reset-lipsync-scene`, Direct-Clear-Zweig in `resetSceneLipSync()`) berühren den Ledger heute nicht und erneuern weder Run noch Generation.

## 1. Ein DB-Primitive, ein Commit

Neu: `composer_reset_lipsync_with_attempt_cancellation(_scene_id uuid, _expected_run_id uuid, _expected_plate_generation integer)`

- `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, keine Defaults, keine Overloads, schema-qualifizierte Referenzen.
- Besitzt die komplette DB-seitige Reset-Transaktion:
  1. Kandidaten-Jobs `FOR UPDATE` (deterministisch nach `id`)
  2. `composer_scenes FOR UPDATE`
  3. Guard `active_run_id` + `plate_generation` ⇒ sonst `stale_reset`, kein Write
  4. offene Lip-Sync-Attempts (`sync_segment`, `audio_mux`) auf `cancelled` / `error_code='user_reset'` terminalisieren
  5. Pass-/Mux-Runtime-Bindings des verworfenen Laufs zurücksetzen
  6. bestehende Lip-Sync-Reset-Semantik anwenden (Feldsatz exakt wie heute in `reset-lipsync-scene`)
  7. Rearm-Nachfolger für `sync_segment` erzeugen und Pointer **zuletzt** persistieren (§3)
  8. Audit
- Rückgabe: `{ ok, outcome, canceled_job_ids[], external_job_ids[], rearmed[] }`.
- `base_video` wird nie angefasst; kein Run-Wechsel, kein Generation-Bump, Plate bleibt erhalten, kein bezahlter Neurender.
- GRANT nur `service_role`; `REVOKE ALL` von `PUBLIC`, `anon`, `authenticated`.

`reset-lipsync-scene` macht danach nur noch Auth/Ownership, den RPC-Aufruf und **nach** dem Commit best-effort Provider-Cancels über die zurückgegebenen External-IDs plus den bestehenden idempotenten Credit-Refund. Keine eigenen Scene-Writes mehr.

`src/lib/lipsyncReset.ts::resetSceneLipSync()` verliert den Direct-Clear-Zweig vollständig: kein Client-Write auf `composer_scenes`, immer derselbe Edge→RPC-Pfad, sonst fail-closed.

## 2. Reset-Rearm-Vertrag (beide Stages)

`composer_acquire_pipeline_attempt` und `composer_replace_pipeline_attempt` bleiben unverändert/frozen; `user_reset` kommt **nicht** in `composer_retryable_failure_reasons()`.

### 2a. `sync_segment` — Pre-Acquire + Adoption

Die Reset-Transaktion erzeugt pro verworfenem Segment genau einen Nachfolger: gleiche Identität `(scene, run, stage, generation, segment)`, `attempt_no + 1`, `status='pending'`, `external_job_id=NULL`, `replaced_by=NULL`, Metadata `ledger_source='v431_rs3_reset_rearm'`, `rearm_of=<vorgänger_id>`. Concurrency-safe über die Identity-Unique-Constraint plus die Row-Locks; bei verlorenem Rennen wird die existierende Zeile zurückgegeben, nie ein zweiter Nachfolger.

`compose-dialog-segments` adoptiert diesen Nachfolger über den bestehenden `adoptPreAcquiredLedgerJob()`-Pfad statt `resolveLedgerDispatch()` (§3 regelt Pointer und Fehlerfälle).

### 2b. `audio_mux` — On-Demand-Rearm beim Mux-Dispatch

Kein vorerzeugter Mux-Job (er läge bis zum Fan-in ungebunden herum und fiele dem Reaper zu). Stattdessen neues, eng geschlossenes Primitive:

`composer_acquire_reset_rearmed_attempt(_scene_id, _run_id, _stage, _plate_generation, _segment_id, _provider, _metadata)`

- Erfolgt **nur**, wenn der jüngste Attempt derselben Identität `cancelled` mit `error_code='user_reset'` ist und die Reset-Autorisierung für diese Identität vorliegt (Reset-Marker aus derselben Reset-Transaktion, siehe §3).
- Erzeugt genau `attempt_no + 1`, concurrency-safe über die Identity-Unique-Constraint; sonst Outcome `rearm_not_authorized` (kein Write).
- Wird ausschließlich von den migrierten Dispatchern benutzt: dem Mux-Dispatch (`dispatchAudioMux` in `_shared/v431-ledger.ts`, aufgerufen aus dem Fan-in `dispatch_mux`-Pfad) und — als Fail-closed-Rückfall — vom Sync-Dispatch, wenn ein Pre-Acquire-Nachfolger fehlt.
- `service_role`-only, `SECURITY DEFINER`, `search_path = pg_catalog, public`, keine Defaults, keine Overloads.

## 3. Rearm-Pointer- und Autorisierungs-Lifecycle

- Der Reset-Marker liegt in `audio_plan.twoshot.rs3_reset` (`{ run_id, plate_generation, reset_at, sync: { <segment_id>: <job_id> }, mux_rearm_allowed: true }`) und wird **nach** allen Reset-Mutationen im selben Commit geschrieben — belegt notwendig, weil die Reset-Semantik `audio_plan` als Ganzobjekt neu schreibt und `dialog_shots` auf `null` setzt.
- `sync_segment`-Pointer wird beim erfolgreichen Adopt einmalig konsumiert (Eintrag entfernt).
- `mux_rearm_allowed` wird beim erfolgreichen Mux-Rearm konsumiert.
- Der Marker gilt nur für exakt `run_id` + `plate_generation` des Resets.

Fehlerregeln (nicht großzügig):
- **Stale Run/Generation** (Marker passt nicht mehr zur Szene) ⇒ Marker verwerfen, normaler `resolveLedgerDispatch()`-Pfad ist zulässig.
- **Gleicher Run/Generation, Adoption unerwartet nicht möglich** (`preacquired_already_bound`, `preacquired_not_dispatchable`, Zeile fehlt) ⇒ **fail closed** mit spezifischem RS3-Fehler `rs3_rearm_unavailable`; **kein** stiller Rückfall auf den Initial-Acquire, der garantiert in `predecessor_exists` liefe. Optional zulässig ist ausschließlich der autorisierte On-Demand-Rearm aus §2b.

## 4. Statusmenge

Verbindlich: **Reset-cancellable = `NON_TERMINAL_STATUSES` ∪ {`dispatch_uncertain`}**, also `pending, dispatching, dispatched, running, callback_processing, dispatch_uncertain`.

Die SQL-Seite bekommt dafür genau eine Helper-Konstante. Der Drift-Test prüft die SQL-Menge gegen `NON_TERMINAL_STATUSES ∪ {'dispatch_uncertain'}` — die eingefrorene TS-Konstante selbst wird **nicht** verändert, `dispatch_uncertain` bleibt dort separat behandelt.

## 5. Late-Callback-Owner

Ein `cancelled`/`user_reset`-Attempt ist an jedem dieser Entry Points fail-closed no-op — keine Pass-Mutation, keine Scene-Mutation, kein Fan-in, kein Mux-Dispatch, keine Resurrection:

- `sync_segment` → `composer_apply_sync_segment_result` (Reason-Label `user_reset_discarded`, sonst unverändertes Terminalverhalten)
- `audio_mux` → `remotion-webhook` (`stage='sync_segments_audio_mux'`, §56 ff.) und der Mux-/Finalizer-Pfad `render-sync-segments-audio-mux`
- Dialog-Stitch-Zweig in `remotion-webhook` (`[dialog-stitch]`, §264 ff.)

Die normale Callback-Semantik bleibt unverändert.

## 6. Tests

RS3-S1…S14 plus Frozen-Suite, `tsgo` und die bestehenden G3.1/G3.1f/G3.2.2-Smokes:

1. offener `sync_segment` ⇒ `cancelled` / `user_reset`
2. `running`-Attempt ⇒ ebenfalls terminalisiert
3. `dispatch_uncertain`-Attempt ⇒ ebenfalls terminalisiert
4. offener `audio_mux` ⇒ ebenso
5. bereits terminaler Job ⇒ idempotent unverändert
6. fremder Run / fremde Generation ⇒ `stale_reset`, kein Write
7. `base_video` unverändert
8. Pass-/Mux-Runtime-Bindings korrekt zurückgesetzt
9. zweiter Reset ⇒ idempotent
10. Late Sync.so-Callback nach Reset ⇒ keine Mutation
11. Late Mux/Stitch-Callback nach Reset ⇒ keine Resurrection
12. **Sync-Rearm:** nach dem Reset adoptiert `compose-dialog-segments` den Nachfolger und dispatcht — weder `already_in_flight` noch `predecessor_exists`; Initial-Acquire selbst bleibt im Frozen-Test unverändert
13. **Mux-Rearm:** alter `audio_mux` `cancelled`/`user_reset` ⇒ neuer Fan-in erreicht `dispatch_mux` ⇒ genau ein neuer `audio_mux`-Attempt (`attempt_no+1`), kein `predecessor_exists`; zweiter Aufruf erzeugt keinen dritten Attempt
14. **Refund-Idempotenz:** Reset + fehlgeschlagener Provider-Cancel + späterer Failure-Callback ⇒ kein zweiter Refund, keine weitere finanzielle Nebenwirkung

Zusätzlich: `user_reset` nicht in `composer_retryable_failure_reasons()`; Pointer-Lifecycle-Test (Marker überlebt die Reset-Mutation, wird genau einmal konsumiert); Fail-closed-Test für `rs3_rearm_unavailable`; Drift-Test der Statusmenge.

## 7. Writer-/Security-Audit

Nachweis: beide Reset-Aufrufer laufen über den einen RPC-Vertrag, kein verbleibender Direct-Clear-Pfad, beide neuen Primitive service-role-only, `anon`/`authenticated`/`PUBLIC` ohne EXECUTE, akzeptiertes plattform-internes ACL wie bisher dokumentiert.

## 8. Deliverables

- `docs/v431-rs3-report.md` (neu)
- `docs/v431-g3-2-2-report.md` nur um einen Verweis ergänzt

Danach STOP für Review.
