# v431 G3.2.2 — Production Deploy Review / Cutover Gate

Kein Deploy, kein G3.2.3, keine Codeänderung. Ergebnis dieses Schritts ist ausschließlich
ein ergänzender Abschnitt in `docs/v431-g3-2-2-report.md`.

## 1. Production-Diff (artifact → reason → production required)

| Artefakt | Grund | Production nötig |
| --- | --- | --- |
| `supabase/migrations/20260815180037_*.sql` — `composer_retryable_failure_reasons()` (+`sync_noop_retryable`), `composer_mark_sync_refund_applied`, erste Fassung `composer_apply_sync_segment_result` | Basis-Vertrag G3.2.2 | ja |
| `supabase/migrations/20260815185301_*.sql` — `composer_touch_lipsync_progress` (R2), `composer_log_sync_segment_audit` (R6), `composer_state_from_legacy` + `composer_scene_state_bridge` (monotoner `audio_muxing`-Fix, R3), finale Fassung `composer_apply_sync_segment_result` (R1 ohne `dispatched_at`, R5 geguardete Recovery-Vorstufe, R6 Audit) | Remediation R1 | ja |
| Edge Function `sync-so-webhook` | einziger Laufzeit-Konsument des neuen Apply-Vertrags | ja |
| `docs/v431-g3-2-2-contract.md`, `docs/v431-g3-2-2-report.md` | Dokumentation | nein |
| `src/lib/composer/output/__tests__/materializeSceneOutput.test.ts`, SQL-Smoke-Skripte | Test/CI | nein (kein Runtime-Deploy) |
| Frontend (`src/**` Produktivcode) | unverändert im G3.2.2-Scope | nein |

Beweisschritte (read-only, im Review auszuführen und im Report zu protokollieren):

- `rg -n "sandbox_exec" supabase/migrations` → 0 Treffer (temporärer S10-Grant war ad hoc, kein Migrationsartefakt).
- `rg -n "CREATE OR REPLACE FUNCTION public.composer_replace_pipeline_attempt" supabase/migrations/2026081518*.sql` → 0 Treffer; zusätzlich `pg_get_functiondef`-Vergleich gegen die vor G3.2.2 gültige Definition.
- Diff-Inventar enthält keine G3.2.3-/G4-Artefakte (keine neuen RPCs außer den drei oben, keine Änderung an `compose-clip-webhook`, `remotion-webhook`, `compose-dialog-segments`, `composer_bind_*`).

## 2. Pre-Deploy In-flight Gate (read-only)

Regel: **Deploy nur bei 0 relevanten alten in-flight Sync-Apply-Runs.** Bei >0 regulär drainen;
kein Runtime-Fallback, kein Backfill/Rewrite alter Jobs ohne neue Freigabe.

```sql
-- G1: aktive sync_segment-Ledger-Jobs
select id, scene_id, status, external_job_id, created_at
from public.composer_pipeline_jobs
where stage = 'sync_segment'
  and status in ('pending','dispatching','dispatched','running');

-- G2: Szenen in aktiven Lip-Sync-States
select id, pipeline_state, pipeline_substate, active_run_id, plate_generation, updated_at
from public.composer_scenes
where pipeline_state in ('lipsync_dispatched','lipsync_running','lipsync_muxing');

-- G3: aktive audio_mux-Attempts
select id, scene_id, status, created_at
from public.composer_pipeline_jobs
where stage = 'audio_mux'
  and status in ('pending','dispatching','dispatched','running');

-- G4: Replacement-Attempts in Zustellung (über die Vorgänger-Relation, da der neue
-- Attempt selbst kein replaced_by trägt)
select
  r.id,
  r.scene_id,
  r.stage,
  r.status,
  p.id as predecessor_id,
  r.created_at
from public.composer_pipeline_jobs p
join public.composer_pipeline_jobs r
  on r.id = p.replaced_by
where r.status in ('dispatching','dispatched');

-- G5: Passes mit gebundenem Provider-Job (nicht terminal)
select s.id as scene_id, p->>'job_id' as job_id, p->>'status' as pass_status,
       p->>'pipeline_job_id' as pipeline_job_id
from public.composer_scenes s,
     lateral jsonb_array_elements(coalesce(s.dialog_shots->'passes','[]'::jsonb)) p
where p->>'job_id' is not null
  and coalesce(p->>'status','') not in ('done','failed','canceled');
```

Gate grün = G1, G3, G4, G5 leer und G2 leer (bzw. ausschließlich Szenen, die nachweislich
bereits terminal gespiegelt sind und im Report einzeln begründet werden).

## 3. Deploy-Reihenfolge

1. Pre-Deploy In-flight Gate grün (§2).
2. DB-Migrationen in Reihenfolge `20260815180037` → `20260815185301` (RPCs, Retry-Allowlist, Bridge-Fix).
3. DB-Security-Smoke (§4).
4. Edge Function `sync-so-webhook` deployen (Zeitstempel festhalten).
5. Post-Deploy Static-/Version-Sanity: deployte Function-Version, `rg`-Guard „kein `complete`/`applied`-Write und kein Whole-JSON-`dialog_shots`-Write im Webhook“.
6. Erst danach echter UI-Resmoke (§5).

