# v431 RS3 — Option A: Atomic Lip-Sync Reset Cancellation (Rev. 4, final)

Status: IMPLEMENTATION PLAN — awaiting GO. Kein Deploy, kein Produktions-Resmoke, kein Cleanup historischer Rows.

Dieses Dokument ist der **einzige** gültige RS3-Vertrag. Rev. 1–3 sind vollständig verworfen; es gibt hier keinen Acquire-Sonderfall, keinen Adoption-Rückfall auf den normalen Resolver und keine zweite Statusregel.

## 0. Belegte Ausgangslage

- `composer_acquire_pipeline_attempt` (G3.1b, `20260815084640_…sql`): aktiver Vorgänger ⇒ `already_in_flight`; **jeder** terminale Vorgänger (`succeeded`, `failed`, `cancelled`, `stale`) ⇒ `predecessor_exists`. Initial-Acquire erzeugt nie Attempt > 1. Bleibt **frozen**, ebenso `composer_replace_pipeline_attempt`.
- Statusmengen (`_shared/composer-pipeline-jobs.ts`): `NON_TERMINAL_STATUSES = pending, dispatching, dispatched, running, callback_processing`; `dispatch_uncertain` ist dort bewusst separat geführt.
- `adoptPreAcquiredLedgerJob()` (`_shared/v431-ledger.ts`) adoptiert eine vorab erzeugte Zeile (`pending|dispatching`, kein `external_job_id`, kein `replaced_by`, Identitätsprüfung scene/stage/run/generation); `compose-dialog-segments` nutzt sie bei gesetztem `body.pipeline_job_id` (§5961 ff.).
- `composer_apply_sync_segment_result` (`20260815185301_…sql`, Z. 419) noopt bereits bei `cancelled`.
- `reset-lipsync-scene` setzt `dialog_shots = null` und schreibt `audio_plan` als **komplett neu gebautes Objekt** — der Reset-Marker muss deshalb nach allen Reset-Mutationen persistiert werden und darf nicht in `dialog_shots` liegen.
- Beide Blockade-Aufrufer (`reset-lipsync-scene`, Direct-Clear-Zweig in `resetSceneLipSync()`) berühren den Ledger heute nicht und erneuern weder Run noch Generation.

## 1. Grundvertrag

Der Reset bleibt Lip-Sync-only: `active_run_id`, `active_run_started_at`, `plate_generation`, Plate/`base_video` bleiben erhalten; kein bezahlter Neurender.

Autorisierendes Element ist **nicht** „wurde gerade gecancelt", sondern eine **einmalige RS3-Reset-Autorisierung** für die Identität `(scene, run, plate_generation)`:

- Jüngster Vorgänger derselben Stage/Segment-Identität **aktiv** (Reset-cancellable, §4) ⇒ im selben Reset auf `cancelled` / `error_code='user_reset'`.
- Jüngster Vorgänger **bereits terminal** (`succeeded`, `failed`, `cancelled`, `stale`) ⇒ **nicht mutieren**.
- In **beiden** Fällen autorisiert der Reset anschließend genau einen Nachfolger `attempt_no + 1` je Stage/Segment.

Das ist kein Retry, keine Retry-Allowlist (`user_reset` kommt nicht in `composer_retryable_failure_reasons()`), kein Replace und keine Änderung am Initial-Acquire.

## 2. Ein DB-Primitive, ein Commit

Neu: `composer_reset_lipsync_with_attempt_cancellation(_scene_id uuid, _expected_run_id uuid, _expected_plate_generation integer)`

