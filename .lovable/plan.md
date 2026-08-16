# v431 G3.2.2-F1.IMP — Edge Deploy + Production Resmoke

Keine DB-Migration. Keine Crash-Test-Migration. Nur zwei Edge-Deploys plus realer End-to-End-Nachweis, read-only verfolgt.

## 1. Security-Smoke vor Deploy (read-only)
Prüfen für `composer_finalize_lipsync_scene`: genau eine Signatur, SECURITY DEFINER, EXECUTE nur `service_role` (anon/authenticated/PUBLIC = false), keine Testfunktionen, Test-Grants oder Test-Rows.
PUBLIC=false wird per tatsächlicher Privilege-Prüfung (`has_function_privilege`) belegt, nicht aus proacl-Text abgeleitet; Owner- und akzeptierte Plattformrollen werden getrennt dokumentiert.
Abweichung → STOP.

## 2. Deploy genau zwei Edge Functions
- `render-sync-segments-audio-mux`
- `remotion-webhook`

Sonst nichts. UTC-Zeitpunkt des zweiten erfolgreichen Deploys festhalten als `T_F1_effective`. Danach Boot-/Import-Sanity beider Functions — ausschließlich harmloser Handler-/Validation-Nachweis (keine valide Stitch-Payload, keine State-Mutation). Deploy- oder Importfehler → STOP ohne Reparatur.


## 3. Post-Deploy Static Sanity am produktiven Stand
- audio-mux: `audio_mux` wird gemerged, `mux_dispatch_requested_at` bleibt erhalten, `render_id`/`dispatched_at` additiv, `pipeline_job_id` weiter in `customData` bis Stitch.
- remotion-webhook (dialog-stitch success): keine direkte Scene-Finalisierung, kein `materializeCompatibilityOutput`-Fallback, mit `pipeline_job_id` → Finalizer `stitch:done`, ohne → Observation ohne Mutation, `no_ledger_job` → keine Mutation.

## 4. Frischer Production Resmoke
Neue Szene über den normalen Produktpfad (nicht `b34d1eae…`, nicht `be06d0fd…`): single-speaker, non-tight, intentional Lip-Sync, Dialog/Voice vollständig, sicherer sync-segments → audio_mux → Stitch-Pfad.
Pre-Start-Snapshot: Ledger 0 Rows, kein `sync_segment`, kein `audio_mux`, kein RS3-Marker, keine alten Pass-/Job-Pointer. Danach genau ein UI-Lauf.

## 5. Front-Half nur bestätigen (frozen)
serialized acquire → sync_segment → bound callback → authoritative Apply → dispatch_mux → genau ein `audio_mux` → realer `render_id`. Abweichung → FOLLOW-UP BEFUND, STOP.

## 6. F1-Hauptabnahme
- A Narrow Patch: `mux_dispatch_requested_at` + `dispatched_at` + `render_id` gleichzeitig vorhanden.
- B Ledger: derselbe `audio_mux`-Job `dispatched → succeeded`, `completed_at` gesetzt, kein zweiter Attempt.
- C Atomic Finalization: Finalizer-Aufruf mit korrekter `pipeline_job_id`, `external_job_id`, Confirmation-scene_id, finaler URL, `_write_id='stitch:done'`; Audit `f1:stitch:done`; danach Ledger succeeded, `pipeline_state=complete`, `processed_video_url` vorhanden, Compatibility Output korrekt. „scene complete + audio_mux dispatched" nie als persistierter Endzustand.
- D Legacy ausgeschlossen: kein `legacy_wrapper_7`/Direct-Complete als Completion-Owner; etwaige Log-Spuren exakt herleiten.

## 7. Duplicate-/Telemetry-Gates
Duplicates nur beobachten. Falls Duplicate-Stitch: Finalizer `already_completed`, keine zweite Mutation, kein zweiter Ledger-Job.
Telemetrie ab `T_F1_effective` und ab `T_run_start`: missing_binding, job_not_found, wrong_job, stale_run, stale_generation, binding_pending, reinject_missing_pipeline_job_id = 0; `missing_pipeline_job_id` = 0 für den realen Stitch-Callback; mindestens ein bound Sync-Callback; Stitch-Verdict = finalized.

## 8. Abschluss
Alles grün → `G3.2.2-F1 DONE / FROZEN` und `G3.2.2 DONE / FROZEN`; Production Evidence in `docs/v431-g3-2-2-f1-imp-report.md` und `docs/v431-g3-2-2-report.md` ergänzen. Danach STOP für Review.
Jede Abweichung → `G3.2.2 DEPLOYED — FOLLOW-UP BEFUND`, sofort STOP, kein Cleanup, kein zweiter UI-Versuch.
