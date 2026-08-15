# v431 G3.2.2 — Production Deploy + Sync → Mux → Stitch Resmoke

Status: G3.2.2 DEPLOY PLAN READY — AWAITING GO.
Ziel: Erstmaliger Production-Deploy der G3.2.2-Artefakte, gefolgt von einem echten UI-Lip-Sync-Lauf durch die gesamte Kette bis zum Stitch-Finalizer. Kein G3.2.3, keine Architekturänderung.

## 1. Pre-Deploy In-flight Gate (exakt 0/0/0/0/0)

Vor jedem Deploy die fünf Gate-Queries aus `docs/v431-g3-2-2-report.md` §2 ausführen. Terminalität ausschließlich am kanonischen `pipeline_state` (`complete`, `failed`, `canceled`).

| Gate | Ziel |
| --- | --- |
| G1 | 0 offene `sync_segment`-Jobs in non-terminaler Szene |
| G2 | 0 Szenen in `lipsync_dispatched`/`lipsync_running`/`lipsync_muxing` |
| G3 | 0 offene `audio_mux`-Jobs in non-terminaler Szene |
| G4 | 0 Replacement-Attempts im Status `dispatching`/`dispatched` |
| G5 | 0 non-terminale Pass-Slots in non-terminalen Szenen bzw. mit non-terminalem Ledger-Job |

Nur bei exakt 0/0/0/0/0 weiter. Historische terminale Rows bleiben unangetastet.

## 2. Production-Deploy-Reihenfolge

1. **DB-Migration `20260815180037_…sql`** (Basis-Vertrag G3.2.2)
   - `composer_apply_sync_segment_result`
   - `composer_mark_sync_refund_applied`
   - `composer_retryable_failure_reasons()` inkl. `sync_noop_retryable`
2. **DB-Migration `20260815185301_…sql`** (Acceptance Remediation R1)
   - `composer_touch_lipsync_progress`
   - `composer_log_sync_segment_audit`
   - monotoner `audio_muxing`-Bridge-Fix
   - finale Fassung `composer_apply_sync_segment_result` (R1, R5, R6)
3. **Security-Smoke** (§4 des Reports)
   - `composer_apply_sync_segment_result`: SECURITY DEFINER, `search_path = pg_catalog, public`, `service_role = true`, `anon`/`authenticated`/`PUBLIC = false`, Sandbox-ACL akzeptiert.
   - `composer_touch_lipsync_progress` / `composer_log_sync_segment_audit`: kein direkter EXECUTE-Grantee.
   - `composer_replace_pipeline_attempt`: `md5(pg_get_functiondef)` unverändert `c4649e65440a64997376617721792aa8`.
   - `composer_retryable_failure_reasons()` enthält `sync_noop_retryable`.
   - Bridge-Smoke: Szene in `lipsync_muxing` + Legacy-Write `audio_muxing` bleibt `lipsync_muxing`.
4. **Edge Function `sync-so-webhook` deployen**
   - Deploy-Zeitstempel `T_deploy` festhalten.
   - Post-Deploy Sanity: Kein `.update(`/`.upsert(` auf `composer_scenes` im Webhook (außer Credit-Wallet-Refund); kein Whole-JSON-Write auf `dialog_shots`; kein `complete`/`applied`-Write.

## 3. Echter Production-Resmoke (UI-Lip-Sync-Lauf)

Genau **ein** Lauf. Szenenauswahl: eine Szene, die nachweislich auf `sync-segments` + Mux/Stitch auflöst — bevorzugt der **single-speaker non-tight**-Fall, um die B11-Umlegung (Finalisierung nur über Stitch-Finalizer) produktiv mit abzunehmen.

Erwartete Kette:

```text
sync_segment callback
  → composer_apply_sync_segment_result
  → dispatch_mux
  → genau ein audio_mux-Ledger-Attempt
  → render-sync-segments-audio-mux
  → reale render_id
  → Mux-Owner setzt lipsync_muxing
  → Remotion/Stitch
  → composer_finalize_lipsync_scene(stitch:done)
  → complete
```

Abnahmekriterien mit IDs und UTC-Zeitstempeln protokollieren:

- [ ] `sync_segment`-Callback kommt an; `composer_callback_observations` Verdict = `bound`.
- [ ] `composer_apply_sync_segment_result` wird aufgerufen; Rückgabe `segment_result` und `scene_verdict` sind getrennt und korrekt.
- [ ] `sync_segment`-Ledger-Job endet korrekt (`succeeded` bzw. terminal bei Failure).
- [ ] Pass-Slot korrekt gepatcht, keine Sibling-Clobber.
- [ ] `dialog_shots.audio_mux.mux_dispatch_requested_at` gesetzt; Apply-RPC schreibt **kein** `dispatched_at`.
- [ ] Genau ein `audio_mux`-Ledger-Attempt; genau ein tatsächlicher Mux-Dispatch.
- [ ] `lipsync_muxing` erst durch den Mux-Owner mit realer `render_id`.
- [ ] Kein Rückfall auf `plate_ready`/`lipsync_running` durch die Legacy-Bridge.
- [ ] Kein `complete`/`applied` aus `sync-so-webhook`; Finalisierung ausschließlich über Stitch-Finalizer.
- [ ] DB-Audit-Zeile in `composer_scene_transition_log` (`source_signature = 'g322_sync_segment'`, `caller_class = 'sync_segment_apply'`) vorhanden.
- [ ] Keine `missing_binding`, `wrong_job`, `stale_run`, `stale_generation`, `reinject_missing_pipeline_job_id`.

## 4. Duplicate-/Redrive-Nachweis (Post-Deploy-Smoke)

Optional, falls natürliche Duplicates nicht auftreten: Transaktion mit Rollback oder kontrollierter Redrive zeigen:

- Identischer finaler Callback vor `audio_mux`-Acquire → erneut `dispatch_mux`.
- Derselbe Callback nach existierendem `audio_mux`-Attempt → `noop`.
- Niemals ein zweiter `audio_mux`-Attempt.

## 5. Telemetrie-Fenster (T_deploy → Resmoke-Ende)

Auswerten und mit IDs/Timestamps festhalten:

- `composer_callback_observations` gruppiert nach Verdict.
- `composer_scene_transition_log` (`caller_class = 'sync_segment_apply'`, `source_signature = 'g322_sync_segment'`).
- `composer_pipeline_jobs` nach `stage` und `status`.
- Reaper-/Watchdog-Fehler.
- Zählungen `missing_binding`, `wrong_job`, `stale_run`, `stale_generation` — Erwartung 0.
- `binding_pending` am **Ende** des Fensters = 0.

## 6. Abschluss

Ergebnisse in `docs/v431-g3-2-2-report.md` ergänzen. Status danach entweder:

- **G3.2.2 DONE / FROZEN** (wenn Resmoke grün und Telemetrie sauber), oder
- **G3.2.2 DEPLOYED — FOLLOW-UP BEFUND** (wenn Abweichungen auftreten), gefolgt von separatem Fix-Plan.

Kein G3.2.3, keine weiteren Architekturänderungen. STOP nach Abschluss des Reports.
