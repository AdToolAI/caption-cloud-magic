# v431 — Einordnung `missing_binding` + G3.1e Analyseblock

## Antwort auf die Rückfrage: Ja, alle drei Punkte treffen zu

Der zweite Sync.so-Callback ist **kein** legacy/in-flight-Artefakt, sondern ein echter
G3.1-Coverage-Befund.

Belege aus dem Resmoke-Fenster (Szene `b34d1eae…`, Run `73efdcab…`, `plate_generation = 5`):

| Zeit | Quelle | `pipeline_job_id` | Verdikt |
| --- | --- | --- | --- |
| 16:14:01.418Z | echter Provider-Webhook | `7b234ad8…` | `bound` |
| 16:14:03.006Z | interner Forward | fehlt | `missing_binding` |

- Gleicher aktueller Run und gleicher echter Provider-Job: beide Observationen tragen
  `external_job_id = 56267d8e-2408-42d9-a03a-d2249bbfc405`, Stage `sync_segment`, Gen 5.
- Nach der G3.1-Verdrahtung: der Ledger-Job existierte zu dem Zeitpunkt bereits und wurde
  2 Sekunden vorher korrekt gebunden.
- Ohne `pipeline_job_id`: der zweite Aufruf kam ohne den Query-Parameter an, deshalb liefert
  `observeCallbackProvenance` das Basisverdikt `missing_binding`.

**Ursache (verifiziert):** `lipsync-watchdog` pollt terminale Sync.so-Jobs und leitet die
Provider-Antwort an den eigenen Webhook weiter — Log 16:14:07Z:
`polled job=56267d8e… status=COMPLETED → forwarded to webhook scene=b34d1eae…`.
Die dort gebaute URL (`lipsync-watchdog/index.ts`, ~Zeile 192) enthält nur `scene_id` und
`token`. Der reguläre Dispatcher (`compose-dialog-segments`, ~Zeile 6010) hängt dagegen
`&pipeline_job_id=…` an. Der Watchdog-Forward transportiert die Ledger-Bindung also nicht.

Konsequenz laut Deinem Vertrag: **G3.2.1 DONE / FROZEN**, davor kein G3.2.2 — stattdessen ein
kleiner **G3.1e**-Analyseblock.

## G3.1e — Scope (nur Analyse, keine Code-Änderung)

1. **Bestandsaufnahme aller Callback-Wiedereinspeise-Pfade**, die einen Handler mit
   Ledger-Observe aufrufen, ohne selbst Dispatcher zu sein:
   - `lipsync-watchdog` → `sync-so-webhook` (bestätigter Befund),
   - `report-lipsync-motion-probe` Re-Dispatch (~Zeile 271, „gleiche Form wie sync-so-webhook"),
   - etwaige weitere Selbst-/Fan-out-Invokes in `sync-so-webhook`, `compose-dialog-segments`
     und `remotion-webhook`, die eine Webhook-URL ohne `pipeline_job_id` bauen.
   Ergebnis: Tabelle Pfad → trägt Bindung ja/nein → welcher Verdikt-Fall entsteht.
2. **Telemetrie-Rückblick** über das gesamte G3.1-Drain-Fenster und danach:
   alle `missing_binding`-Zeilen nach Handler, Stage und `external_job_id` gruppieren und
   jede Zeile einem der Pfade aus (1) zuordnen. Prüfen, ob das ursprüngliche
   Drain-Gate-Ergebnis (`missing_binding = 0`) nur deshalb grün war, weil der Watchdog in
   diesem Fenster nie forwarden musste.
3. **Bindungs-Auflösung bewerten:** Soll der Forwarder die `pipeline_job_id` mitgeben
   (bevorzugt, weil provenienz-treu) oder soll Observe zusätzlich über
   `external_job_id + stage + scene_id` auflösen dürfen? Trade-offs, Risiko für
   `wrong_job`/`stale_generation`, und wie sich das zu G3.2 (Apply liest die Bindung
   entscheidend, nicht mehr nur beobachtend) verhält.
4. **Bericht** `docs/v431-g3-1e-analysis.md` mit Befund, betroffenen Pfaden,
   empfohlenem Fix-Umfang (G3.1f) und expliziter Aussage, ob G3.2.2 blockiert ist.

Nicht in G3.1e enthalten: Code-Änderungen, Migrationen, Deploys, Produktionsläufe.

## Parallel: G3.2.1 abschließen

- `docs/v431-g3-2-1-report.md`: Status auf **DONE / FROZEN** setzen und die
  `missing_binding`-Zeile von „Vormerkung G3.2.2" auf „G3.1e-Befund (Watchdog-Forward ohne
  Ledger-Bindung)" korrigieren.

## Technische Details

- Kein Redeploy, keine DB-Änderung in diesem Schritt.
- Beweisquellen: `composer_callback_observations` (append-only), `composer_pipeline_jobs`,
  Edge-Function-Logs `lipsync-watchdog`.
