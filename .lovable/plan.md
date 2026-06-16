# v129.0 — Sync.so Output Authenticity & Payload Contract (start NOW, read-only)

**Updated rule:** v128 soak no longer blocks read-only forensics or a narrowly-scoped, proven payload fix. It still blocks any change to state machine, Watchdog, locking, retry, Plan-D.

> *v128 prevented the pipeline from looping on itself. Now we must prevent it from stably producing wrong results.*

## 1. Reframe the v128 soak

- Soak continues **as background telemetry only**.
- Validity signals unchanged: zero terminal recycles, zero duplicate dispatches, zero lock bypasses, zero Watchdog redispatches, zero Plan-D dispatches.
- Soak does **not** gate forensics anymore.

## 2. Close Stitch Forensics track

Already done — `docs/lipsync/v128-stitch-forensics.md` is marked CLOSED (Classification E confirmed). No further work on Stitch/Composite/Lambda.

## 3. v129.0 — start immediately, read-only

**Goal:** prove what the actual outbound Sync.so request looks like per pass, and why `output_url` ≈ `input_url`.

### 3.1 Allowed (read-only)

- SELECT on `composer_scenes`, `syncso_dispatch_log`, `syncso_inflight_jobs`, `dialog_dispatch_locks`.
- HTTP `GET https://api.sync.so/v2/generate/:id` for known `provider_job_id` (using existing `SYNCSO_API_KEY`).
- Download `input_preclip_url`, `sync_output_url`, `audio_url` to `/tmp/v129/`.
- ffprobe / ffmpeg / PIL for pixel + audio diffs.
- Writes only to `docs/lipsync/v129-syncso-output-authenticity.md` and `/mnt/documents/v129-syncso-rois/`.

### 3.2 Forbidden (hard guardrails)

- No edits to: state machine, `transitionPass`, `withDialogLock`, Watchdog, Plan-D kill-switch, retry logic, dispatch logic.
- No edits to: `compose-dialog-segments`, `compose-dialog-scene`, `poll-dialog-shots`, `sync-so-webhook`, `render-sync-segments-audio-mux`, Lambda templates.
- No edits to Sync.so request builder / v105 / v106 / v124 / v126 paths.
- No DB mutation, re-render, model swap (lipsync-2-pro), Segments API experiment, Stage 4 A/B, User-Retry, SUSPECT badge UI.

### 3.3 Sample set

- Scene N: `225ea521-7e18-4a02-b279-6f172db4ffd0` (re-use Stitch-Forensik data).
- ≥ 2 additional dialog scenes from the most recent 48h, each with multiple passes and ≥ 2 speakers.

### 3.4 Per-pass evidence table

One row per `(scene_id, pass_idx, speaker_id)`:

| field | source |
|---|---|
| scene_id, pass_idx, speaker_id | composer_scenes |
| provider_job_id | syncso_dispatch_log |
| input_preclip_url, sync_output_url, audio_url | dispatch log / pass record |
| persisted coords + preclip_crop | composer_scenes |
| **actual `options.active_speaker_detection`** | `syncso_dispatch_log.request_payload` |
| Sync.so GET `/v2/generate/:id` options | provider API |
| `_v105_probe.asd_auto_detect`, `asd_has_coordinates` | dispatch log |
| input↔output mean pixel diff | ffmpeg/PIL |
| mouth/face ROI diff (audio-active frames) | ffmpeg/PIL |
| audio RMS / non-silent, audio duration vs preclip | ffprobe |
| **classification A/B/C/D** | analysis |

### 3.5 Classification

- **A — Internal builder bug.** Actual request has `auto_detect:true` and no coords despite persisted coords. → triggers v129.1 hotfix (see §4).
- **B — Coordinate-space / frame bug.** Coords present but in wrong space (plate-space vs 720×720) or invalid `frame_number`. → triggers v129.1 hotfix (see §4).
- **C — Provider no-op.** Request is doc-strict, audio non-silent, preclip valid — Sync.so still returns passthrough. → Sync.so support escalation bundle (`provider_job_id`, request JSON, input/output URLs, ROI-diff PNG). **No code change.**
- **D — Validator gap.** No-op currently classified as `PASS_DONE` instead of `PASS_DONE_SUSPECT`. → Backlog as Stage 3.5 Pixel Authenticity Validator (separate later track).

## 4. Conditional v129.1 — Payload Contract Hotfix (only if A or B is proven)

**Gate:** at least one row in v129.0 classified A or B with linked evidence.

**Tight scope:**
- Sync.so request builder / ASD payload only.
- Enforce doc-strict ASD: when persisted coords exist for a multipass pass, send `auto_detect:false` + valid `frame_number` + `coordinates:[x,y]`; never send `auto_detect:true` alongside known coords.
- Add `actual_sync_request.json` persistence at dispatch time (insert into existing `syncso_dispatch_log.request_payload`; no new table, no schema change).
- Preflight assertion: if persisted coords exist but payload would omit them → log + block dispatch for that pass (pass goes to `PASS_FAILED_PAYLOAD_PRECHECK`, idempotent refund via existing automation, no retry).

**Out of scope for v129.1:**
- State machine, Watchdog, locking, retry, Plan-D.
- Model swap, Segments, bounding_boxes_url, Stage 4 A/B.
- UI changes, SUSPECT badge.

**Rollout:**
- Canary on a single user / single scene.
- Compare `actual_sync_request.options.active_speaker_detection` before/after fix.
- Compare `sync_output_url` mouth-ROI diff vs `input_preclip_url` to confirm Sync.so now produces motion.

## 5. Files touched by this plan

- `docs/lipsync/v129-syncso-output-authenticity.md` — **already exists as skeleton**; will be filled with real rows + classifications as v129.0 runs.
- `/mnt/documents/v129-syncso-rois/` — pixel evidence per pass.
- `.lovable/plan.md` — updated to reflect "start NOW, soak is background-only".
- No production source files touched in v129.0. v129.1 file scope is decided only after A/B proof.

## 6. Decision flow

```text
v129.0 forensics (now, read-only)
        │
        ├── A or B proven ──► v129.1 hotfix (surgical, payload only) ──► canary
        ├── C proven ──────► Sync.so support escalation, no code change
        └── D only ────────► backlog Stage 3.5 Pixel Authenticity Validator
```

Stage 4 A/B (manual coords vs bounding_boxes_url vs hybrid) remains deferred until v129.0 classification is in hand.
