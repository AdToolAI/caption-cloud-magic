# v431 RS3 — Option A: Atomic Lip-Sync Reset Cancellation

Status: IMPLEMENTATION PLAN — awaiting GO. Kein Deploy, kein Produktions-Resmoke, kein Cleanup historischer Rows.

Einziger gültiger RS3-Vertrag. Kein Pre-Acquire beim Reset, kein Sonderfall im Initial-Acquire, kein Rückfall auf den normalen Resolver bei gleicher Run/Generation-Identität.

## 0. Belegte Ausgangslage

- `composer_acquire_pipeline_attempt` (G3.1b, `20260815084640_…sql`): aktiver Vorgänger ⇒ `already_in_flight`; **jeder** terminale Vorgänger (`succeeded`, `failed`, `cancelled`, `stale`) ⇒ `predecessor_exists`. Initial-Acquire erzeugt nie Attempt > 1. Bleibt **frozen**, ebenso `composer_replace_pipeline_attempt`.
- Statusmengen (`_shared/composer-pipeline-jobs.ts`): `NON_TERMINAL_STATUSES = pending, dispatching, dispatched, running, callback_processing`; `dispatch_uncertain` ist dort bewusst separat geführt.
- Der G3.1-Reaper (`composer_reap_orphaned_dispatches`) erfasst `pending`/`dispatching`-Zeilen ohne `external_job_id` — deshalb darf der Reset keinen ungebundenen Ledger-Job hinterlassen.
- `composer_apply_sync_segment_result` (`20260815185301_…sql`, Z. 419) noopt bereits bei `cancelled`.
- `reset-lipsync-scene` setzt `dialog_shots = null` und schreibt `audio_plan` als komplett neu gebautes Objekt — der Reset-Marker muss deshalb nach allen Reset-Mutationen persistiert werden und darf nicht in `dialog_shots` liegen.
- Beide Blockade-Aufrufer (`reset-lipsync-scene`, Direct-Clear-Zweig in `resetSceneLipSync()`) berühren den Ledger heute nicht und erneuern weder Run noch Generation.

## 1. Grundvertrag

Der Reset bleibt Lip-Sync-only: `active_run_id`, `active_run_started_at`, `plate_generation`, Plate/`base_video` bleiben erhalten; kein bezahlter Neurender, kein Generation-Bump.

Autorisierendes Element ist **nicht** „wurde gerade gecancelt", sondern eine **einmalige, unverbrauchte RS3-Reset-Autorisierung** für `(scene, run, plate_generation)` je Stage/Segment:

- Jüngster Vorgänger derselben Identität **aktiv** (Reset-cancellable, §4) ⇒ im selben Reset auf `cancelled` / `error_code='user_reset'`.
- Jüngster Vorgänger **bereits terminal** (`succeeded`, `failed`, `cancelled`, `stale`) ⇒ **nicht mutieren**.
- In **beiden** Fällen berechtigt der Marker später zu genau einem Nachfolger `attempt_no + 1`.

Kein Retry, keine Retry-Allowlist (`user_reset` kommt nicht in `composer_retryable_failure_reasons()`), kein Replace, keine Änderung am Initial-Acquire.

**Der Reset erzeugt selbst keinerlei Ledger-Zeile.** Nachfolger entstehen ausschließlich on-demand beim tatsächlichen Dispatch — für `sync_segment` und `audio_mux` identisch.

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
  7. Reset-Marker **zuletzt** schreiben (§3)
  8. Audit
- Rückgabe: `{ ok, outcome, canceled_job_ids[], external_job_ids[], authorized_segments[] }`.
- `base_video` wird nie angefasst; kein Run-Wechsel.

`reset-lipsync-scene` macht danach nur noch Auth/Ownership, den RPC-Aufruf und **nach** dem Commit best-effort Provider-Cancels über die zurückgegebenen External-IDs plus den bestehenden idempotenten Credit-Refund. Keine eigenen Scene-Writes mehr.

