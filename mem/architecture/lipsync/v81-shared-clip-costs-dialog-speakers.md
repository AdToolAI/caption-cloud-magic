---
name: v81 _shared/ consolidation — CLIP_COSTS + dialog-speakers
description: Replaced duplicated CLIP_COSTS table (compose-video-clips + compose-clip-webhook) and duplicated speaker-count parsers (countDialogSpeakers / detectSpeakerCount) with single-source `_shared/clip-costs.ts` + `_shared/dialog-speakers.ts`. Dispatcher charges and webhook refunds can no longer drift apart when a new AI video provider is added.
type: architecture
---

# v81 — Shared CLIP_COSTS + dialog-speakers (June 2026)

## What changed

**New shared modules**
- `supabase/functions/_shared/clip-costs.ts` — canonical `CLIP_COSTS` Record + `ClipQuality` type + `clipCostPerSecond()` helper with the legacy 0.15 €/s fallback.
- `supabase/functions/_shared/dialog-speakers.ts` — `countDialogSpeakers()`, `stripSpeakerPrefixes()`, `hasDialogText()`. Shared regex `SPEAKER_PREFIX_RE` so dispatcher and refund webhook count speakers identically.

**Callers refactored**
- `compose-video-clips/index.ts` (v2.3.0 → v2.4.0): dropped local `CLIP_COSTS`, `Quality`, `countDialogSpeakers`, `stripSpeakerPrefixes`. Imports from shared.
- `compose-clip-webhook/index.ts` (→ v1.1.0): dropped local `CLIP_COSTS` and `detectSpeakerCount`. Imports `countDialogSpeakers` aliased as `detectSpeakerCount` to keep the existing call site stable.

## Why

Before v81, every new AI video provider had to be added to **two** identical tables — `compose-video-clips/index.ts` (charges) and `compose-clip-webhook/index.ts` (refunds). When they drifted (e.g. happyhorse/vidu/grok/ltx were added later), the dispatcher could charge €0.56/s while the webhook only refunded €0.15/s on failure, silently eating user credits on failed renders. A single shared module makes drift impossible.

Same story for the two speaker-parsing helpers — the regexes were already identical, but were copy-pasted, so any future fix (e.g. a new prefix shape) would only land in one file.

## Deferred to v82+

`_shared/plate-face-detect.ts` and `_shared/twoshot-face-map.ts` both prompt Gemini Vision with slightly different face-bbox JSON schemas. The shapes diverge on purpose (plate-face vs scene-anchor coords), so consolidating prompts would require unifying their schemas first — kept as separate work to avoid coupling unrelated detection paths.

## Files
- created `supabase/functions/_shared/clip-costs.ts`
- created `supabase/functions/_shared/dialog-speakers.ts`
- edited  `supabase/functions/compose-video-clips/index.ts`
- edited  `supabase/functions/compose-clip-webhook/index.ts`
