# v431 RS3 — Option A: Atomic Lip-Sync Reset Cancellation (Rev. 2)

Status: IMPLEMENTATION PLAN — awaiting GO. Kein Deploy, kein Produktions-Resmoke, kein Cleanup historischer Rows.

Rev. 2 schließt die drei NO-GO-Punkte: (1) kein Sonderfall im G3.1b-Initial-Acquire, sondern ein eigener Reset-Rearm-Vertrag mit definierter Adoption; (2) genau ein DB-Commit für den gesamten Reset; (3) kanonische Active-Status-Menge inkl. `running` plus namentlich benannte Late-Callback-Owner und Refund-Smoke.

## Belegte Ausgangslage

- `composer_acquire_pipeline_attempt` (G3.1b, `20260815084640_…sql`): aktiver Vorgänger ⇒ `already_in_flight`; **jeder** terminale Vorgänger ⇒ `predecessor_exists`. Initial-Acquire erzeugt nie Attempt > 1.
- Kanonische Statusmengen liegen in `supabase/functions/_shared/composer-pipeline-jobs.ts`: `NON_TERMINAL_STATUSES = pending, dispatching, dispatched, running, callback_processing`; `TERMINAL_STATUSES = succeeded, failed, cancelled, stale`.
- `adoptPreAcquiredLedgerJob()` (`_shared/v431-ledger.ts`) adoptiert bereits heute eine vorab erzeugte Ledger-Zeile (`status pending|dispatching`, kein `external_job_id`, kein `replaced_by`, Identitätsprüfung auf scene/stage/run/generation). `compose-dialog-segments` nutzt sie, wenn `body.pipeline_job_id` gesetzt ist (§5961 ff.).
- `composer_apply_sync_segment_result` (`20260815185301_…sql`, Z. 419) noopt bereits bei `cancelled`.
- `reset-lipsync-scene` und der Direct-Clear-Zweig in `resetSceneLipSync()` schreiben keine Ledger-Zeile und erneuern weder Run noch Generation.

## 1. Reset-Rearm-Vertrag statt Acquire-Sonderfall

`composer_acquire_pipeline_attempt` bleibt **byte- und semantisch unverändert / frozen**. `composer_replace_pipeline_attempt` wird nicht benutzt, die Retry-Allowlist bleibt unverändert (`user_reset` ist nicht retryable).

Stattdessen erzeugt die Reset-Transaktion selbst den Nachfolger, eng geschlossen:

- Nur wenn der Vorgänger derselben Identität `(scene, run, stage, generation, segment)` unmittelbar in dieser Transaktion auf `cancelled` / `error_code='user_reset'` gesetzt wurde.
- Genau `attempt_no + 1`, gleiche Identitätsspalten, `status='pending'`, `external_job_id=NULL`, `replaced_by=NULL`, Metadata `ledger_source='v431_rs3_reset_rearm'`, `rearm_of=<vorgänger_id>`.
- Concurrency-safe über die bestehende Identity-Unique-Constraint plus die Row-Locks der Transaktion; bei Verlust des Rennens: kein zweiter Nachfolger, Rückgabe der existierenden Zeile.
- Nur für Stage `sync_segment` (pro Segment). Für `audio_mux` wird **kein** Nachfolger vorerzeugt — Mux wird ohnehin erst nach dem Fan-in neu dispatcht und hat dann eine frische Identität über den normalen Weg; ein pre-armed Mux-Job wäre nur Ledger-Müll.

### Adoption — verbindlich, nicht offen

Der Reset persistiert die erzeugten Nachfolger-Job-IDs pro Segment im Szenen-State (`audio_plan.twoshot.rs3_rearm[segment_id] = job_id`), im **selben** Commit.

`compose-dialog-segments` liest diesen Pointer vor der Ledger-Entscheidung und benutzt den bestehenden Adoptionspfad `adoptPreAcquiredLedgerJob()` (identisch zur schon vorhandenen `body.pipeline_job_id`-Logik), statt `resolveLedgerDispatch()`/Initial-Acquire aufzurufen. Der Pointer wird beim erfolgreichen Adopt konsumiert (einmalig gelöscht).

Fail-closed-Regeln:
- Adopt liefert `skip` (stale run/generation, bereits gebunden, nicht dispatchbar) ⇒ Pointer wird verworfen und der reguläre `resolveLedgerDispatch()`-Pfad greift; kein stiller Sonderweg.
- Ein nie adoptierter Rearm-Nachfolger bleibt `pending` ohne `external_job_id` und fällt damit in den bestehenden Reaper (`composer_reap_orphaned_dispatches`) — dieses Verhalten wird im Report explizit als bekannter Endzustand dokumentiert und im Test abgedeckt.

## 2. Ein DB-Primitive, ein Commit

Neu: `composer_reset_lipsync_with_attempt_cancellation(_scene_id uuid, _expected_run_id uuid, _expected_plate_generation integer)`

