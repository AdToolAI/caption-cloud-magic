# v431 RS3 — Option A: Atomic Lip-Sync Reset Cancellation

Status: IMPLEMENTATION PLAN — awaiting GO. Kein Deploy, kein Produktions-Resmoke, kein Cleanup historischer Rows.

Einziger gültiger RS3-Vertrag: Marker-only Reset, On-Demand-Rearm für beide Stages, dauerhaftes Reset-Epoch-Fence. Kein Pre-Acquire, keine Adoption, kein Sonderfall im Initial-Acquire.

## 0. Belegte Ausgangslage

- `composer_acquire_pipeline_attempt` (G3.1b, `20260815084640_…sql`): aktiver Vorgänger ⇒ `already_in_flight`; **jeder** terminale Vorgänger (`succeeded`, `failed`, `cancelled`, `stale`) ⇒ `predecessor_exists`. Initial-Acquire erzeugt nie Attempt > 1. Bleibt **frozen**, ebenso `composer_replace_pipeline_attempt`.
- Statusmengen (`_shared/composer-pipeline-jobs.ts`): `NON_TERMINAL_STATUSES = pending, dispatching, dispatched, running, callback_processing`; `dispatch_uncertain` ist dort bewusst separat geführt.
- Der G3.1-Reaper (`composer_reap_orphaned_dispatches`) erfasst `pending`/`dispatching`-Zeilen ohne `external_job_id` — der Reset darf deshalb keinen ungebundenen Ledger-Job hinterlassen.
- `composer_apply_sync_segment_result` (`20260815185301_…sql`, Z. 419 ff.) noopt bei `cancelled`, behandelt aber `succeeded` als gültigen Duplicate/Redrive (`dispatch_mux`) — genau dagegen braucht RS3 das Epoch-Fence.
- `reset-lipsync-scene` setzt `dialog_shots = null` und schreibt `audio_plan` als komplett neu gebautes Objekt — der Marker muss nach allen Reset-Mutationen persistiert werden und darf nicht in `dialog_shots` liegen.
- Beide Blockade-Aufrufer (`reset-lipsync-scene`, Direct-Clear-Zweig in `resetSceneLipSync()`) berühren den Ledger heute nicht und erneuern weder Run noch Generation.

## 1. Grundvertrag

Der Reset bleibt Lip-Sync-only: `active_run_id`, `active_run_started_at`, `plate_generation`, Plate/`base_video` bleiben erhalten; kein bezahlter Neurender, kein Generation-Bump.

**Der Reset erzeugt keinerlei Ledger-Zeile.** Er cancelt nur aktive Attempts, setzt Runtime zurück und persistiert eine Rearm-Autorisierung. Nachfolger `attempt_no + 1` entstehen für `sync_segment` **und** `audio_mux` ausschließlich on-demand beim tatsächlichen Dispatch über `composer_acquire_reset_rearmed_attempt` (§5).

Autorisierendes Element ist der Reset-Marker, nicht „wurde gerade gecancelt":

- Jüngster Vorgänger derselben Identität **aktiv** (Reset-cancellable, §4) ⇒ im selben Reset `cancelled` / `error_code='user_reset'`.
- Jüngster Vorgänger **bereits terminal** (`succeeded`, `failed`, `cancelled`, `stale`) ⇒ **nicht mutieren**.
- In beiden Fällen berechtigt der Marker später zu genau einem Nachfolger.

Kein Retry, keine Retry-Allowlist (`user_reset` kommt nicht in `composer_retryable_failure_reasons()`), kein Replace, keine Änderung am Initial-Acquire.

## 2. Ein DB-Primitive, ein Commit

Neu: `composer_reset_lipsync_with_attempt_cancellation(_scene_id uuid, _expected_run_id uuid, _expected_plate_generation integer)`

