# v431 G3.1d — Drain-Hardening (Reaper-Scheduler + persistente Observe-Telemetrie)

Scope strikt auf die beiden bestätigten operativen Lücken B und C. Kein Lauf #2, keine Callback-Writer-Migration, kein G3.2, keine Änderung an Lip-Sync-, Anchor- oder Provider-Logik. Befund A (`watchdog_no_prediction_id`) bleibt dokumentierte Restschuld.

## Präzisierter Observe-Vertrag

Observe ist read-only gegenüber allen Produktions- und Orchestrierungsdaten (Scene, Ledger, State, Output, Mirrors, Credits). Erlaubt ist ausschließlich ein append-only Telemetrie-Insert in eine isolierte Diagnosetabelle, dessen Fehler vollständig ignoriert wird (fail-open). Dieser Vertrag wird in `_shared/v431-ledger.ts` und in `docs/v431-g3-1-drain.md` festgeschrieben.

## B — Reaper real planen

Bestätigter Defekt: `composer_reap_orphaned_dispatches(integer)` existiert, ist korrekt gehärtet (`REVOKE PUBLIC`, `GRANT service_role`), hat aber keinen Aufrufer.

- pg_cron-Job `composer-reap-orphaned-dispatches`, Minutentakt, registriert durch die Migrations-/DB-Owner-Rolle (pg_cron läuft NICHT als `service_role`; der Job läuft unter der registrierenden DB-Rolle). Aufruf direkt in SQL, kein HTTP, kein Key im Job-Body.
- Fester Threshold: `public.composer_reap_orphaned_dispatches(10)`. Die Funktion bleibt `SECURITY DEFINER` mit gehärtetem `search_path`; die registrierende Rolle erhält explizit `EXECUTE`.
- Heartbeat entsteht im selben Cron-Lauf (ein einziges SQL-Statement/Block: Reaper aufrufen, Ergebnis in den Heartbeat schreiben) — kein zweiter unabhängiger Job, damit „Heartbeat grün, Reaper tot" ausgeschlossen ist. Inhalt: `ran_at`, verwendeter Threshold, `ok = true/false`, `error_code`/Fehlertext und `reaped_count`. `reaped_count` wird ausschließlich bei erfolgreichem Reaper-Aufruf geschrieben; bei Exception wird `ok = false` mit Fehlercode und ohne Count festgehalten, sodass Scheduler-Lauf und Reaper-Erfolg unterscheidbar bleiben.
- Idempotente Registrierung (bestehenden Job vorher entplanen), damit die Migration wiederholbar ist.

Smoke B: künstlich gealterte `dispatching`-Zeile ohne `external_job_id` anlegen → Scheduler/Reaper laufen lassen → Erwartung `status = dispatch_uncertain`, `recoverable = true`, `completed_at IS NULL`, Zeile per `pipeline_job_id` und späterer Bindung weiterhin auffindbar (Callback-Lookup unbeschädigt); Heartbeat-Zeile aus demselben Lauf mit passendem `reaped_count`. Anschließend Testzeile entfernen.


## C — Persistente append-only Callback-Telemetrie (C1)

Neue, isolierte Tabelle `public.composer_callback_observations` — rein diagnostisch, keine Orchestrierungsdaten:

- Zeitstempel, `handler`, `pipeline_job_id`, `stage`, `verdict`, `scene_id`, `run_id`, `plate_generation`, `external_job_id`, kleines `details` JSONB.
- Harte Isolation gegen Supabase-Default-Privileges: `REVOKE ALL` auf der Tabelle für `PUBLIC`, `anon`, `authenticated` **und `service_role`** — auch `service_role` darf nicht direkt an der Tabelle vorbei schreiben.
- Schreiben ausschließlich über `public.composer_record_callback_observation`: `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, alle Objekte schema-qualifiziert, `EXECUTE` nur für `service_role` (`REVOKE` für `PUBLIC`/`anon`/`authenticated`).
- Append-only als echte DB-Invariante: zusätzlich zu fehlenden Grants ein Trigger, der UPDATE und DELETE auf der Tabelle unabhängig von Rolle/RLS ablehnt.
- RLS aktiv, keine Client-Policies (kein Frontend-Zugriff), keine `anon`-Grants.
- Keine Fremdschlüssel auf `composer_pipeline_jobs`/`composer_scenes`, damit Telemetrie niemals einen Produktionspfad blockieren oder Löschungen behindern kann.

Verdrahtung: `observeCallbackProvenance()` schreibt im bestehenden `emit()`-Pfad zusätzlich zum Log genau eine Telemetriezeile. Reihenfolge verbindlich: Verdikt bestimmen → Handler-Verhalten unverändert → Telemetrie best effort. Der Insert ist ein gekapselter diagnostischer Side-Effect in `try/catch`, ohne Retry innerhalb des Callback-Pfads und ohne Exception nach außen. Weder Verdikt noch Rückgabewert, HTTP-Status oder State-/Ledger-Pfad dürfen vom Insert-Erfolg abhängen; ein Fehler wird nur geloggt. Keine Änderung an Verdikt-Logik, Signaturen oder Handler-Verhalten.

Smoke C: Insert über `service_role`-RPC gelingt; direkter INSERT/UPDATE/DELETE als `service_role`, `anon` und `authenticated` schlägt fehl; UPDATE/DELETE auch mit erhöhten Rechten durch den Trigger blockiert; simulierter Telemetriefehler verändert Observe-Verdikt und Handler-Ergebnis nicht.

## Verifikation vor STOP


- DB-Smokes B und C grün, Testdaten rückstandsfrei entfernt.
- Datenbank-Linter ohne neue Findings zur neuen Tabelle/Funktion.
- Frozen-Suite gegen 536-Baseline grün, `tsgo`, `deno check` der berührten Function-Dateien.
- `docs/v431-g3-1-drain.md` fortgeschrieben: Vertragspräzisierung, Reaper-Scheduler-Nachweis, Telemetrie-Beweisgrundlage für das 60-Minuten-Gate; A weiterhin als offene Restschuld.
- **Neues T0** = Zeitpunkt des vollständigen G3.1d-Rollouts, d. h. `max(Migration erfolgreich angewendet + Cron registriert, letzter der sieben Function-Deploys abgeschlossen)` — nicht der Deploy-Beginn, damit kein teilweise instrumentierter Traffic im Abnahmefenster landet. Das alte Fenster (T0 = 2026-08-15T09:05:17Z) ist mangels persistenter Telemetrie kein gültiges Abnahmefenster und wird als verworfen dokumentiert.

Danach STOP zur Freigabe von Produktionslauf #2 (bewusst einfacher Testfall ohne `tight_grid`-Retry-Bedingung). Lauf #2 muss vollständig nach dem neuen T0 liegen; das 60-Minuten-Drain-Fenster startet damit neu. Kein G3.2.

## Betroffene Artefakte

- Migration: pg_cron-Job für den Reaper, `composer_callback_observations`, `composer_record_callback_observation`, Grants/Revokes.
- `supabase/functions/_shared/v431-ledger.ts`: fail-open Telemetrie-Insert + Vertragskommentar.
- Redeploy der sieben G3.1-Callback-Functions (unveränderte Logik, nur Shared-Helper).
- `docs/v431-g3-1-drain.md`.
