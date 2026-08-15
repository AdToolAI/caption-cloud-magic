# v431 G3.1c — Drain-Befund / reine Ursachenanalyse

Kein Code-Change, keine Migration, kein neuer Produktionslauf, kein G3.2. Nur lesende Analyse plus ein Dokument-Update.

Status bleibt: `G3.1 DEPLOYED / DRAINING`, `G3.2 LOCKED`, T0 = 2026-08-15T09:05:17Z.

## 0. Bericht festschreiben (c)

`docs/v431-g3-1-drain.md` erhält den Abschluss zu Produktionslauf #1:

- Verdikt **INCONCLUSIVE / NOT OBSERVED** — alle vier Callback-Kanäle `not_observed`, harte Gates formal 0 mangels Verkehr, damit kein Abnahmewert.
- Klare Trennung der drei Befunde: (A) Dispatch-Pfad, (B) Reaper-Lifecycle, (C) Messbarkeit.
- Kein Abnahmehaken für G3.1.

## A — `watchdog_no_prediction_id`

Rekonstruktion für Szene `b34d1eae`, Run `62949b1b-6d2f-4e25-9757-bcfc87cf8a17`, `plate_generation = 3` entlang der Kette:

```text
composer-start-scene-generation
  -> compose-video-clips
    -> Anchor-Erzeugung
      -> Provider-Dispatch
        -> Prediction-ID-Bindung (bindLedgerExternalJob)
          -> lipsync-watchdog Fail
```

Vorgehen: Code-Lesung der Branches in `compose-video-clips` zwischen Ledger-Akquise und Provider-Call, Anchor-Vorlauf und dessen Abbruchpfade, plus alle Stellen, die `watchdog_no_prediction_id` setzen. Gegenprobe mit den persistierten Szenen-/Run-/Ledger-Feldern (Zeitstempel, `pipeline_substate`, `clip_error`, Anchor-Felder), da die Function-Logs für 09:23–09:34 nicht mehr existieren.

Ergebnis: exakter Punkt, an dem der Provider-Dispatch ausblieb; Grund, warum `external_job_id` nie gebunden wurde; betroffener Branch; vorhandene Guard-/Failure-Semantik an dieser Stelle. Keine Reparatur.

## B — Reaper

Zielzeile: Ledger-Job `b02ae224-7f6f-40a1-8b32-c6e1313f7e12` (`dispatching`, `external_job_id = NULL`, seit 09:23:06Z).

Geprüft wird, jeweils mit Beleg:

- Existiert `composer_reap_orphaned_dispatches` in Produktion (Definition aus dem Katalog gelesen)?
- Ist ein Cron/Scheduler dafür registriert, mit welcher Frequenz, wann lief er zuletzt?
- Tatsächlicher Age-Threshold im Funktionskörper.
- Eligibility-Prädikat, ausgewertet gegen genau diese Zeile — welches Prädikat schließt sie aus (Status, `dispatch_started_at`/`created_at`, `external_job_id`, Attempt-/Run-Felder)?
- Lief der Reaper und die Mutation schlug fehl (Rechte/REVOKE, Guard-Trigger, Immutabilitäts-Guard)?

Vertragsmaßstab bleibt: verwaistes `dispatching` → **recoverable `dispatch_uncertain`**, niemals `stale`, niemals terminal.

## C — Drain-Telemetrie

Reale Retention von `function_logs` und `function_edge_logs` wird gemessen (ältester und jüngster Eintrag je Quelle, mehrfach abgetastet) und belegt.

Danach Optionen-Vergleich, **ohne** Vorentscheidung — das eingefrorene G3.1-Observe ist bewusst read-only, ein INSERT im Observe-Pfad wäre eine Vertragsänderung:

| Option | Wirkung auf Callback-Verhalten | Beweisbarkeit 60-Min-Gate |
| --- | --- | --- |
| Append-only Observe-Telemetrie, separater fail-offener Telemetry-Vertrag | Schreibpfad im Callback, muss strikt fail-open sein | vollständig |
| Vorhandener langlebiger Log-Sink (falls verfügbar) | keine | abhängig vom Sink |
| Periodisches Log-Snapshotting in Intervallen < Retention | keine | lückenhaft bei Ausfall des Snapshotters |

## Ergebnisform

Für A, B und C jeweils:

- `root cause / confirmed` **oder** `not yet proven`
- betroffene Code-/Schema-Stellen
- minimal nötige Korrektur
- ob sie Voraussetzung für Produktionslauf #2 ist

Danach STOP. Keine Reparatur, kein neuer Lauf. Gate für Lauf #2: Reaper funktioniert, `watchdog_no_prediction_id`-Pfad verstanden, belastbare 60-Minuten-Telemetrie-Strategie beschlossen.

## Technische Details

- Nur lesende Werkzeuge: `supabase--read_query` (Ledger, Szenen, `pg_proc`/`cron.job`/`cron.job_run_details`), `supabase--analytics_query`, `supabase--edge_function_logs`, Datei-Lesungen.
- Einziger Schreibvorgang im gesamten Auftrag: `docs/v431-g3-1-drain.md`.
