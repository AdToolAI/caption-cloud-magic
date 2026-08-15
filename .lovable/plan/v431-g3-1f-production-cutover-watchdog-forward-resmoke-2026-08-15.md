# v431 G3.1f — Production Cutover + Watchdog-Forward Resmoke

Kontrollierter Produktions-Cutover der bereits implementierten und lokal verifizierten G3.1f-Provenienz-Transport-Kette, gefolgt von einem gezielten echten Watchdog-Forward-Resmoke. Kein G3.2.2, keine Architekturänderung, keine neue Laufzeit-Logik.

## Schritt 1 — Pre-Deploy Cutover-Gate

Unmittelbar vor dem Deploy die zwei eingefrorenen Abfragen mit ihrem vollen In-flight-Scope erneut ausführen (keine historischen/abgeschlossenen Pre-Cutover-Rows mitzählen):

- Base-Video: nur aktive `plate_rendering`-Szenen mit `replicate_prediction_id IS NOT NULL` UND `plate_pipeline_job_id IS NULL`
- Sync: nur aktive Lip-Sync-Szenen (`lipsync_dispatched` | `lipsync_running` | `lipsync_muxing`) und darin tatsächlich in-flight Passes mit Provider-`job_id`, aber fehlendem `pipeline_job_id`


Deploy nur bei `base_unresolved = 0` UND `sync_unresolved = 0`.
Bei jedem Wert > 0: STOP, kein Deploy, kein Laufzeit-Fallback. Stattdessen regulär drainen/terminieren lassen und den Cutover später erneut ansetzen.

Zahlen + UTC-Timestamp werden im Bericht festgehalten.

## Schritt 2 — Production Deployment (nur G3.1f-Artefakte)

- DB-Migration / Bind-RPCs, soweit noch nicht in Production
- `compose-video-clips`
- `compose-dialog-segments`
- `lipsync-watchdog`
- `recover-stuck-composer-clip`
- `modelark-poll`

Ausdrücklich nicht: Apply-Semantik von `sync-so-webhook`, kein G3.2-Artefakt, kein Frontend-Deploy.

Danach Security-/Schema-Smoke für `composer_bind_plate_attempt` und `composer_bind_sync_pass_attempt`:
genau eine Signatur, service_role-only, gehärteter `search_path`, korrekte Stage-Gates.

## Schritt 3 — Gezielter echter Watchdog-Forward-Resmoke

Echter UI-Lip-Sync-Run, bei dem ein realer Sync.so-Job über `lipsync-watchdog` gepollt und an `sync-so-webhook` weitergeleitet wird. Der direkte Provider-Callback allein zählt nicht als Abnahme — der Nachweis muss den Re-Injection-Pfad exercisen (Timing so wählen, dass der Watchdog-Takt den terminalen Provider-Job vor/parallel zum Direkt-Callback aufnimmt).

Bestanden nur wenn für denselben echten Provider-Job belegt ist:

- Dispatch besitzt einen `composer_pipeline_jobs`-Job mit korrektem Run + `plate_generation`
- `dialog_shots.passes[i].job_id` und `pipeline_job_id` bilden das korrekte Attempt-Paar
- Watchdog liest genau diesen `pipeline_job_id` und sendet ihn im Forward mit
- `composer_callback_observations` bewertet den Forward als `bound`
- kein `missing_binding` für diesen Forward
- kein neuer Ledger-Job, kein neuer Attempt durch die Re-Injection
- Run-/Generation-/Pass-Identität unverändert
- Pipeline läuft fachlich normal weiter bzw. idempotente Fan-in-Semantik greift korrekt

Zusätzlich müssen direkter Provider-Callback und Watchdog-Forward im Nachweis sauber auseinandergehalten werden: gleicher `external_job_id`, gleicher `pipeline_job_id`, aber der zweite `bound`-Nachweis muss per Watchdog-Log und Timestamp eindeutig dem internen Forward zugeordnet sein. Genau dieser zweite Eintrag ersetzt den früheren `missing_binding`-Befund.


## Schritt 4 — Regression-/Telemetry-Check im Resmoke-Fenster

- `missing_binding = 0` für neue G3.1f-Re-Injections
- `wrong_job = 0`, `stale_run = 0`, `stale_generation = 0`
- `binding_pending = 0`, außer nachweislich kurzer Dispatch-Race ohne Apply
- keine `reinject_missing_pipeline_job_id`-Errors

Die beiden latenten Base-Video-Forwarder werden nicht künstlich provoziert; ihr Vertrag bleibt durch S1–S9 + statischen Guard abgedeckt. Kein absichtliches Stören eines echten Plate-Runs.

## Schritt 5 — Abschluss

`docs/v431-g3-1f-report.md` um Cutover-Werte, Deploy-Zeitstempel, Resmoke-Belege (Job-/Run-IDs, Observations-Verdikte) und Telemetrie-Auswertung ergänzen.

Bei vollständig grünem Ergebnis:

- G3.1f → DONE / FROZEN
- explizit festhalten: G3.2.2 kann anschließend geöffnet werden

Danach STOP — G3.2.2 wird in diesem Schritt nicht implementiert.

## Technische Notizen

- Cutover-Abfragen und Telemetrie-Auswertung read-only über die Datenbank-Lesetools.
- Deployment strikt auf die fünf genannten Functions plus ausstehende Migration begrenzt.
- Der Resmoke wird als echter UI-Run über den Preview-Browser gefahren; Belege kommen aus `composer_pipeline_jobs`, `composer_callback_observations`, `composer_scenes` und den Function-Logs.
- Bei rotem Gate in Schritt 1 oder rotem Nachweis in Schritt 3: Abbruch mit Befundbericht, keine Reparatur ohne neue Freigabe.
