---
name: Lip-Sync Circuit-Breaker Loop Fix (v32)
description: provider_unknown_error wird global nicht mehr gezählt, Circuit-Open auf laufenden v5-Szenen behält lip_sync_status='running', Watchdog scannt circuit_open/deferred und nutzt first_started_at als TTL-Anker, Client triggert circuit_open nicht mehr automatisch nach.
type: architecture
---

**Trigger (Juni 2026)**: Szene `9e72cae4-1f0e-45a3-abd7-c9201a95b9d5` (3 Sprecher) hing im endlosen `lip_sync_status=pending + twoshot_stage=circuit_open` Loop. Sync.so wies Matthew/Kailee ohne `error_code` mit nur "An unknown error occurred." ab. Der Retry-Pfad löste 5× `provider_unknown_error` aus, was den globalen Sync.so-Circuit öffnete. `compose-dialog-segments` flippte die Szene danach auf `pending`, `lipsync-watchdog` scannte nur `running/audio_muxing`, sah sie nicht — Client triggerte alle 8s nach, jeder Trigger lief in den offenen Circuit, refreshte `updated_at`, der 10-min Refund kam nie.

**v32 Fixes**:

1. **DB-Funktion `syncso_recent_failure_count`**: `provider_unknown_error` nicht mehr im Failure-Count. Nur echte Infra/Provider-Klassen (`timeout`, `rate_limited`, `http_5xx`, `auth`) zählen. Eine einzelne kaputte 3-Sprecher-Plate kann den globalen Circuit nicht mehr öffnen.

2. **`compose-dialog-segments` Circuit-Open Handling**: Bei aktivem v5-State oder `isRetry/isAdvance` bleibt `lip_sync_status='running'`. Nur `twoshot_stage='circuit_open'` als Warte-Marker. Sonst fiele die Szene aus dem Watchdog-Radar.

3. **`lipsync-watchdog` Scan-Erweiterung**: `.or("lip_sync_status.in.(running,audio_muxing),and(lip_sync_status.eq.pending,twoshot_stage.in.(circuit_open,deferred))")`. TTL-Anker ist jetzt `dialog_shots.first_started_at` (Fallback: `started_at`, früheste `passes[].started_at`, dann `updated_at`) — der Loop kann `updated_at` nicht mehr maskieren. Watchdog dispatched keine neuen Passes mehr, solange `twoshot_stage='circuit_open'`. Nach `STALE_PROVIDER_MS` (10 min) wird die Szene mit `syncso_provider_unknown_no_code_after_retries` terminal failed (Refund via `failLipSync`).

4. **`useTwoShotAutoTrigger` Client-Loop-Stop**: `circuit_open` und `deferred` aus `ADVANCEABLE_STAGES` entfernt. `syncso_circuit_open` aus `RETRYABLE_REGEX` raus, in `HARD_FAIL_REGEX` rein. `syncso_provider_unknown_no_code_after_retries` ebenfalls terminal. Der Client startet keine blockierten Dispatches mehr.

**Stuck-Scene-Cleanup**: Szene `9e72cae4…` via Migration terminal auf `failed` + 243 Credits refundiert, alle `syncso_inflight_jobs` für sie und `4a56d6a1…` gelöscht, `provider_circuit_state` auf `closed` zurückgesetzt.

**Unverändert**: v23 Server-Owned State, v24 Unified Multi-Pass, v25 Fan-Out, v30 coords-pro-box Retry-Ladder, v31 FaceMap-BBox. Pricing weiterhin `ceil(durSec) × 9 × N_passes`.

**Was Sync.so weiterhin kann/nicht kann**: 3-Sprecher-Plate mit `lipsync-2-pro` + manueller ASD (coords-pro / coords-pro-box) führt bei bestimmten Frames reproduzierbar zu `FAILED` ohne `error_code`. Lösung ist NICHT mehr Loop, sondern: terminal failen → User klickt "Lip-Sync neu rendern" oder splittet die Szene auf weniger gleichzeitige Sprecher.