`src/lib/lipsyncReset.ts::resetSceneLipSync()` verliert den Direct-Clear-Zweig vollständig: kein Client-Write auf `composer_scenes`, immer derselbe Edge→RPC-Pfad, sonst fail-closed.

## 3. Reset-Marker (nur Autorisierung, keine Job-IDs)

Marker in `audio_plan.twoshot.rs3_reset`:
`{ run_id, plate_generation, reset_at, sync_segments: [<segment_id>, …], mux_rearm_allowed: true }` — geschrieben nach allen Reset-Mutationen, im selben Commit, gültig ausschließlich für exakt dieses `run_id` + `plate_generation`.

Der Marker enthält bewusst **keine** Job-IDs. Die Nachfolger-Job-ID entsteht erst beim On-Demand-Rearm und wird dort einmalig verbraucht.

Fehlerregeln — abschließend:
- **Stale Run/Generation** (Marker passt nicht mehr zur Szene) ⇒ Marker verwerfen; der normale Pfad ist zulässig, weil die Identität ohnehin verschoben ist.
- **Gleicher Run/Generation, Rearm nicht möglich oder Autorisierung fehlt/verbraucht** ⇒ **fail closed** mit `rs3_rearm_unavailable`. Ein stiller Rückfall auf `resolveLedgerDispatch()` / Initial-Acquire ist bei gleicher Run/Generation-Identität **verboten**.

## 4. Statusmenge

Verbindlich: **Reset-cancellable = `NON_TERMINAL_STATUSES` ∪ {`dispatch_uncertain`}** = `pending, dispatching, dispatched, running, callback_processing, dispatch_uncertain`.

Eine einzige SQL-Helper-Konstante; der Drift-Test prüft sie gegen `NON_TERMINAL_STATUSES ∪ {'dispatch_uncertain'}`. Die eingefrorene TS-Konstante wird nicht verändert.

## 5. On-Demand-Rearm — beide Stages

Neu: `composer_acquire_reset_rearmed_attempt(_scene_id uuid, _run_id uuid, _stage text, _plate_generation integer, _segment_id uuid, _provider text, _metadata jsonb)`

- Stage-Allowlist geschlossen: `sync_segment | audio_mux`. Keine generische Stage-Öffnung.
- Autorisierung: gültige, unverbrauchte RS3-Reset-Autorisierung für `(scene, run, plate_generation)` + Stage/Segment. Unabhängig davon, ob der jüngste Vorgänger im Reset gecancelt wurde oder schon terminal war. Fehlt die Autorisierung ⇒ `rearm_not_authorized`, kein Write.
- **Aktiver Fremd-Vorgänger:** Hat der jüngste Vorgänger einen normalen aktiven Provider-Job und gehört nicht zu diesem Reset ⇒ **kein Rearm, fail closed** (`rearm_blocked_active_predecessor`).
- **Idempotenz:** Existiert für dieselbe Reset-Autorisierung bereits der erzeugte N+1-Nachfolger ⇒ `already_rearmed` mit **derselben Job-ID**, Marker wird nicht erneut verbraucht, niemals N+2.
- Lock-/Ablaufvertrag in einer Transaktion: jüngsten Ledger-Vorgänger `FOR UPDATE` → `composer_scenes FOR UPDATE` → Marker/Run/Generation/Stage/Segment prüfen → Nachfolger `attempt_no + 1` erzeugen (`status='dispatching'`, Metadata `ledger_source='v431_rs3_reset_rearm'`, `rearm_of=<vorgänger_id>`) → Marker-Eintrag konsumieren → Commit.
- Aufrufer ausschließlich: `compose-dialog-segments` (Sync-Dispatch, statt Initial-Acquire, wenn Marker vorhanden) und der Mux-Dispatch (`dispatchAudioMux` in `_shared/v431-ledger.ts`, aus dem Fan-in-`dispatch_mux`-Pfad). Danach jeweils der normale Provider-Bind-Pfad (`bindSyncPassAttempt` / bestehende Mux-Bindung) — unverändert.
- `SECURITY DEFINER`, `search_path = pg_catalog, public`, keine Defaults, keine Overloads, `service_role`-only.

