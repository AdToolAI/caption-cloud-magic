# v431 G3.1d — Drain-Hardening (Reaper-Scheduler + persistente Observe-Telemetrie)

Scope strikt auf die beiden bestätigten operativen Lücken B und C. Kein Lauf #2, keine Callback-Writer-Migration, kein G3.2, keine Änderung an Lip-Sync-, Anchor- oder Provider-Logik. Befund A (`watchdog_no_prediction_id`) bleibt dokumentierte Restschuld.

## Präzisierter Observe-Vertrag

Observe ist read-only gegenüber allen Produktions- und Orchestrierungsdaten (Scene, Ledger, State, Output, Mirrors, Credits). Erlaubt ist ausschließlich ein append-only Telemetrie-Insert in eine isolierte Diagnosetabelle, dessen Fehler vollständig ignoriert wird (fail-open). Dieser Vertrag wird in `_shared/v431-ledger.ts` und in `docs/v431-g3-1-drain.md` festgeschrieben.

## B — Reaper real planen

Bestätigter Defekt: `composer_reap_orphaned_dispatches(integer)` existiert, ist korrekt gehärtet (`REVOKE PUBLIC`, `GRANT service_role`), hat aber keinen Aufrufer.

- pg_cron-Job `composer-reap-orphaned-dispatches`, Minutentakt, registriert durch die Migrations-/DB-Owner-Rolle (pg_cron läuft NICHT als `service_role`; der Job läuft unter der registrierenden DB-Rolle). Aufruf direkt in SQL, kein HTTP, kein Key im Job-Body.
- Fester Threshold: `public.composer_reap_orphaned_dispatches(10)`. Die Funktion bleibt `SECURITY DEFINER` mit gehärtetem `search_path`; die registrierende Rolle erhält explizit `EXECUTE`.
- Heartbeat entsteht im selben Cron-Lauf (ein einziges SQL-Statement/Block: Reaper aufrufen, Ergebnis in den Heartbeat schreiben) — kein zweiter unabhängiger Job, damit „Heartbeat grün, Reaper tot" ausgeschlossen ist. Inhalt: `ran_at`, verwendeter Threshold, `reaped_count`/Ergebnis.
- Idempotente Registrierung (bestehenden Job vorher entplanen), damit die Migration wiederholbar ist.

Smoke B: künstlich gealterte `dispatching`-Zeile ohne `external_job_id` anlegen → Scheduler/Reaper laufen lassen → Erwartung `status = dispatch_uncertain`, `recoverable = true`, `completed_at IS NULL`, Zeile per `pipeline_job_id` und späterer Bindung weiterhin auffindbar (Callback-Lookup unbeschädigt); Heartbeat-Zeile aus demselben Lauf mit passendem `reaped_count`. Anschließend Testzeile entfernen.


## C — Persistente append-only Callback-Telemetrie (C1)

Neue, isolierte Tabelle `public.composer_callback_observations` — rein diagnostisch, keine Orchestrierungsdaten:

- Zeitstempel, `handler`, `pipeline_job_id`, `stage`, `verdict`, `scene_id`, `run_id`, `plate_generation`, `external_job_id`, kleines `details` JSONB.
- Append-only: kein UPDATE/DELETE für irgendeine Rolle; Insert ausschließlich über `SECURITY DEFINER`-RPC `composer_record_callback_observation`, `EXECUTE` nur für `service_role`, `REVOKE` für `PUBLIC`/`anon`/`authenticated`.
- RLS aktiv, keine Client-Policies (kein Frontend-Zugriff), keine `anon`-Grants.
- Keine Fremdschlüssel auf `composer_pipeline_jobs`/`composer_scenes`, damit Telemetrie niemals einen Produktionspfad blockieren oder Löschungen behindern kann.

Verdrahtung: `observeCallbackProvenance()` schreibt im bestehenden `emit()`-Pfad zusätzlich zum Log genau eine Telemetriezeile. Der Aufruf ist in `try/catch` gekapselt und ohne Auswirkung auf Rückgabewert oder Verdikt; ein Telemetriefehler wird nur geloggt. Keine Änderung an Verdikt-Logik, Signaturen oder Handler-Verhalten.

Smoke C: Insert über `service_role`-RPC gelingt; direkter Insert/Update/Delete als `anon`/`authenticated` schlägt fehl; Fehler im Telemetriepfad (simuliert) verändert das Observe-Ergebnis nicht.

## Verifikation vor STOP

- DB-Smokes B und C grün, Testdaten rückstandsfrei entfernt.
- Datenbank-Linter ohne neue Findings zur neuen Tabelle/Funktion.
- Frozen-Suite gegen 536-Baseline grün, `tsgo`, `deno check` der berührten Function-Dateien.
- `docs/v431-g3-1-drain.md` fortgeschrieben: Vertragspräzisierung, Reaper-Scheduler-Nachweis, Telemetrie-Beweisgrundlage für das 60-Minuten-Gate; A weiterhin als offene Restschuld.

Danach STOP zur Freigabe von Produktionslauf #2 (bewusst einfacher Testfall ohne `tight_grid`-Retry-Bedingung); das Drain-Fenster startet mit dessen vollständiger Beobachtbarkeit neu.

## Betroffene Artefakte

- Migration: pg_cron-Job für den Reaper, `composer_callback_observations`, `composer_record_callback_observation`, Grants/Revokes.
- `supabase/functions/_shared/v431-ledger.ts`: fail-open Telemetrie-Insert + Vertragskommentar.
- Redeploy der sieben G3.1-Callback-Functions (unveränderte Logik, nur Shared-Helper).
- `docs/v431-g3-1-drain.md`.