- `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, keine Defaults, keine Overloads, schema-qualifizierte Referenzen, `service_role`-only (`REVOKE ALL` von `PUBLIC`, `anon`, `authenticated`).
- Ablauf in genau einer Transaktion:
  1. Kandidaten-Jobs `FOR UPDATE` (deterministisch nach `id`)
  2. `composer_scenes FOR UPDATE`
  3. Guard `active_run_id` + `plate_generation` ⇒ sonst `stale_reset`, kein Write
  4. **aktive** Lip-Sync-Attempts (`sync_segment`, `audio_mux`) auf `cancelled` / `error_code='user_reset'` setzen; terminale Vorgänger unverändert lassen
  5. Pass-/Mux-Runtime-Bindings des verworfenen Laufs zurücksetzen
  6. bestehende Lip-Sync-Reset-Semantik anwenden (Feldsatz exakt wie heute in `reset-lipsync-scene`)
  7. je verworfenem/zu erneuerndem `sync_segment` genau einen Nachfolger `attempt_no + 1` erzeugen (`status='pending'`, `external_job_id=NULL`, `replaced_by=NULL`, Metadata `ledger_source='v431_rs3_reset_rearm'`, `rearm_of=<vorgänger_id>`)
  8. Reset-Marker **zuletzt** schreiben (§3)
  9. Audit
- Rückgabe: `{ ok, outcome, canceled_job_ids[], external_job_ids[], rearmed[] }`.
- `base_video` wird nie angefasst; kein Run-Wechsel, kein Generation-Bump.

`reset-lipsync-scene` macht danach nur noch Auth/Ownership, den RPC-Aufruf und **nach** dem Commit best-effort Provider-Cancels über die zurückgegebenen External-IDs plus den bestehenden idempotenten Credit-Refund. Keine eigenen Scene-Writes mehr.

`src/lib/lipsyncReset.ts::resetSceneLipSync()` verliert den Direct-Clear-Zweig vollständig: kein Client-Write auf `composer_scenes`, immer derselbe Edge→RPC-Pfad, sonst fail-closed.

## 3. Reset-Marker und Adoption

Marker in `audio_plan.twoshot.rs3_reset`:
`{ run_id, plate_generation, reset_at, sync: { <segment_id>: <job_id> }, mux_rearm_allowed: true }` — geschrieben nach allen Reset-Mutationen, im selben Commit. Gültig ausschließlich für exakt dieses `run_id` + `plate_generation`.

- `compose-dialog-segments` adoptiert den vorerzeugten Sync-Nachfolger über den bestehenden `adoptPreAcquiredLedgerJob()`-Pfad und konsumiert den Segment-Eintrag genau einmal.
- Der Mux-Pfad konsumiert `mux_rearm_allowed` genau einmal (§5).

Fehlerregeln — abschließend:
- **Stale Run/Generation** (Marker passt nicht mehr zur Szene) ⇒ Marker verwerfen; der normale Pfad ist zulässig, weil die Identität ohnehin verschoben ist.
- **Gleicher Run/Generation, Adoption nicht möglich** (`preacquired_already_bound`, `preacquired_not_dispatchable`, Zeile fehlt) ⇒ **fail closed** mit `rs3_rearm_unavailable`. Zulässig ist ausschließlich der autorisierte On-Demand-Rearm aus §5. Ein stiller Rückfall auf `resolveLedgerDispatch()` / Initial-Acquire ist bei gleicher Run/Generation-Identität **verboten**.

## 4. Statusmenge

Verbindlich: **Reset-cancellable = `NON_TERMINAL_STATUSES` ∪ {`dispatch_uncertain`}** = `pending, dispatching, dispatched, running, callback_processing, dispatch_uncertain`.

Eine einzige SQL-Helper-Konstante; der Drift-Test prüft sie gegen `NON_TERMINAL_STATUSES ∪ {'dispatch_uncertain'}`. Die eingefrorene TS-Konstante wird nicht verändert.

## 5. On-Demand-Rearm (`audio_mux`, plus Fail-closed-Rückfall für `sync_segment`)

Neu: `composer_acquire_reset_rearmed_attempt(_scene_id uuid, _run_id uuid, _stage text, _plate_generation integer, _segment_id uuid, _provider text, _metadata jsonb)`

- Stage-Allowlist geschlossen: `sync_segment | audio_mux`. Keine generische Stage-Öffnung.
- Autorisierung: gültige, **unverbrauchte** RS3-Reset-Autorisierung für `(scene, run, plate_generation)` + jüngster Vorgänger derselben Identität — unabhängig davon, ob dieser im Reset gecancelt wurde oder schon terminal war. Fehlt die Autorisierung ⇒ `rearm_not_authorized`, kein Write.
- Lock-/Ablaufvertrag in einer Transaktion: jüngsten Ledger-Vorgänger `FOR UPDATE` → `composer_scenes FOR UPDATE` → Marker/Run/Generation/Stage/Segment prüfen → Nachfolger `attempt_no + 1` erzeugen → Marker-Eintrag konsumieren → Commit.
- Concurrency: identischer konkurrierender Aufruf erhält denselben erzeugten Nachfolger bzw. `already_rearmed` — **niemals** Attempt N+2 (Identity-Unique-Constraint + Locks).
- Aufrufer ausschließlich: der Mux-Dispatch (`dispatchAudioMux` in `_shared/v431-ledger.ts`, aus dem Fan-in-`dispatch_mux`-Pfad) und der Sync-Dispatch nur im Fail-closed-Rückfall aus §3.
- `SECURITY DEFINER`, `search_path = pg_catalog, public`, keine Defaults, keine Overloads, `service_role`-only.

## 6. Late-Callback-Owner

Ein `cancelled`/`user_reset`-Attempt ist an jedem Entry Point fail-closed no-op — keine Pass-Mutation, keine Scene-Mutation, kein Fan-in, kein Mux-Dispatch, keine Resurrection:

- `sync_segment` → `composer_apply_sync_segment_result` (Reason-Label `user_reset_discarded`, sonst unverändertes Terminalverhalten)
- `audio_mux` → `remotion-webhook` (`stage='sync_segments_audio_mux'`, §56 ff.) und der Mux-/Finalizer-Pfad `render-sync-segments-audio-mux`
- Dialog-Stitch-Zweig in `remotion-webhook` (`[dialog-stitch]`, §264 ff.)

Die normale Callback-Semantik bleibt unverändert.

## 7. Tests

RS3-S1…S16 plus Frozen-Suite, `tsgo` und die bestehenden G3.1/G3.1f/G3.2.2-Smokes:

1. offener `sync_segment` ⇒ `cancelled` / `user_reset`
2. `running`-Attempt ⇒ ebenfalls terminalisiert
3. `dispatch_uncertain`-Attempt ⇒ ebenfalls terminalisiert
4. offener `audio_mux` ⇒ ebenso
5. bereits terminaler Job ⇒ nicht mutiert, idempotent
6. fremder Run / fremde Generation ⇒ `stale_reset`, kein Write
7. `base_video` unverändert
8. Pass-/Mux-Runtime-Bindings korrekt zurückgesetzt
9. zweiter Reset ⇒ idempotent, keine doppelten Nachfolger
10. Late Sync.so-Callback nach Reset ⇒ keine Mutation
11. Late Mux/Stitch-Callback nach Reset ⇒ keine Resurrection
12. Sync-Rearm nach gecanceltem Vorgänger ⇒ Adoption, Dispatch, kein `already_in_flight`/`predecessor_exists`
13. **Abnahmekriterium A:** `succeeded` `sync_segment` ⇒ Reset ⇒ neuer Sync-Attempt N+1 ⇒ dispatchbar
14. **Abnahmekriterium B:** `succeeded` `audio_mux` ⇒ Reset ⇒ neuer Fan-in ⇒ `audio_mux` N+1 ⇒ dispatchbar
15. Concurrency: zwei parallele On-Demand-Rearms ⇒ ein Nachfolger bzw. `already_rearmed`, nie N+2
16. **Refund-Idempotenz:** Reset + fehlgeschlagener Provider-Cancel + späterer Failure-Callback ⇒ kein zweiter Refund, keine weitere finanzielle Nebenwirkung

Zusätzlich: `user_reset` nicht retryable; Marker-Lifecycle (überlebt die Reset-Mutation, genau einmal konsumiert); Fail-closed-Test `rs3_rearm_unavailable`; Drift-Test der Statusmenge; Frozen-Test, dass `composer_acquire_pipeline_attempt` unverändert `predecessor_exists` liefert.

## 8. Writer-/Security-Audit

Nachweis: beide Reset-Aufrufer laufen über den einen RPC-Vertrag, kein verbleibender Direct-Clear-Pfad, beide neuen Primitive `service_role`-only, `anon`/`authenticated`/`PUBLIC` ohne EXECUTE, akzeptiertes plattform-internes ACL wie bisher dokumentiert.

## 9. Deliverables

- `docs/v431-rs3-report.md` (neu)
- `docs/v431-g3-2-2-report.md` nur um einen Verweis ergänzt

Danach STOP für Review.
