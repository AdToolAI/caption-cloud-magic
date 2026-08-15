# v431 G3.2.2 — Acceptance Remediation R1

Ziel: die sechs Acceptance-Befunde F1–F6 schließen, S10 echt parallel ausführbar machen,
danach das vollständige Acceptance Gate erneut fahren. Kein Deploy, kein G3.2.3,
keine neue Architektur. `docs/v431-g3-2-2-contract.md` bleibt LOCKED und unverändert.

## Vorab verifizierte Fakten

- `composer_state_from_legacy` hat keinen Fall für `audio_muxing` (weder in `_twoshot_stage`
  noch in `_lip_sync_status`) — der Wert fällt auf den `clip_status='ready' + clip_url`-Fall
  und liefert `plate_ready`. Der Rückschritt entsteht im Legacy-Zweig von
  `composer_scene_state_bridge`, der `derived` bedingungslos übernimmt.
- Die vorhandene G0/G3-Audit-Infrastruktur ist `public.composer_scene_transition_log`;
  `composer_finalize_plate_scene` schreibt dort bereits zwei Audit-Zeilen (A-Compat-Patch).
  Keine neue Telemetrie-Tabelle nötig.
- Rechte-Realität für S10: `composer_apply_sync_segment_result` ist auf
  `postgres`, `service_role`, `sandbox_exec_lbunafpxuskwmsrraqxl` gegrantet — die Rolle
  der Shell-Sessions ist `sandbox_exec` und fehlt dort. Für
  `composer_acquire_pipeline_attempt` und `composer_replace_pipeline_attempt` existiert
  der `sandbox_exec`-Grant bereits (Präzedenzfall). `cron`-Schema ist für die Rolle
  gesperrt, `dblink`/`pg_background` sind nicht installiert.

## Arbeitsschritte

### R1 — F1: `mux_dispatch_requested_at` (RED)
In `composer_apply_sync_segment_result`, unter dem bestehenden Scene-Row-Lock:
`_ds := jsonb_set(_ds, '{audio_mux}', COALESCE(_ds->'audio_mux','{}'::jsonb), true)` vor dem
Detail-Write; danach wird **ausschließlich** `mux_dispatch_requested_at` schmal gesetzt.
`dispatched_at` schreibt der Apply-RPC **nicht** — weder im Erst- noch im Redrive-Zweig;
dieses Feld gehört allein dem Dispatch-Owner nach erfolgreichem `audio_mux`-Acquire.
`mux_dispatch_requested_at` ist damit nur der re-drivable Request-Claim, Exactly-once bleibt
am Ledger-Acquire. Kein Whole-JSON-Replace, Sibling-Keys bleiben erhalten. Duplicate-Redrive:
fehlender `audio_mux`-Ledger-Attempt ⇒ erneut `dispatch_mux`, vorhandener Attempt ⇒ `noop`.
Smokes: fehlender Parent, vorhandener Parent mit Sibling-Keys, Duplicate/Crash-Redrive,
plus negativer Guard „`dispatched_at` bleibt nach Apply unverändert/abwesend".


### R2 — F2: `composer_touch_lipsync_progress`
Interner SQL-Helper wie im Contract §7 spezifiziert; die heutige Inline-Progress-Semantik
(`lip_sync_status='running'`, `twoshot_stage='syncso_fanout_<done>_of_<total>'`,
`updated_at=now()`) wandert wertgleich dorthin. `SECURITY DEFINER`,
`search_path = pg_catalog, public`, `REVOKE ALL FROM PUBLIC`, **kein** Grant an `anon`,
`authenticated` oder Edge; Aufruf nur aus `composer_apply_sync_segment_result`.
Keine zusätzliche Transition-Autorität, keine State-Entscheidung im Helper.
Smoke: Wert-für-Wert-Vergleich Inline vs. Helper für `done/total`-Kombinationen.

### R3 — F3: Legacy→State-Bridge, nur der nachgewiesene Fall
`audio_muxing` (in `twoshot_stage` bzw. `lip_sync_status`) wird als Legacy-Kompatibilitätswert
auf `lipsync_running` abgebildet — nicht auf `lipsync_muxing`. Damit bleibt der Mux-Owner
alleiniger Owner von `lipsync_muxing`, der Handoff erzeugt aber keinen kanonischen
Rückschritt auf `plate_ready`. Zusätzlich im Legacy-Zweig der Bridge eine enge Anti-Regressions-Klausel
ausschließlich für diesen Handoff: befindet sich die Scene bereits in
`lipsync_dispatched|lipsync_running|lipsync_muxing` und wäre `derived = plate_ready`
allein wegen eines unbekannten Lip-Sync-Legacy-Werts, bleibt der bestehende State stehen.
Keine sonstige Bridge-Semantik wird angefasst.
Regression-Smoke: `plate_ready → lipsync_dispatched → lipsync_running → mux handoff`
sowie die bestehenden Legacy-Pfade (fail/cancel/complete) unverändert.

