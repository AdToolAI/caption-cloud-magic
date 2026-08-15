# v431 G3.1 — Finale Vollfenster-Auswertung (T0 → Fensterende)

Kein Code-Change, keine Migration, kein neuer Lauf, kein G3.2. Nur lesende Abfragen plus Abschluss des Berichts.

```text
T0            = 2026-08-15T10:47:35Z
Fensterende   = 2026-08-15T11:47:35Z (abgelaufen)
Auswertung bis = jetzt
G3.2 LOCKED bis zur formalen Abnahme
```

## 1. Gates über das gesamte Fenster

Maßgeblich ist `composer_callback_observations` (persistent, append-only), gefiltert auf `>= T0`.

- Harte Gates, jeweils 0: `missing_binding`, `job_not_found`, `wrong_job`
- Separat gezählt: `binding_pending` (mit Job/Kanal benannt, falls > 0)
- Rein diagnostisch: `stale_run`, `stale_generation` — jeder Fall auf legitimen Run-/Generation-Wechsel zurückführen
- Sonstige Verdikte (`observe_error` u. a.) separat ausweisen

Zusätzlich: Verdikte je Handler/Kanal aufgeschlüsselt, damit eine Gesamt-0 keinen unbeobachteten Kanal verdeckt.

## 2. Kanalnachweis

Erwartete Kanäle des erfolgreichen Laufs #2 (Base Video / Sync.so-Segment / Audio-Mux) müssen je mindestens ein Post-T0-Event mit Verdikt `bound` haben. Kanäle ohne Post-T0-Verkehr — insbesondere Remotion, das in Lauf #2 nicht durchlief — werden ausdrücklich als `not_observed` markiert, nicht als PASS.

## 3. Ledger-Gegenprobe

Gegen `composer_pipeline_jobs` für alle Post-T0-Zeilen: je Dispatch genau ein Ledger-Job, Callback-`pipeline_job_id` trifft diesen Job, `plate_generation` gesetzt, Attempt-Verteilung (Attempt 1 vs. Replace), kein Initial-Acquire mit `attempt_no > 1`, keine unerwarteten parallel aktiven Attempts derselben Identität.

## 4. Reaper-Heartbeat über das gesamte Fenster

`cron_heartbeats` hält nur den jeweils letzten Lauf (Upsert, `last_run_at` / `last_status`), belegt also keine Lückenfreiheit. Der Nachweis „ohne Aussetzer" wird daher aus `cron.job_run_details` für den Job `composer-reap-orphaned-dispatches` geführt: Anzahl Läufe im Fenster gegen erwartete Minutentaktung, jeder Lauf `succeeded`, größter Abstand zwischen zwei Läufen ausgewiesen. Ergänzend der aktuelle Heartbeat-Stand (`last_status`, `last_run_at`, `consecutive_failures`).

## 5. Abschluss des Berichts

`docs/v431-g3-1-drain.md` erhält den Abschnitt „Vollfenster-Auswertung":

- Gate-Tabelle je Kanal (Events, missing_binding, job_not_found, wrong_job, binding_pending, stale_run, stale_generation)
- Ledger-Gegenprobe und Attempt-Verteilung
- Reaper-Lückenfreiheitsnachweis
- Restschuld A (`watchdog_no_prediction_id`) bleibt offen dokumentiert
- Zeitstempel des letzten geprüften Events

Abschlussverdikt (0/0/0 allein genügt nicht):

- 0/0/0, Reaper lückenlos **und** alle vier Kanäle (Base Video, Sync.so-Segment, Audio-Mux, Remotion) mindestens einmal Post-T0 mit `bound` beobachtet → `G3.1 DONE / FROZEN`.
- 0/0/0 und Reaper lückenlos, aber Remotion weiterhin `not_observed` → `G3.1 DRAIN GATES PASS / REMOTION CHANNEL NOT YET OBSERVED` — ausdrücklich noch nicht DONE / FROZEN. Offener Rest: ein gezielter echter Mux/Remotion-Happy-Path, keine neue Architektur- und keine neue 60-Minuten-Runde.
- Andernfalls Befund dokumentieren, keine Reparatur.

Danach STOP. G3.2 bleibt gesperrt und wird nur auf separaten Auftrag freigegeben.

## Technische Details

- Nur lesend: `supabase--read_query` (Observations, Ledger, `cron.job_run_details`, `cron_heartbeats`), ergänzend `supabase--edge_function_logs`.
- Einziger Schreibvorgang: `docs/v431-g3-1-drain.md`.
