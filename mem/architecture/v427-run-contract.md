---
name: v427 Run-Vertrag
description: Kanonischer Run-Vertrag des Composers — Job-Ledger, Callback-Gates, Dauer-/Guthabenvertrag, Fertig-Semantik; Lip-Sync-Freeze bleibt unangetastet
type: feature
---

Verbindliche Spezifikation: `docs/v427-run-contract.md`. Consumer-Inventar: `docs/v427-ready-consumers.md`.

Kernregeln:
- v427 wird **um** die Lip-Sync-Kette herum gebaut. Freeze (`.lovable/LIPSYNC-FEATURE-FREEZE.md`) gilt weiter; `tail_padding_ms` stammt aus dem Bestandscode, nicht aus v427.
- `composer_scene_runs` = autoritative, unveränderliche Wahrheit pro Lauf. `composer_scenes` spiegelt nur für die UI.
- `composer_pipeline_jobs.id` ist die primäre Callback-Identität; `external_job_id` ist nur zusätzliche Bestätigung. Retry = `attempt_no + 1`.
- Zwei getrennte Operationen: `assertActivePipelineJob()` (Poller/Worker, konsumiert nichts, setzt Heartbeat) vs. `claimPipelineCallback()` (Abschlussereignisse, idempotent, 5-min-Claim-Lease).
- Parallele Sync-Segmente schreiben nur ihren eigenen Job; Übergang auf `audio_mux_pending` nur über die Aggregationsbarriere `allRequiredSyncJobsSucceeded()`.
- Dauer: `max(requested, gemessenes Audio + tail_padding)` → Providerfenster aufrunden. Voiceover verlängert, verkürzt nie. Kein bezahlter Auftrag ohne vorherige Reservierung (Obergrenze zuerst, danach exakt reduzieren).
- `clip_status = ready` nur für das endgültige Nutzerergebnis; die Kontinuitätskette läuft bereits bei `base_clip_status = ready` weiter.
- Alle Flags in `system_config` (`v427.*`) defaulten auf v426-Verhalten; `v427.callback_guard_mode` = off | observe | enforce.
