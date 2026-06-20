---
name: v146 Plate-Face-Forensic Confirmation
description: Forensic Gemini-on-Replicate proof that face_gate_failed:count=0 in production is a Sync.so detection bug, not a Hailuo plate quality issue
type: feature
---

## v146 Status (20.06.2026)

### Edge Function
- `lipsync-diagnostic` v146.0 deployed.
- `mode="plate-face-forensic"` now uses **Replicate `google/gemini-2.5-flash`** with native `videos[]` input (no frame extraction needed).
- The previous Replicate model `lucataco/ffmpeg-extract-frame` no longer exists (404). OpenRouter chat-completions also rejects mp4 URLs as `image_url` ("Unsupported image format"). Replicate-Gemini handles video natively.
- Daily admin cap raised from 5 → 20 runs/24h.
- `thinking_budget: 0` + markdown-fence stripping + robust `firstBrace/lastBrace` JSON extraction make output reliable.

### Confirmed Diagnosis
Test plate: `lipsync-plates/shared/8bd0d568-…/p1-preclip-f891d02f039ac730.mp4` (4-speaker scene, Sarah's pass 1 preclip)

Forensic verdict: **single face, large, frontal, mouth visible across early/mid/late**:
- count=1 (matches v126 single-face-preclip pipeline)
- center (68%, 52%), area 32.6%, mouth_visible=true at all 3 timestamps

→ The `face_gate_failed:count=0 (after 2 v116 repair attempts)` error in production is a **Sync.so detection bug** for this specific crop geometry, NOT a Hailuo plate composition issue. The Standard Lipsync Diagnostic also produced visibly lipsync'd output for the same plate (sync-3 auto_detect + lipsync-2-pro variants completed).

### Decision: No production code change in v146
- `compose-dialog-segments` lines 2882–2918 document that full-plate `bbox-url-pro` was deliberately removed in v126 after Samuel scene `cba18767` regressed with provider_unknown_error (DB-verified 15.06.2026).
- The Plan v146 Part B proposal (force `bbox-url-pro` as fresh default) would re-introduce that regression. Dropped.
- v126 unified preclip + auto_detect remains the architectural truth.

### Next-step options if the bug persists
If the same `face_gate_failed:count=0` recurs on other preclips:
1. Build a v107 preflight that calls Replicate-Gemini on the **preclip** before dispatch, extract `(x_pct, y_pct, area_pct)`, then send Sync.so `active_speaker_detection.coordinates` with those exact values instead of `auto_detect: true`.
2. File a Sync.so support ticket with the proven-good plate + the v146 forensic result.

Do NOT flip `freshDefaultVariant` to `bbox-url-pro` — that's the v126 footgun.
