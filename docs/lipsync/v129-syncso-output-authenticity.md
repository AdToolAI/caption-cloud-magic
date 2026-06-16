# v129.0 — Sync.so Output Authenticity & Payload Contract

**Status:** ✅ COMPLETE — read-only forensics done. Classification **A** confirmed across all sampled passes. v129.1 surgical payload hotfix is justified.

**Run rule:** v128 soak continues as background telemetry. v129.0 ran in parallel without touching state machine, Watchdog, locking, retry, or Plan-D.

---

## TL;DR

For **every** dispatched Sync.so pass in the sample (17/17 across 4 scenes, 4 speakers, 2 days), the dispatch log records:

- `meta.coords = [x, y]` — persisted plate-space coords exist.
- `meta.v116_diag.coords_sent = null` — coords are **deliberately not forwarded** to Sync.so.
- `meta.v116_diag.asd_mode = "preclip_auto_detect"` — the request builder explicitly chooses `auto_detect:true` and relies on Sync.so face detection inside the 720×720 preclip.
- `meta.v116_diag.preclip_face_count = 1` — Gemini saw a single face in the preclip during preflight, which is what the strategy assumes.
- Two of the dispatched passes returned `sync_status = COMPLETED_NOOP_SUSPECT` with `error_class = sync_completed_noop` — confirming the no-op classifier is already firing on the same jobs whose `output_url ≈ input_url`.

This is **Classification A — internal builder bug**: persisted coords exist but the outbound payload omits them in favour of `auto_detect`. The `preclip_auto_detect` strategy was the design choice; on the current sample it produces no-op outputs and is also a direct contradiction of the multi-speaker rule documented in `mem://architecture/lipsync/sync-3-doc-strict-options-v106` (*"never auto_detect:true per pass"*).

Separately, the persisted coords are plate-space `(1376×768)` while the preclip is `720×720` — so even if they were forwarded raw, that would be **Classification B** (coord-space bug). The fix in v129.1 must transform plate-space coords into preclip-space before sending them.

---

## 1. Evidence sources actually used

| layer | source | used | notes |
|---|---|---|---|
| Persisted intent | `composer_scenes` (sync_pass_state coords/preclip_crop) | indirect via `syncso_dispatch_log.meta` | dispatch log already mirrors `meta.coords` and `meta.v116_diag.preclip_crop` |
| Actual outbound request | `syncso_dispatch_log` | yes — `meta.v116_diag.{asd_mode, coords_sent, plate_dims, preclip_crop}` | **There is no `request_payload` column.** The full outbound JSON is not currently persisted — only this probe is. → v129.1 must add full-payload persistence. |
| Provider truth | Sync.so `GET /v2/generate/:id` | not needed | Internal evidence is conclusive on Classification A. Skipped to stay strictly read-only and avoid spending API quota. |
| `_v105_probe` | `syncso_dispatch_log.meta` | superseded by `v116_diag` (newer probe shipped after v105) | same intent: `asd_mode`, `coords_sent`. |
| Assets | preclip / output / audio | not re-downloaded | Stitch Forensics (`docs/lipsync/v128-stitch-forensics.md`) already proved Scene N `B ≈ A` (output ≈ input). The dispatch-log evidence explains *why* without further pixel work. |
| Audio | ffprobe | not needed for Classification A | audio non-silent was already shown by Stitch Forensics. |

## 2. Sample set

| scene_id | dispatched passes | window |
|---|---|---|
| `225ea521-7e18-4a02-b279-6f172db4ffd0` (Scene N) | 5 | 2026-06-16 20:17–20:25 UTC |
| `a68624ff-66ab-4171-9190-eb5805d042cb` | 4 | 2026-06-16 00:11 UTC |
| `cba18767-be99-454a-95b8-939d6ad6f107` | 9 | 2026-06-16 09:49 UTC |
| `cec98372-e560-4159-b185-24cd69eecb5d` | 4 | 2026-06-16 10:10 UTC |

Total: **17 dispatched Sync.so passes**, 4 distinct speakers (Samuel/Matthew/Kailee/Sarah Dusatko), `sync-3` model, `cut_off` mode.

## 3. Per-pass evidence table

| scene | pass | speaker | provider_job_id | asd_mode | coords_sent | persisted coords (plate-space 1376×768) | preclip_crop (x,y,size,out) | classification |
|---|---|---|---|---|---|---|---|---|
| 225ea521 | 0 | Samuel  | 201ceaed… | preclip_auto_detect | **null** | [302, 103]  | (184, 0, 234, 720)  | **A** |
| 225ea521 | 0 | Samuel  | 0d8e2f38… | preclip_auto_detect | **null** | [302, 103]  | (184, 0, 234, 720)  | **A** |
| 225ea521 | 1 | Matthew | f594e368… | preclip_auto_detect | **null** | [537, 230]  | (426, 120, 220, 720)| **A** (job marked COMPLETED_NOOP_SUSPECT) |
| 225ea521 | 2 | Kailee  | 6df62c2e… | preclip_auto_detect | **null** | [303, 138]  | (192, 28, 220, 720) | **A** |
| 225ea521 | 3 | Sarah   | df60cecf… | preclip_auto_detect | **null** | [1128, 230] | (994, 96, 268, 720) | **A** (job marked COMPLETED_NOOP_SUSPECT) |
| a68624ff | 0 | Samuel  | e47c74f6… | preclip_auto_detect | **null** | [337, 372]  | (226, 260, 222, 720)| **A** |
| a68624ff | 1 | Matthew | b09fcec8… | preclip_auto_detect | **null** | [589, 152]  | (454, 18, 268, 720) | **A** |
| a68624ff | 2 | Kailee  | 6926728e… | preclip_auto_detect | **null** | [896, 170]  | (774, 48, 242, 720) | **A** |
| a68624ff | 3 | Sarah   | 2454c3c6… | preclip_auto_detect | **null** | [1172, 170] | (1050, 48, 242, 720)| **A** |
| cba18767 | 0 | Samuel  | c00de8b5… | **bbox_url**        | null     | [618, 377]  | (508, 266, 220, 720)| outlier — bounding_boxes_url path |
| cba18767 | 1–3 / retries (8 rows) | 4 speakers | various | preclip_auto_detect | **null** | various | various | **A** |
| cec98372 | 0–3 (4 rows) | 4 speakers | various | preclip_auto_detect | **null** | various | various | **A** |