## 6. Late-Callback-Owner

Ein `cancelled`/`user_reset`-Attempt ist an jedem Entry Point fail-closed no-op — keine Pass-Mutation, keine Scene-Mutation, kein Fan-in, kein Mux-Dispatch, keine Resurrection:

- `sync_segment` → `composer_apply_sync_segment_result` (Reason-Label `user_reset_discarded`, sonst unverändertes Terminalverhalten)
- `audio_mux` → `remotion-webhook` (`stage='sync_segments_audio_mux'`, §56 ff.) und der Mux-/Finalizer-Pfad `render-sync-segments-audio-mux`
- Dialog-Stitch-Zweig in `remotion-webhook` (`[dialog-stitch]`, §264 ff.)

Die normale Callback-Semantik bleibt unverändert.

## 7. Tests

RS3-S1…S17 plus Frozen-Suite, `tsgo` und die bestehenden G3.1/G3.1f/G3.2.2-Smokes:

1. offener `sync_segment` ⇒ `cancelled` / `user_reset`
2. `running`-Attempt ⇒ ebenfalls terminalisiert
3. `dispatch_uncertain`-Attempt ⇒ ebenfalls terminalisiert
4. offener `audio_mux` ⇒ ebenso
5. bereits terminaler Job ⇒ nicht mutiert, idempotent
6. fremder Run / fremde Generation ⇒ `stale_reset`, kein Write
7. `base_video` unverändert
8. Pass-/Mux-Runtime-Bindings korrekt zurückgesetzt
9. zweiter Reset ⇒ idempotent
10. **Reset erzeugt keinen Ledger-Nachfolger** (`succeeded sync_segment` ⇒ Reset ⇒ keine neue Ledger-Zeile)
11. **Kein Orphan:** Reset ohne anschließenden Dispatch über den Reaper-Zeitraum ⇒ kein neuer ungebundener Ledger-Job, Marker weiterhin gültig
12. **Abnahmekriterium A:** `succeeded` `sync_segment` ⇒ Reset ⇒ erster neuer Sync-Dispatch ⇒ On-Demand-Attempt N+1 ⇒ dispatchbar, kein `predecessor_exists`
13. **Abnahmekriterium B:** `succeeded` `audio_mux` ⇒ Reset ⇒ neuer Fan-in ⇒ `audio_mux` N+1 ⇒ dispatchbar
14. Concurrency: zwei parallele Sync-Dispatches bzw. zwei parallele Mux-Rearms ⇒ genau ein N+1 bzw. `already_rearmed` mit derselben Job-ID, nie N+2
15. aktiver Fremd-Vorgänger ⇒ `rearm_blocked_active_predecessor`, kein Write
16. Late Sync.so-Callback nach Reset ⇒ keine Mutation; Late Mux/Stitch-Callback ⇒ keine Resurrection
17. **Refund-Idempotenz:** Reset + fehlgeschlagener Provider-Cancel + späterer Failure-Callback ⇒ kein zweiter Refund, keine weitere finanzielle Nebenwirkung

Zusätzlich: `user_reset` nicht retryable; Marker-Lifecycle (überlebt die Reset-Mutation, genau einmal konsumiert); Fail-closed-Test `rs3_rearm_unavailable`; Drift-Test der Statusmenge; Frozen-Test, dass `composer_acquire_pipeline_attempt` unverändert `predecessor_exists` liefert.

## 8. Writer-/Security-Audit

Nachweis: beide Reset-Aufrufer laufen über den einen RPC-Vertrag, kein verbleibender Direct-Clear-Pfad, beide neuen Primitive `service_role`-only, `anon`/`authenticated`/`PUBLIC` ohne EXECUTE, akzeptiertes plattform-internes ACL wie bisher dokumentiert.

## 9. Deliverables

- `docs/v431-rs3-report.md` (neu)
- `docs/v431-g3-2-2-report.md` nur um einen Verweis ergänzt

Danach STOP für Review.
