# FA-3/P1 — Production DB Deploy + Verification

Deploy-only. Kein Edge-Redeploy, keine neue FA-3-Szene, kein kostenpflichtiger Render.

## 1. Migration anwenden

`supabase/migrations/20260816223000_fa3_p1_stitch_output_materialization.sql` (213 Zeilen) byte-identisch über das Migrationstool anwenden — `CREATE OR REPLACE FUNCTION composer_finalize_lipsync_scene(...)` mit identischer Signatur. Einzige semantische Änderung: `processed_video_url = _final_url` im Erfolgs-UPDATE.

Direkt nach Erfolg `select now()` abfragen und als **T_FA3_P1_db** (UTC) festhalten.

## 2. Body-/Security-Smoke (read-only)

Ein Query-Block gegen `pg_proc` / `information_schema.role_routine_grants`:

- genau eine Signatur `composer_finalize_lipsync_scene`
- `prosecdef = true`
- `proconfig` enthält `search_path=pg_catalog, public`
- EXECUTE-Privilegien über tatsächliche Privilege-Prüfung (`has_function_privilege(...,'EXECUTE')`) statt reiner ACL-Textlesung: `service_role` = true; `anon`, `authenticated` = false; `PUBLIC` = false via `has_function_privilege('public', ...)`. Owner und akzeptierte Plattformrollen (`postgres`, `supabase_admin`) werden getrennt ausgewiesen und nicht als Verstoß gewertet.
- **Struktureller Body-Nachweis** (nicht bloßes Token-Vorkommen): im Erfolgs-`UPDATE public.composer_scenes ... SET`-Block steht `processed_video_url = _final_url` und `clip_url = _final_url`; im selben SET-Block wird `base_video_url` **nicht** zugewiesen. Nachweis durch Extraktion genau dieses UPDATE-Statements aus `prosrc` und Zitat des SET-Blocks im Report.
- Guard-/Verdict-Tokens unverändert vorhanden: `already_completed`, `invalid_write_id`, `wrong_job`, `dispatch_uncertain`, `rs3_reset_id`, `mux_dispatch_requested_at`, Lock-Reihenfolge Job → Scene

Jede Abweichung → STOP, kein Nachbessern.

## 3. SQL-Contracttests

`tests/v431-g3-2-2-f1-contract-tests.sql` (self-cleaning, 222 Zeilen) gegen den installierten Body ausführen. Verbindliche Erwartungen:

1. Happy Path `dispatched → stitch:done`: Ledger `succeeded`, Scene `complete`, `processed_video_url = final_url`, `clip_url = final_url`, `mux_dispatch_requested_at` erhalten
2. Duplicate → `already_completed`, Output-Spalten unverändert
3. invalid write ID / wrong job / dispatch_uncertain / RS3 pre-reset / RS3 post-reset gemäß eingefrorener Matrix

Ein roter Fall → STOP mit Ist/Soll-Diff.

## 4. Residuen-Check

Nach dem Testlauf read-only zählen:

- Test-Scenes = 0
- Test-Ledger-Rows (`composer_pipeline_jobs`) = 0
- Test-Transition-Rows = 0
- keine zusätzlichen Funktionen im `public`-Schema gegenüber Vorzustand
- keine zusätzlichen Grants

Abweichung → STOP, ausdrücklich kein stilles Cleanup.

## 5. Report

`docs/v433-motion-studio-final-acceptance.md` um einen Abschnitt „FA-3/P1 — Production DB Deploy“ ergänzen: T_FA3_P1_db, Body-/ACL-Nachweis (Rohwerte), SQL-Testresultat pro Fall, Residuen-Nachweis.

## Abschluss

Bei durchgehend grüner Evidence lautet der Status: **FA-3/P1 DB DEPLOY VERIFIED — STOP**. FA-1 und FA-2 bleiben PASS. FA-3-Retest-Setup erst nach ausdrücklichem GO.
