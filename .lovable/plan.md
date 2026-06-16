# v129.0 — Sync.so Output Authenticity & Payload Contract

**Status:** Queued. Will only start after v128 soak exits green (48h window). No code changes during soak.

## 1. Close Stitch Forensics Track

- Mark `docs/lipsync/v128-stitch-forensics.md` as **CLOSED — Classification E confirmed**.
  - Composite/Stitch is innocent: `final_url` correctly references `passes[].output_url`.
  - The Sync.so pass output itself is visually ≈ Sync.so input/preclip.
- Add a one-line pointer at the bottom: "Continued in `docs/lipsync/v129-syncso-output-authenticity.md`".
- No retitling, no rewrite — just status + pointer.

## 2. v128 Soak Discipline (unchanged)

Hands off. No edits to:
- state machine / `transitionPass` / `withDialogLock`
- Watchdog, Plan-D fan-out kill-switch
- compose-dialog-segments, render-sync-segments-audio-mux
- Sync.so request builder, v105/v106/v124/v126 paths
- DB mutations on `composer_scenes`, `syncso_dispatch_log`, `syncso_inflight_jobs`

Soak remains valid as long as: no terminal recycle, no duplicate dispatch, no lock bypass, no Watchdog redispatch, no Plan-D dispatch.

## 3. v129.0 Track — Read-Only Forensics

**Goal:** Prove what payload we actually send to Sync.so, and why output ≈ input comes back.

**Hard scope:** read-only. No edge function edits, no Lambda, no DB writes, no re-renders, no model swap, no Stage 4 A/B, no User-Retry, no lipsync-2-pro fallback, no Segments API experiment.

### 3.1 Evidence sources (read-only)

1. **Persisted intent** — `composer_scenes.dialog_turns[].sync_pass_state[].asd`, `preclip_crop`, `speaker_id`.
2. **Actual outbound request** — `syncso_dispatch_log` rows: full `request_payload`, especially `options.active_speaker_detection`, `options.model`, `frame_number`, `bounding_boxes`, `bounding_boxes_url`.
3. **Provider truth** — Sync.so `GET /v2/generate/:id` for each `provider_job_id` (if API allows retrieval of submitted options — record whatever the response exposes).
4. **`_v105_probe`** snapshot: `asd_auto_detect`, `asd_has_coordinates`, `asd_source`, any builder-path tag.
5. **Assets** — `input_preclip_url`, `sync_output_url`, `audio_url` downloaded to `/tmp/v129/`.
6. **Pixel evidence** — input vs output mean diff, mouth/face ROI diff during audio-active frames.
7. **Audio evidence** — RMS / non-silent check, duration vs preclip duration.

### 3.2 Sample set

- ≥ 3 recent "done" dialog scenes with multiple passes (target Scene N `225ea521…` + 2 fresh ones from post-soak window).
- Per scene: every pass, every speaker.

### 3.3 Deliverable

`docs/lipsync/v129-syncso-output-authenticity.md` with one table row per `(scene_id, pass_idx, speaker_id)`:

| column | source |
|---|---|
| scene_id, pass_idx, speaker_id/name | composer_scenes |
| provider_job_id | syncso_dispatch_log |
| input_preclip_url, sync_output_url, audio_url | dispatch log / pass record |
| persisted coords, persisted preclip_crop | composer_scenes |
| actual `options.active_speaker_detection` | syncso_dispatch_log.request_payload |
| Sync.so GET `/v2/generate/:id` options | provider API (if available) |
| `_v105_probe.asd_auto_detect`, `asd_has_coordinates` | dispatch log |
| input_vs_output mean diff | ffmpeg/PIL |
| mouth/face ROI diff (audio-active frames) | ffmpeg/PIL |
| audio RMS / non-silent | ffprobe |
| classification | A / B / C / D |

### 3.4 Classification (must end with exactly one per row)

- **A — Internal builder bug.** Actual request has `auto_detect:true` and no coords, despite persisted coords. Root cause inside v105/v106/v126 request builder or variant mapping.
- **B — Coordinate-space / frame bug.** Actual request has coords but in wrong space (plate-space vs 720×720), invalid `frame_number`, or coord not on the target face.
- **C — Provider no-op.** Request is doc-strict, audio is non-silent and correct duration, preclip contains target face — and Sync.so still returns passthrough. → Prepare Sync.so support escalation bundle (`provider_job_id`, request JSON, input URL, output URL, ROI-diff PNG).
- **D — Validator gap.** No-op currently classified as `PASS_DONE` instead of `PASS_DONE_SUSPECT`. Logged as **Stage 3.5 backlog item: Pixel Authenticity Validator** (input vs output diff + mouth ROI + motion-during-audio). Default reaction later: `PASS_DONE_SUSPECT` → no auto-retry, no auto-refund, yellow badge.

### 3.5 Out of scope for v129.0

- Doc-strict ASD enforcement code (only proposed in report; not implemented).
- Preflight dispatch-blocker for missing coords (only proposed).
- `actual_sync_request.json` persistence at dispatch time (only proposed).
- Stage 4 A/B (manual coords / bounding_boxes_url / hybrid) — explicitly deferred until Classification result is known.
- SUSPECT badge UI — stays gated behind `attempt_id` + credit-charging + transition-guard combined test, as previously agreed.

## 4. Entry / Exit gates

- **Entry:** v128 soak exits green at 48h (zero illegal transitions, zero blocked fan-outs, zero terminal recycles in observation queries).
- **Exit of v129.0 forensics:** every sampled `(scene, pass, speaker)` row carries an A/B/C/D classification with linked evidence artifact in `/mnt/documents/v129-syncso-rois/`.
- **Next track unlocked by result:** A → internal payload-contract fix PR; B → coord-transform fix PR; C → Sync.so support ticket; D → Stage 3.5 Validator design doc.

## 5. Files touched in this plan

- `docs/lipsync/v128-stitch-forensics.md` — append CLOSED status + pointer line only.
- `docs/lipsync/v129-syncso-output-authenticity.md` — **new**, empty skeleton with the table headers and classification legend; rows filled post-soak.
- `.lovable/plan.md` — update tracker: Stitch Forensics CLOSED, v129.0 QUEUED, gated on v128 48h green.

No other files. No code. No DB writes.