Zwischenzustands-Prüfung: DB zuerst ist der einzig sichere Weg. Die neuen RPCs sind additiv,
der alte Webhook ruft sie nicht auf, also erzeugt Schritt 2 keine Inkompatibilität. Umgekehrt
würde ein Webhook-First-Deploy `composer_apply_sync_segment_result` aufrufen, bevor die
Signatur existiert. Genau eine Signatur pro RPC, keine Overloads → kein Ambiguitätsfenster.

## 4. Unmittelbarer Post-Deploy Security-Smoke (vor UI-Run)

- `composer_apply_sync_segment_result`: genau eine Signatur (`pg_proc`-Count = 1), `prosecdef = true`,
  `proconfig` enthält `search_path=pg_catalog, public`,
  `has_function_privilege('service_role', …, 'EXECUTE') = true`,
  für `anon`, `authenticated`, `sandbox_exec`, `sandbox_exec_lbunafpxuskwmsrraqxl`, `PUBLIC` = `false`.
- `composer_touch_lipsync_progress`: kein EXECUTE-Grantee in `proacl` (auch nicht `service_role`), nur interne Verwendung.
- `composer_log_sync_segment_audit`: ebenfalls grant-frei.
- `composer_replace_pipeline_attempt`: `pg_get_functiondef`-Hash identisch zur Vor-Deploy-Aufnahme.
- `select public.composer_retryable_failure_reasons()` enthält `sync_noop_retryable`.
- Bridge-Smoke in Transaktion mit Rollback: Szene in `lipsync_muxing` + Legacy-Write `lip_sync_status='audio_muxing'` → bleibt `lipsync_muxing`, kein Rückfall auf `plate_ready`/`lipsync_running`.

## 5. Echter Production-Resmoke

Ein UI-Lip-Sync-Run über die vollständige Kette:
`sync_segment` Callback → `composer_apply_sync_segment_result` → `dispatch_mux` → genau ein
`audio_mux`-Ledger-Attempt → `render-sync-segments-audio-mux` → echte `render_id` →
`lipsync_muxing` → Remotion/Stitch → `composer_finalize_lipsync_scene(stitch:done)` → `complete`.

Abnahmekriterien (jede Zeile mit ID/Timestamp im Report):

- Callback-Observation = `bound`.
- `sync_segment`-Job korrekt `succeeded` bzw. bei Failure korrekt terminalisiert.
- Pass-Slot korrekt, kein Sibling-Clobber (übrige Slots byte-identisch).
- `segment_result` und Scene-Verdict getrennt und korrekt.
- `dialog_shots.audio_mux.mux_dispatch_requested_at` gesetzt; Apply-RPC schreibt **kein** `dispatched_at`.
- Genau ein `audio_mux`-Attempt, genau ein tatsächlicher Mux-Dispatch.
- `lipsync_muxing` erst durch den Mux-Owner mit realer `render_id`.
- Kein Rückfall auf `plate_ready`/`lipsync_running` durch die Legacy-Bridge.
- Kein `complete`/`applied` aus `sync-so-webhook`; Finalisierung nur über den Stitch-Finalizer.
- DB-Audit-Zeile (`source_signature='g322_sync_segment'`) vorhanden.
- Keine `missing_binding`, `wrong_job`, `stale_run`, `stale_generation`, `reinject_missing_pipeline_job_id`.

## 6. Duplicate-/Redrive-Nachweis

Natürlich auftretende Duplicates/Watchdog-Forwards im Run werden ausgewertet; ein produktiver
Provider-Run wird **nicht** künstlich sabotiert. Zusätzlich als Post-Deploy-Smoke (Transaktion,
Rollback) zu belegen:

- Identischer finaler Callback **vor** `audio_mux`-Acquire → erneut `dispatch_mux`.
- Derselbe Callback **nach** existierendem `audio_mux`-Attempt → `noop`.
- Niemals ein zweiter `audio_mux`-Attempt.

## 7. Telemetrie-Fenster

Von Deploy-Zeitstempel bis Resmoke-Ende auswerten und im Report festhalten:

- `composer_callback_observations` gruppiert nach Verdict.
- Transition-Audit-Zeilen (`composer_scene_transition_log`, `caller_class='sync_segment_apply'`).
- Ledger-Attempts nach `stage` und `status`.
- Reaper-/Watchdog-Fehler.
- Zählungen: `missing_binding`, `wrong_job`, `stale_run`, `stale_generation`, `binding_pending` — Erwartung 0 (bzw. `binding_pending` nur transient).

## 8. Abschluss

`docs/v431-g3-2-2-report.md` wird ausschließlich um diesen Deploy-Review-Plan ergänzt.
Kein Deploy in diesem Schritt. Endstatus nach Ergänzung:
**G3.2.2 DEPLOY PLAN READY — AWAITING GO**, danach STOP.