- `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, keine Defaults, keine Overloads, schema-qualifizierte Referenzen, `service_role`-only (`REVOKE ALL` von `PUBLIC`, `anon`, `authenticated`).
- Ablauf in genau einer Transaktion:
  0. `pg_advisory_xact_lock(hashtextextended(scene_id::text, 0))` — gemeinsamer Serialisierungspunkt (§5b)
  1. Kandidaten-Jobs `FOR UPDATE` (deterministisch nach `id`)
  2. `composer_scenes FOR UPDATE`
  3. Guard `active_run_id` + `plate_generation` ⇒ sonst `stale_reset`, kein Write
  4. **aktive** Lip-Sync-Attempts (`sync_segment`, `audio_mux`) auf `cancelled` / `error_code='user_reset'` setzen; terminale Vorgänger unverändert lassen
  5. Pass-/Mux-Runtime-Bindings des verworfenen Laufs zurücksetzen
  6. bestehende Lip-Sync-Reset-Semantik anwenden (Feldsatz exakt wie heute in `reset-lipsync-scene`)
  7. Reset-Marker **zuletzt** schreiben (§3)
  8. Audit
- Rückgabe: `{ ok, outcome, reset_id, canceled_job_ids[], external_job_ids[], authorized_segments[] }`.
- `base_video` wird nie angefasst; kein Run-Wechsel; keine Ledger-Zeile wird erzeugt.

`reset-lipsync-scene` macht danach nur noch Auth/Ownership, den RPC-Aufruf und **nach** dem Commit best-effort Provider-Cancels über die zurückgegebenen External-IDs plus den bestehenden idempotenten Credit-Refund. Keine eigenen Scene-Writes mehr.

`src/lib/lipsyncReset.ts::resetSceneLipSync()` verliert den Direct-Clear-Zweig vollständig: kein Client-Write auf `composer_scenes`, immer derselbe Edge→RPC-Pfad, sonst fail-closed.

## 3. Reset-Marker und Epoch-Fence

Marker in `audio_plan.twoshot.rs3_reset`, geschrieben nach allen Reset-Mutationen im selben Commit:

```text
rs3_reset = {
  reset_id,            -- stabile uuid, Epoch-Anker
  run_id,
  plate_generation,
  reset_at,
  sync_segments: [ <segment_id>, ... ],   -- unverbrauchte Rearm-Autorisierungen
  mux_rearm_allowed: true
}
```

- Der Marker enthält **keine** Job-IDs.
- Konsumiert werden nur einzelne Autorisierungen (`sync_segments[segment]` bzw. `mux_rearm_allowed`). Der Marker selbst inklusive `reset_id` bleibt für den Rest dieses `run_id`/`plate_generation`-Kontexts bestehen — das Epoch-Fence darf nicht mit der Autorisierung verfallen.
- Jeder nach dem Reset erzeugte Job trägt `metadata.rs3_reset_id = <reset_id>`: sowohl die On-Demand-Nachfolger als auch Identitäten, die vor dem Reset keinen Vorgänger hatten und regulär mit Attempt 1 starten. Das Setzen der Metadata übernimmt der jeweilige Dispatcher.
- Gültig ausschließlich für exakt dieses `run_id` + `plate_generation`. Bei Generation-/Run-Wechsel wird der Marker verworfen; der normale Pfad ist dann zulässig.
- Bei gleicher Run/Generation-Identität und fehlender/verbrauchter Autorisierung ⇒ **fail closed** `rs3_rearm_unavailable`. Ein stiller Rückfall auf `resolveLedgerDispatch()` / Initial-Acquire ist verboten.

## 4. Statusmenge

Verbindlich: **Reset-cancellable = `NON_TERMINAL_STATUSES` ∪ {`dispatch_uncertain`}** = `pending, dispatching, dispatched, running, callback_processing, dispatch_uncertain`.

Eine einzige SQL-Helper-Konstante; Drift-Test dagegen. Die eingefrorene TS-Konstante wird nicht verändert.

## 5. On-Demand-Rearm — beide Stages

Neu: `composer_acquire_reset_rearmed_attempt(_scene_id uuid, _run_id uuid, _stage text, _plate_generation integer, _segment_id uuid, _provider text, _metadata jsonb)`

- Stage-Allowlist geschlossen: `sync_segment | audio_mux`.
- Autorisierung: gültiger Marker mit unverbrauchter Autorisierung für Stage/Segment bei passendem `run_id` + `plate_generation`; unabhängig davon, ob der jüngste Vorgänger gecancelt oder bereits terminal war. Sonst `rearm_not_authorized`, kein Write.
- **Aktiver Fremd-Vorgänger:** jüngster Vorgänger aktiv mit normalem Provider-Job und nicht zu diesem Reset gehörend ⇒ `rearm_blocked_active_predecessor`, kein Write.
- **Idempotenz auch nach konsumierter Autorisierung:** existiert bereits ein Job mit `metadata.rs3_reset_id = <current reset_id>` und `rearm_of = <derselbe Vorgänger>` ⇒ `already_rearmed` mit exakt dieser Job-ID; niemals eine N+2-Zeile, Marker wird nicht erneut verbraucht.
- Ablauf: Der Rearm-Zweig läuft im gemeinsamen internen Core (§5b) und damit unter genau einer Lock-Reihenfolge: Advisory → jüngster Ledger-Vorgänger `FOR UPDATE` → `composer_scenes FOR UPDATE` → Marker/Run/Generation/Stage/Segment prüfen → Nachfolger `attempt_no + 1` erzeugen (`status='dispatching'`, Metadata `ledger_source='v431_rs3_reset_rearm'`, `rearm_of`, `rs3_reset_id`) → Autorisierung konsumieren (Marker/`reset_id` bleibt) → Commit.
- Aufrufer ausschließlich: `compose-dialog-segments` (Sync-Dispatch) und der Mux-Dispatch (`dispatchAudioMux` in `_shared/v431-ledger.ts`, aus dem Fan-in-`dispatch_mux`-Pfad) — beide über den Serialized-Wrapper (§5b), nie direkt. Danach jeweils unverändert der normale Provider-Bind-Pfad (`bindSyncPassAttempt` bzw. bestehende Mux-Bindung).
- `SECURITY DEFINER`, `search_path = pg_catalog, public`, keine Defaults, keine Overloads, `service_role`-only.

## 5b. Reset-vs-Dispatch-Serialisierung (Concurrency-Gate)

Belegter Ist-Zustand: `composer_acquire_pipeline_attempt` nimmt **keinen** Scene-Row-Lock — es liest den jüngsten Attempt und inserted. Ein paralleler Dispatcher könnte also während des Reset-Fensters eine neue aktive Zeile ohne `rs3_reset_id` erzeugen. Diese Lücke wird geschlossen, ohne G3.1b-Semantik zu ändern.

### Globale Lock-Ordnung (verbindlich)

```text
advisory(scene) → Ledger-Job(s) FOR UPDATE → composer_scenes FOR UPDATE
```

Der eingefrorene Callback-/Fan-in-Vertrag arbeitet bereits in der Reihenfolge Job → Scene und nimmt den Advisory-Lock **nicht** (bleibt unverändert). Deshalb darf kein RS3-Pfad jemals Scene vor Job sperren — sonst entsteht eine Lock-Order-Inversion gegen die Callback-Apply-Pfade. Der Advisory-Lock ist stets der erste Lock, verhindert aber allein keine Inversion.

Alle drei RS3-Pfade halten dieselbe Ordnung:
- `composer_reset_lipsync_with_attempt_cancellation`: Advisory → Kandidaten-Jobs `FOR UPDATE` (nach `id`) → Scene `FOR UPDATE` (§2).
- Rearm-Core (§5): Advisory → Vorgänger-Job `FOR UPDATE` → Scene `FOR UPDATE`.
- Serialized-Acquire: identisch, siehe unten.

### Serialized Acquire

Neu: `composer_acquire_lipsync_attempt_serialized(_scene_id uuid, _run_id uuid, _stage text, _plate_generation integer, _segment_id uuid, _provider text, _metadata jsonb)`, Stage-Allowlist geschlossen `sync_segment | audio_mux`.

Kein verschachteltes RPC mit eigener Lock-Sequenz: Wrapper und Rearm teilen **einen gemeinsamen internen Core** unter der obigen Lock-Ordnung. `composer_acquire_reset_rearmed_attempt` bleibt als eigener, extern nicht aufgerufener Einstiegspunkt auf denselben Core verdrahtet.

Ablauf:
1. `pg_advisory_xact_lock(hashtextextended(scene_id::text, 0))`
2. Jüngsten relevanten Ledger-Vorgänger für `(scene, run, stage, generation, segment)` bestimmen; existiert er ⇒ `FOR UPDATE`
3. `composer_scenes FOR UPDATE`
4. Marker/Run/Generation lesen und in **dieser** Branch-Reihenfolge entscheiden:
   - **kein Vorgänger** ⇒ unveränderter `composer_acquire_pipeline_attempt` als Attempt 1; bei gültigem Marker wird `_metadata` in derselben Transaktion um `rs3_reset_id = <reset_id>` ergänzt
   - **Vorgänger vorhanden + gültige unverbrauchte Autorisierung** ⇒ Rearm-Core, Nachfolger `attempt_no + 1`
   - **Vorgänger vorhanden + keine/verbrauchte Autorisierung bei gültigem Marker** ⇒ fail closed `rs3_rearm_unavailable`
   - **kein Marker bzw. stale Run/Generation** ⇒ unverändert `composer_acquire_pipeline_attempt`, Ergebnis 1:1 durchgereicht (inklusive `predecessor_exists`)
5. Commit.

Im No-Predecessor-Fall gibt es keinen Job-Lock; Advisory → Scene ist dort korrekt und kollidiert mit keinem Callback-Pfad, da kein Job existiert.

`acquireLedgerJob()` (`_shared/v431-ledger.ts`, einzige Aufrufstelle des Acquire-RPC) ruft für diese beiden Stages den Wrapper, für alle anderen Stages unverändert das Original.

`SECURITY DEFINER`, `search_path = pg_catalog, public`, keine Defaults, keine Overloads, `service_role`-only.

Wirkung: Session B wartet auf den Advisory-Lock des laufenden Resets und sieht danach garantiert den Marker; es kann kein aktiver, ungetaggter Pre-Reset-Job entstehen. Außerhalb des Reset-Fensters ist der Wrapper semantisch ein No-op über G3.1b.




## 6. Late-Callback-Owner und Pre-Reset-Fencing

An jedem Entry Point gilt: existiert ein aktueller RS3-Marker für denselben `run_id`/`plate_generation` und gehört der Callback-Job **nicht** zu dieser `reset_id`, dann ist der Callback ein `pre_reset_attempt` ⇒ no-op. Das gilt ausdrücklich auch für alte `succeeded`/`failed`/`stale`-Attempts, nicht nur für beim Reset gecancelte. Keine Pass-Mutation, keine Scene-Mutation, kein Fan-in, kein Mux-Dispatch, kein Redrive, keine Resurrection.

Owner:
- `sync_segment` → `composer_apply_sync_segment_result` (Reason-Labels `pre_reset_attempt` bzw. `user_reset_discarded`; der `succeeded`-Duplicate-/Redrive-Zweig wird durch das Fence vorher abgefangen)
- `audio_mux` → `remotion-webhook` (`stage='sync_segments_audio_mux'`, §56 ff.) und der Mux-/Finalizer-Pfad `render-sync-segments-audio-mux`
- Dialog-Stitch-Zweig in `remotion-webhook` (`[dialog-stitch]`, §264 ff.)

Ohne RS3-Marker bleibt die normale Callback-Semantik unverändert.

## 7. Tests

RS3-S1…S20 plus Frozen-Suite, `tsgo` und die bestehenden G3.1/G3.1f/G3.2.2-Smokes:

1. offener `sync_segment` ⇒ `cancelled` / `user_reset`
2. `running`-Attempt ⇒ ebenfalls terminalisiert
3. `dispatch_uncertain`-Attempt ⇒ ebenfalls terminalisiert
4. offener `audio_mux` ⇒ ebenso
5. bereits terminaler Job ⇒ nicht mutiert, idempotent
6. fremder Run / fremde Generation ⇒ `stale_reset`, kein Write
7. `base_video` unverändert
8. Pass-/Mux-Runtime-Bindings korrekt zurückgesetzt
9. zweiter Reset ⇒ idempotent, neue `reset_id`, keine Doppelautorisierung
10. **Reset erzeugt keine Ledger-Zeile** (`succeeded sync_segment` ⇒ Reset ⇒ Ledger unverändert)
11. **Kein Orphan:** Reset ohne anschließenden Dispatch über den Reaper-Zeitraum ⇒ kein ungebundener Job, Marker weiterhin gültig
12. **Abnahmekriterium A:** `succeeded` `sync_segment` ⇒ Reset ⇒ erster neuer Sync-Dispatch ⇒ On-Demand-Attempt N+1, dispatchbar, kein `predecessor_exists`
13. **Abnahmekriterium B:** `succeeded` `audio_mux` ⇒ Reset ⇒ neuer Fan-in ⇒ `audio_mux` N+1, dispatchbar
14. Concurrency: zwei parallele Sync-Dispatches bzw. Mux-Rearms ⇒ genau ein N+1 bzw. `already_rearmed` mit derselben Job-ID, nie N+2 — auch nach konsumierter Autorisierung
15. aktiver Fremd-Vorgänger ⇒ `rearm_blocked_active_predecessor`, kein Write
16. **Epoch-Fence:** verspäteter Success-Callback eines `succeeded` Pre-Reset-Attempts ⇒ `pre_reset_attempt` no-op, kein `dispatch_mux`, kein Redrive; ebenso für Mux/Stitch ⇒ keine Resurrection
17. Fence überlebt Consumption: nach verbrauchter Sync-/Mux-Autorisierung wehrt der Marker weiterhin alte Callbacks ab; Attempt-1-Identitäten ohne Vorgänger tragen ebenfalls `rs3_reset_id`
18. **Refund-Idempotenz:** Reset + fehlgeschlagener Provider-Cancel + späterer Failure-Callback ⇒ kein zweiter Refund, keine weitere finanzielle Nebenwirkung
19. **Reset-vs-Dispatch-Race:** Session A hält die Reset-Transaktion offen vor Commit, Session B versucht parallel einen Sync- bzw. Mux-Attempt für dieselbe Scene/Run/Generation. Nach Freigabe existiert **kein** aktiver ungetaggter Pre-Reset-Job: B wartet und erzeugt danach einen Job mit aktueller `rs3_reset_id`, oder B ist fail-closed.
20. **No-Predecessor-Fall:** autorisierte Identität ohne jeden Vorgänger ⇒ erster Post-Reset-Dispatch erzeugt regulär Attempt 1, getaggt mit aktueller `rs3_reset_id`, atomar unter demselben Lock


Zusätzlich: `user_reset` nicht retryable; Marker-Lifecycle (überlebt die Reset-Mutation); Fail-closed-Test `rs3_rearm_unavailable`; Drift-Test der Statusmenge; Frozen-Test, dass `composer_acquire_pipeline_attempt` unverändert `predecessor_exists` liefert.

## 8. Writer-/Security-Audit

Nachweis: beide Reset-Aufrufer laufen über den einen RPC-Vertrag, kein verbleibender Direct-Clear-Pfad, beide neuen Primitive `service_role`-only, `anon`/`authenticated`/`PUBLIC` ohne EXECUTE, akzeptiertes plattform-internes ACL wie bisher dokumentiert.

## 9. Deliverables

- `docs/v431-rs3-report.md` (neu)
- `docs/v431-g3-2-2-report.md` nur um einen Verweis ergänzt

Danach STOP für Review.
