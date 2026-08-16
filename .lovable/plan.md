# FA-3/P1 — Stitch Finalizer Output Materialization

Nur Contract-Conformance: der Stitch-Finalizer schreibt den finalen Lip-Sync-Output künftig vollständig nach v430-Outputvertrag. Reader bleiben unverändert.

## Befund (verifiziert)

`composer_finalize_lipsync_scene` (Migration `20260816185114_…`) setzt im Erfolgszweig:
`pipeline_state='complete'`, `clip_status='ready'`, `clip_url=_final_url`, `lip_sync_status='done'`, `lip_sync_applied_at`, `lip_sync_source_clip_url`, `twoshot_stage='done'`, `dialog_shots.final_url/status/audio_mux`.
`processed_video_url` wird **nicht** gesetzt. Damit greift in `resolveSceneOutput()` nur der Legacy-Zweig (`clip_url` bei `lip_sync_status='done'`), und `isSceneOutputFinal()` liefert für intentionalen Lip-Sync `false` (prüft ausschließlich `processed_video_url`).

## Änderung

Genau eine neue Migration, die `composer_finalize_lipsync_scene` mit identischer Signatur ersetzt (`CREATE OR REPLACE`). Einziger Diff im Erfolgs-UPDATE der Szene:

- `processed_video_url = _final_url`
- `clip_url = _final_url` (Compatibility-Alias, unverändert vorhanden)
- `base_video_url` bleibt unangetastet (der Plate-Writer besitzt diese Spalte)

Alles andere bleibt byte-gleich: Guard-Matrix, Verdicts, Lock-Reihenfolge (Job → Scene), `_write_id='stitch:done'`-Allowlist, RS3-Epoch-Fence, Ledger-Terminalisierung, `audio_mux`-Merge, Transition-Log, REVOKE/GRANT (`service_role` only).

Nicht geändert: `resolveSceneOutput()`, `isSceneOutputFinal()`, `materialize-scene-output.ts`, `remotion-webhook`, Sync-Apply (G3.2.2), Mux Exactly-Once, Legacy-Wrapper.

### Duplicate-Semantik

`already_completed` bleibt ein reiner Vorab-Verdict ohne Scene-Write: keine Reparatur, kein Löschen, kein zweiter Finalize-Write. Historische Zeilen mit `complete` + `processed_video_url IS NULL` werden **nicht** automatisch nachgezogen. Für neue Finalisierungen ist dieser Zustand ausgeschlossen, weil Terminalisierung und Materialisierung in derselben Transaktion passieren.

## Tests

1. SQL-Contracttests (`tests/v431-g3-2-2-f1-contract-tests.sql`, self-cleaning) erweitern:
   - Happy Path `dispatched → stitch:done`: Ledger `succeeded`, Scene `complete`, `processed_video_url = final_url`, `clip_url = final_url`, `mux_dispatch_requested_at` erhalten.
   - Duplicate: `already_completed`, `processed_video_url`/`clip_url` unverändert.
   - Bestehende Fälle 3–8 (invalid_write_id, wrong_job, dispatch_uncertain, RS3 pre/post reset) unverändert grün.
2. Vitest-Ergänzung in `src/lib/composer/output/__tests__/` bzw. `continuityState`-Suite: Zeilenform nach Finalisierung ergibt `resolveSceneOutput() → { source: 'processed', url: final_url }` und `isSceneOutputFinal() → true`; Non-Lip-Sync-/Plate-Outputvertrag unverändert.
3. Bestehende Frozen-Suiten (F1, G3.2.2, RS3, Parity/Mirror-Tests) laufen unverändert.

## Abschluss

Kurzer P1-Nachtrag in `docs/v433-motion-studio-final-acceptance.md` (Root Cause, Diff, Testnachweis, Duplicate-Regel, Hinweis: historische Szenen bleiben unangetastet).

Danach **STOP vor Deploy/Resmoke**. FA-3 wird nach Freigabe mit einer frischen Szene wiederholt, nicht mit S06. FA-1/FA-2 bleiben PASS.
