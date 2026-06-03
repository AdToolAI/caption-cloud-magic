---
name: Lip-Sync Fan-Out Webhook + Watchdog (v26)
description: sync-so-webhook matched ONLY against state.sync_job_id, which dropped every pass-completion webhook except the last dispatched pass and stranded fan-out scenes. v26 matches by passes[].job_id, dispatches the next pending pass when a slot frees, keeps deferred fan-out passes alive instead of marking them failed, and adds a Sync.so polling fallback to lipsync-watchdog.
type: architecture
---

**Trigger (Juni 2026)**: Scene `4a56d6a1…` lief mit 3 Sprechern, Pass 0 + 1 starteten parallel, Pass 2 wurde wegen `inflight=3/3` deferred und nie wieder gestartet. Webhooks für Pass 0 wurden zusätzlich verworfen, weil `state.sync_job_id` inzwischen auf Pass 1 zeigte → `v5_job_mismatch` → keine `done`-Markierung → kein Compositor → `sync_so_timeout_8min`. Parallel-Szene `85ecc55a…` blieb 10 min in `DEFER inflight=3/3`, weil die toten Slots der ersten Szene nie freigegeben wurden.

**v26 Fixes**:

1. **`sync-so-webhook` Fan-Out matching**: Match-Reihenfolge ist jetzt `passes[].job_id` → `state.sync_job_id` (legacy) → skip mit `v5_job_not_in_passes`. Stale `current_pass` cursor wird durch den per-jobId aufgelösten `matchedIdx` ersetzt (sowohl im COMPLETED- als auch im FAILED-Branch). Fallback-Scan akzeptiert zusätzlich `audio_muxing`-Szenen und prüft `passes[]` + top-level `sync_job_id`.
2. **Pending-Pass Auto-Advance**: Nach jedem COMPLETED-Pass (`!allDone`) wird der erste `pending` Pass via `compose-dialog-segments?advance=true&pass_idx=N` gestartet. Dadurch laufen wegen Sync.so-Slotlimit deferred Passes automatisch nach.
3. **Single-Speaker Fast-Path**: Bei `totalPasses === 1` wird der Compositor übersprungen und direkt `clip_url`/`lip_sync_applied_at`/`twoshot_stage='complete'` geschrieben. Vorher fiel der Code zusätzlich durch einen toten v5-Single-Branch, der parallel `audio_muxing` und `done` schrieb.
4. **`compose-dialog-segments` Defer-Pfad**: Bei `isAdvance || isRetry` wird die Szene nicht mehr in `syncso_segments_advance_deferred` (nicht-advanceable) geparkt. Stattdessen bleibt `lip_sync_status='running'` + bestehende `dialog_shots`; nur `clip_error` markiert die Pause. Watchdog/Webhook kicken den Pass nach.
5. **`lipsync-watchdog` Polling + Dispatch (statt nur Fail)**: Pro Tick (alle 2 min) für jede `running`/`audio_muxing`-Szene mit v5 sync-segments:
   - Polling: `GET /v2/generate/{job_id}` für alle `passes[]` mit `status='rendering'`; bei terminalem Status (`COMPLETED|FAILED|REJECTED|CANCELED`) Forward an `sync-so-webhook?scene_id=…&token=…`, sodass die existierende v25-Logik (Re-Host, Pass-Advance, Compositor, Refund) greift; Inflight-Slot wird freigegeben.
   - Dispatch: Für jeden `pending`-Pass wird einmal pro Tick `compose-dialog-segments?advance=true&pass_idx=N` getriggert.
   - Erst nach diesen Schritten greift die alte Stale-Failure-TTL-Logik; `watchdog_provider_timeout` wird unterdrückt, wenn im selben Tick gepollt wurde.

**Cleanup-Migration**: `syncso_inflight_jobs` für `4a56d6a1` + `85ecc55a` gelöscht und beide Szenen auf `pending`/`master_clip`/`dialog_shots=NULL` zurückgesetzt.

**Unverändert**: v23 Server-Owned-State (Client darf nur via `reset-lipsync-scene` resetten), v24 Unified Multi-Pass über `compose-dialog-segments`, `failLipSync` Helper, Sync.so Pricing (`ceil(durSec)*9*N_passes`).
