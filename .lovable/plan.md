# v431 G3.2.1 — Deploy `compose-clip-webhook` + Post-Deploy-Plate-Callback-Smoke

Scope strikt: eine Edge-Function deployen, einen echten Plate-Callback beobachten, Bericht abschließen, STOP.

## Nicht Teil dieses Schritts

- Kein Frontend-Deploy (die Gate-3-Casts bleiben undeployed).
- Keine weiteren Edge-Functions.
- Keine Migration, kein Schema-Change, keine RPC-Änderung.
- Kein G3.2.2.
- Keine Reparatur, falls der Lauf scheitert — nur dokumentieren.

## Schritt 1 — Deploy

`compose-clip-webhook` allein deployen. Deploy-Zeitstempel (UTC) als `T_deploy` festhalten; alles vor `T_deploy` zählt nicht als Beweis.

## Schritt 2 — Echter Produktionslauf

Ein bewusst einfacher UI-Lauf über die Preview (eine Szene, Plate-Pfad über `compose-clip-webhook`), vollständig nach `T_deploy` gestartet. Vor dem Start Run-Identität notieren: `scene_id`, `run_id`, `plate_generation`.

## Schritt 3 — Beobachtungs-Gates

Rein lesende Abfragen gegen Ledger, Scene, Transition-Log und persistente Telemetrie:

| Gate | Erwartung |
| --- | --- |
| Ledger-Bindung | Attempt 1, `external_job_id` gebunden, `plate_generation` passend |
| Apply | genau eine Zeile RPC A / `applied = true` im Transition-Log, run- und generationsgebunden |
| Ledger-Abschluss | Plate-Job → `succeeded`, atomar mit dem Apply |
| Scene-State | `plate_ready` oder legitimer Bridge-Folgezustand (die Bridge darf weiterschieben) |
| Outputs | `base_video_url` und `clip_url` korrekt gesetzt |
| Output-Invarianz | `processed_video_url` unberührt |
| Observe | Verdikt `bound` in `composer_callback_observations` |
| Fehlserie | keine `binding_pending`-/409-Serie im Fenster |
| Duplicate | erneuter Callback bleibt No-op (`applied = false`, `duplicate_callback`, keine Scene-Mutation) |

Der Duplicate-Check wird nicht künstlich provoziert, wenn der Provider nicht ohnehin doppelt zustellt; in dem Fall zählt der bereits belegte Smoke S7 und der Lauf wird als „nicht real beobachtet" ausgewiesen statt als bestanden behauptet.

Tritt ein Handoff-Failure real auf: prüfen, dass H nur aus der belegten Matrix (`plate_ready | audio_prep | audio_ready`) gegriffen hat und `base_video_url` / `clip_url` / `processed_video_url` / `clip_status` / `dialog_shots` unverändert sind.

## Schritt 4 — Bericht

`docs/v431-g3-2-1-report.md` um einen Abschnitt „Post-Deploy-Smoke" ergänzen: `T_deploy`, Run-Identität, Gate-Tabelle mit Ist-Werten, Verdikt. Status wird auf `DEPLOYED / POST-DEPLOY-SMOKE <Verdikt>` gesetzt; `G3.2.1 DONE / FROZEN` schreibt erst die Abnahme des Nutzers.

Danach STOP.

## Bekannte Risiken aus vorherigen Läufen

- Restschuld A (`watchdog_no_prediction_id` vor erstem Provider-Callback) ist offen. Schlägt der Lauf daran fehl, wird das dokumentiert und der Smoke als `INCONCLUSIVE` gewertet — keine Reparatur in diesem Schritt.
- Analytics-Log-Retention ist kurz; maßgebliche Beweisquelle ist die persistente Telemetrie plus Ledger und Transition-Log.