- `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, keine Defaults, keine Overloads, schema-qualifizierte Referenzen.
- Besitzt die **komplette** DB-seitige Reset-Transaktion, in dieser Reihenfolge:
  1. Kandidaten-Jobs `FOR UPDATE` (deterministisch nach `id` sortiert)
  2. `composer_scenes FOR UPDATE`
  3. Guard `active_run_id` + `plate_generation` ⇒ sonst `stale_reset`, kein Write
  4. offene Lip-Sync-Attempts mit `cancelled` / `error_code='user_reset'` terminalisieren
  5. Rearm-Nachfolger für `sync_segment` erzeugen (§1) und Pointer schreiben
  6. Pass-/Mux-Runtime-Bindings des verworfenen Laufs zurücksetzen
  7. bestehende Lip-Sync-Reset-Semantik anwenden (Felder exakt wie heute in `reset-lipsync-scene`)
  8. Audit
- Rückgabe: `{ ok, outcome, canceled_job_ids[], external_job_ids[], rearmed[] }`.
- `base_video` wird niemals angefasst; kein Run-Wechsel, kein Generation-Bump, Plate bleibt erhalten, kein bezahlter Neurender.
- GRANT nur `service_role`; `REVOKE ALL` von `PUBLIC`, `anon`, `authenticated`.

`reset-lipsync-scene` macht danach nur noch: Auth/Ownership, RPC-Aufruf, und **nach** dem Commit best-effort Provider-Cancels anhand der zurückgegebenen External-IDs sowie den bestehenden idempotenten Credit-Refund. Keine eigenen Scene-Writes mehr, kein Mehrcommit-Reset.

`src/lib/lipsyncReset.ts::resetSceneLipSync()` verliert seinen Direct-Clear-Zweig vollständig: kein Client-Write auf `composer_scenes` mehr, immer derselbe Edge→RPC-Pfad, sonst fail-closed mit Fehlermeldung.

## 3. Statusmenge und Late-Callback-Owner

- Kandidatenmenge = die kanonische Active-Menge des G3.1-Ledgers, **inklusive `running` und `callback_processing`**, plus `dispatch_uncertain`. Keine neue Liste: die SQL-Seite bekommt eine einzige Helper-Konstante, gegen die die TS-Konstante `NON_TERMINAL_STATUSES` im Test byte-genau geprüft wird (Drift-Test).
- Late-Callback-Owner werden namentlich abgesichert; ein `cancelled`/`user_reset`-Attempt ist an jedem Entry Point fail-closed no-op:
  - `sync_segment` → `composer_apply_sync_segment_result` (Reason-Label `user_reset_discarded`, sonst unverändertes Terminalverhalten)
  - `audio_mux` → `remotion-webhook` (`stage='sync_segments_audio_mux'`, §56 ff.) und der von ihm benutzte Mux-/Finalizer-Pfad in `render-sync-segments-audio-mux`
  - Dialog-Stitch-Zweig in `remotion-webhook` (`[dialog-stitch]`, §264 ff.)
- Wirkung überall: keine Pass-Mutation, keine Scene-Mutation, kein Fan-in, kein Mux-Dispatch, keine Resurrection. Die normale Callback-Semantik bleibt unangetastet.

## 4. Tests

RS3-S1…S12 plus Frozen-Suite, `tsgo` und die bestehenden G3.1/G3.1f/G3.2.2-Smokes:

1. offener `sync_segment` ⇒ `cancelled` / `user_reset`
2. `running`-Attempt ⇒ ebenfalls terminalisiert (Regressionsschutz gegen die zu schmale Liste)
3. offener `audio_mux` ⇒ ebenso
4. bereits terminaler Job ⇒ idempotent unverändert
5. fremder Run / fremde Generation ⇒ `stale_reset`, kein Write
6. `base_video` unverändert
7. Pass-/Mux-Runtime-Bindings korrekt zurückgesetzt
8. zweiter Reset ⇒ idempotent
9. Late Sync.so-Callback nach Reset ⇒ keine Mutation
10. Late Mux/Stitch-Callback nach Reset ⇒ keine Resurrection
11. **Rearm/Adoption:** nach dem Reset adoptiert `compose-dialog-segments` den Nachfolger und dispatcht — weder `already_in_flight` noch `predecessor_exists`; Initial-Acquire-Verhalten selbst bleibt im Frozen-Test unverändert
12. **Refund-Idempotenz:** Reset + fehlgeschlagener Provider-Cancel + späterer Failure-Callback ⇒ kein zweiter Refund, keine weitere finanzielle Nebenwirkung

Zusätzlich: `user_reset` nicht in `composer_retryable_failure_reasons()`; Drift-Test SQL-Statusmenge ⇔ `NON_TERMINAL_STATUSES`.

## 5. Writer-/Security-Audit

Nachweis: beide Reset-Aufrufer laufen über den einen RPC-Vertrag, kein verbleibender Direct-Clear-Pfad, Primitive service-role-only, `anon`/`authenticated`/`PUBLIC` ohne EXECUTE, akzeptiertes plattform-internes ACL wie bisher dokumentiert.

## 6. Deliverables

- `docs/v431-rs3-report.md` (neu)
- `docs/v431-g3-2-2-report.md` nur um einen Verweis ergänzt

Danach STOP für Review.
