# v129.0 — Sync.so Output Authenticity & Payload Contract

**Status:** QUEUED — gated on v128 soak exiting green at 48h. Read-only forensics. No code changes, no DB writes, no re-renders.

## Goal

Prove what payload we actually send to Sync.so per pass, and why the returned `output_url` is visually ≈ the `input_url` (effective no-op).

The persisted scene state (`composer_scenes`) says coords exist. The `_v105_probe` on the dispatch log says `asd_auto_detect=true` and `asd_has_coordinates=false`. The job of v129.0 is to compare **intended request** vs **actual outbound request** vs **provider job options**, and classify each pass into A/B/C/D.

## Hard scope (read-only)

Allowed:
- SELECT on `composer_scenes`, `syncso_dispatch_log`, `syncso_inflight_jobs`, `dialog_dispatch_locks`.
- HTTP GET against Sync.so `/v2/generate/:id` for known `provider_job_id`.
- Download `input_preclip_url`, `sync_output_url`, `audio_url` to `/tmp/v129/`.
- ffprobe / ffmpeg / PIL for pixel + audio diffs.
- Write to `docs/lipsync/v129-syncso-output-authenticity.md` and `/mnt/documents/v129-syncso-rois/`.

Forbidden:
- Any edit to edge functions, Lambda templates, request builder, v105/v106/v124/v126 paths.
- Any DB mutation, re-render, retry, refund, model swap (lipsync-2-pro), Segments API experiment.
- Stage 4 A/B (manual coords / `bounding_boxes_url` / hybrid) — deferred until classification is known.
- SUSPECT badge UI — stays gated behind `attempt_id` + credit-charging + transition-guard combined test.

## Sample set

- Scene N: `225ea521-7e18-4a02-b279-6f172db4ffd0` (already analyzed for Stitch).
- ≥ 2 additional dialog scenes from the post-soak window, each with multiple passes and multiple speakers.

## Per-pass evidence table

One row per `(scene_id, pass_idx, speaker_id)`. Fill **after** v128 soak exits.

| scene_id | pass_idx | speaker_id / name | provider_job_id | input_preclip_url | sync_output_url | audio_url | persisted coords | persisted preclip_crop | actual `options.active_speaker_detection` | Sync.so GET `/v2/generate/:id` options | `_v105_probe.asd_auto_detect` | `_v105_probe.asd_has_coordinates` | input↔output mean diff | mouth/face ROI diff (audio-active frames) | audio RMS / non-silent | classification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| _tbd_ | | | | | | | | | | | | | | | | |

## Classification legend

Each row ends in exactly one of:

- **A — Internal builder bug.** Actual request has `auto_detect:true` and no coords despite persisted coords. Root cause inside request builder / variant mapping / v105–v126 path. Fix-scope (proposed only, not implemented here):
  - Enforce doc-strict ASD.
  - For multipass + known coords: `auto_detect:false`, valid `frame_number`, `coordinates:[x,y]`.
  - Persist `actual_sync_request.json` at dispatch time.
  - Preflight blocks dispatch when coords are expected but absent from payload.
- **B — Coordinate-space / frame bug.** Actual request has coords, but in plate-space instead of 720×720, or `frame_number` is invalid, or coord doesn't land on the target face. Fix-scope (proposed only): coord transform fix PR.
- **C — Provider no-op.** Request is doc-strict, audio non-silent at correct duration, preclip contains target face — and Sync.so still returns passthrough. Action: open Sync.so support ticket with `provider_job_id`, request JSON, input/output URLs, ROI-diff PNG.
- **D — Validator gap.** No-op currently classified as `PASS_DONE` instead of `PASS_DONE_SUSPECT`. Logged as **Stage 3.5 backlog: Pixel Authenticity Validator** — input vs output diff + mouth ROI + motion-during-audio. Default later: `PASS_DONE_SUSPECT` → no auto-retry, no auto-refund, yellow badge.

## Decision flow after v129.0

- A → internal payload-contract fix PR (separate ticket, post-v129.0).
- B → coord-transform fix PR.
- C → Sync.so support escalation.
- D → Stage 3.5 Pixel Authenticity Validator design doc.

## Entry / exit gates

- **Entry:** v128 soak exits green at 48h (zero illegal transitions, zero blocked fan-outs, zero terminal recycles in observation queries).
- **Exit:** every sampled `(scene, pass, speaker)` row carries an A/B/C/D classification with a linked evidence artifact under `/mnt/documents/v129-syncso-rois/`.

## Out of scope

- No doc-strict ASD enforcement code.
- No preflight dispatch-blocker implementation.
- No `actual_sync_request.json` persistence at dispatch time.
- No Stage 4 A/B run.
- No SUSPECT badge UI.

## v128 soak protection

This track does not touch the state machine, Watchdog, Plan-D, request builder, compose-dialog-segments, or render-sync-segments-audio-mux. v128 soak validity is unaffected as long as no terminal recycle, no duplicate dispatch, no lock bypass, no Watchdog redispatch, and no Plan-D dispatch occur.