### R4 — F4: stale Test-Guard
`src/lib/composer/output/__tests__/materializeSceneOutput.test.ts` auf §6 ziehen:
negativer Guard, dass `sync-so-webhook` kein `materializeCompatibilityOutput(` enthält,
positiver Guard, dass der Aufruf im vorgesehenen Finalizer-Pfad existiert.
Keine Produktionslogik wird an den alten Test angepasst.

### R5 — F5: verbliebener Direct-Write im Recovery-Zweig
`sync-so-webhook/index.ts` (~L599, Recovery aus selbstverschuldetem `watchdog_*`-Fail):
Der Scene-/Pass-Apply entfällt. Der Pfad wird entweder über
`composer_apply_sync_segment_result` geführt oder bei `rejected`/`noop` vollständig
write-free (nur Logging/Netz-Cleanup). Danach Static Writer Guard erneut:
0 unautorisierte Sync-Apply-Writer.

### R6 — F6: DB-Audit in derselben Transaktion
`composer_apply_sync_segment_result` schreibt für `applied`, `noop` und `rejected` je eine
Zeile in `composer_scene_transition_log` (bestehende G0/G3-Infrastruktur, kein zweiter SoT)
im selben Commit. Inhalt ausreichend zur Rekonstruktion: `scene_id`, `run_id`,
`plate_generation`, `pipeline_job_id`, `external_job_id`, `write_id`, `pass_idx`,
`segment_result`, `verdict`, `reason`, Vorher/Nachher-State. Edge-seitige
`composer_callback_observations` bleiben ergänzend, ersetzen das Audit nicht.

### R7 — S10 echt parallel (Pre-Deploy-Gate)
Migration ergänzt den fehlenden `GRANT EXECUTE ... TO sandbox_exec` auf
`composer_apply_sync_segment_result` (identischer Präzedenzfall wie bei
`composer_acquire_pipeline_attempt`; kein `anon`/`authenticated`). Harness:
zwei echte parallele `psql`-Sessions, Barrier über `pg_advisory_lock`, beide auf dieselbe
Scene/denselben letzten Pass, jede Session ruft nach `dispatch_mux` instrumentiert
`composer_acquire_pipeline_attempt('audio_mux')`. Erwartung: mehrfaches `dispatch_mux`
zulässig, **genau ein** `audio_mux`-Ledger-Attempt, **genau ein** simulierter Provider-Invoke.
Testdaten sind synthetisch und werden am Ende vollständig gelöscht.
Ist der Grant nicht durchsetzbar oder bleibt die Parallelität technisch blockiert:
STOP mit präzisem Infrastruktur-Befund — kein schwächerer Single-Session-Ersatz,
keine Umdeklaration als Production-Smoke.

### Recheck (vollständig, nicht nur die reparierten Fälle)
S1–S17 inkl. S3b/S16b, S10 parallel, Security-Smokes (DEFINER/search_path/Grants/Overloads),
Static Writer Guard, Frozen-Suite, `tsgo`, Deno-Baseline, G3.1/G3.1f-Regression, G3.2.1-Regression.
Ergebnis wird in `docs/v431-g3-2-2-report.md` ergänzt.

## Technische Artefakte

- Migration 1: `composer_apply_sync_segment_result` (R1, R2-Aufruf, R6) +
  `composer_touch_lipsync_progress` (R2) + `composer_state_from_legacy` /
  `composer_scene_state_bridge` (R3) + Grant für S10 (R7).
- `supabase/functions/sync-so-webhook/index.ts` (R5).
- `src/lib/composer/output/__tests__/materializeSceneOutput.test.ts` (R4).
- Harness-Skripte unter `/tmp` (nicht im Repo), Smoke-SQL transaktional mit Rollback,
  außer S10 (braucht committete Zeilen, danach Cleanup).
- `docs/v431-g3-2-2-report.md` (Recheck-Abschnitt).

## Abschluss

Nur wenn alle REDs geschlossen sind, F2 deviationsfrei ist und S10 tatsächlich PASS liefert:
**G3.2.2 IMPLEMENTED / VERIFIED — READY FOR DEPLOY REVIEW**. Danach STOP.
Kein Deploy, kein G3.2.3.