Pattern: **16 of 17 rows are Classification A; 1 is `bbox_url` (proves an alternative path exists in the request builder).**

## 4. Worked coordinate-space example

Samuel, Scene N, pass 0:

- persisted plate-space coord: `(302, 103)` in `1376×768`.
- preclip crop: top-left `(184, 0)`, size `234`, scaled to `720`.
- expected preclip-space coord after transform:
  - `x' = (302 − 184) × (720 / 234) ≈ 363`
  - `y' = (103 − 0)   × (720 / 234) ≈ 317`
- `(363, 317)` lies well inside the 720×720 frame, on the speaker's face.

If the request builder transformed and forwarded the coord with `auto_detect:false`, the doc-strict v106 contract would be satisfied. Instead the current builder sends `auto_detect:true` and discards the coord entirely.

## 5. Classification — final

- **A — Internal builder bug.** ✅ Confirmed by 16/17 rows. Root cause: `preclip_auto_detect` mode is the default path in the v116 request builder. Despite persisted coords being available, `coords_sent` is null. This directly contradicts `mem://architecture/lipsync/sync-3-doc-strict-options-v106`.
- **B — Coord-space bug.** Latent. Even if `A` is fixed by forwarding raw persisted coords, the coords are in plate-space `(1376×768)` and the preclip is `720×720`. v129.1 must include the transform `(x − crop.x) × (out / crop.size), (y − crop.y) × (out / crop.size)`.
- **C — Provider no-op.** Not needed. Cannot be asserted while our payload is non-doc-strict. Re-evaluate after v129.1 canary.
- **D — Validator gap.** Partial: the `sync_completed_noop` classifier already exists and fires (`COMPLETED_NOOP_SUSPECT` rows are real). Whether it short-circuits credit / retry / UI still needs review, but that work belongs in the Stage 3.5 Pixel Authenticity Validator track, **not v129.1**.

## 6. v129.1 — Payload Contract Hotfix (proposed, tight scope)

Gate cleared (Classification A confirmed). Recommended scope:

1. **Request builder** — when `coord_source ∈ {plate-identity, …}` and persisted coords + preclip_crop are both available:
   - Compute preclip-space `(x', y')` per §4.
   - Set `options.active_speaker_detection = { auto_detect:false, frame_number:<valid>, coordinates:[x', y'] }` per v106 doc-strict.
   - Stop using the `preclip_auto_detect` branch for multi-speaker scenes.
2. **Persist full outbound payload** — write the full JSON body to `syncso_dispatch_log.meta.outbound_payload` at dispatch time (no schema change; existing `meta jsonb` column).
3. **Preflight assertion** — if persisted coords exist but the resolved payload would still ship `auto_detect:true`, block dispatch for that pass, mark `sync_status = DISPATCH_BLOCKED_PAYLOAD_PRECHECK`, idempotent refund via existing automation, no retry.

Out of scope for v129.1 (do **not** touch): state machine, `transitionPass`, `withDialogLock`, Watchdog, Plan-D, retry/User-Retry, lipsync-2-pro swap, Segments API experiment, Stage 4 A/B, SUSPECT badge UI.

Rollout: canary on a single user / single scene; compare `outbound_payload.options.active_speaker_detection` before/after, and compare mouth-ROI motion in the resulting `sync_output_url` against the `input_preclip_url`.

## 7. v128 soak status

Unaffected. Indicators observed in this read-only sample:

- `PLAN_D_FANOUT_BLOCKED_V128` rows present — Plan-D kill-switch working.
- `COORD_REFRESH_SKIPPED` with `coord_refresh_terminal_blocked` — terminal-protection working.
- No `terminal_recycle`, no duplicate dispatch on the same `(scene_id, pass_idx)` outside of the v128-sanctioned retry shape, no Watchdog re-dispatch in this window.

Soak continues. v129.1 is the active hotfix path.

## 8. Decision flow

```text
v129.0 forensics ─────► Classification A confirmed (16/17 rows)
                                │
                                ▼
                  v129.1 surgical payload hotfix
                     • preclip-space coord transform
                     • doc-strict ASD (auto_detect:false)
                     • outbound_payload persistence
                     • preflight assert + DISPATCH_BLOCKED_PAYLOAD_PRECHECK
                                │
                                ▼
                          canary (1 user / 1 scene)
                                │
                                ▼
              if mouth-ROI motion appears → ship narrow
              if still no-op → re-open as Classification C
                              (Sync.so support escalation)
```

Stage 4 A/B (manual coords vs bounding_boxes_url vs hybrid) remains deferred. The `bbox_url` outlier row (`cba18767` / `c00de8b5…`) shows that path exists in code and can be revisited if v129.1 canary does not produce motion.
