---
name: v129.3 Sync-Audio Normalization
description: Lipsync — Sync.so payload audio MUST be local to preclip; voiced-window trim + post-trim preflight gate in compose-dialog-segments
type: feature
---

**Rule:** Sync.so input audio for Dialog-Shot passes must be local to the preclip duration. Never send timeline-style per-turn audio with multi-second leading silence to the provider.

**Where:** `compose-dialog-segments/index.ts` v129.3 block, right after the `prepare_failed_no_tight_audio` gate and before the legacy SILENT_AUDIO_GATE.

**How:**
1. Re-inspect `pass.audio_url` via `inspectWav` + new `detectVoicedRange` (`_shared/syncso-preflight.ts`).
2. If `leadIn > 0.5s` OR `voicedEnd > preclipDur + 0.25s` OR slack vs voiced extent > 0.6s, slice via `sliceWavToWindows([{ startSec: first_voiced - 0.15, endSec: last_voiced + 0.20 }])`.
3. Upload to `${userId}/twoshot-vo/${scene}-pass-${idx+1}-sync-${sha1Short}.wav` (deterministic upsert).
4. Set `(pass as any).sync_audio_url` — **do not** mutate `pass.audio_url` (final audio-mux Lambda needs the original timeline-aligned WAV).
5. Sync.so payload uses `(pass as any).sync_audio_url ?? pass.audio_url`.

**Post-trim preflight gate** (terminal + refund, no retry):
- `voicedSec < 0.15` → `audio_too_silent`
- `firstVoicedSec > 0.5` → `audio_leadin_too_long_after_trim`
- `lastVoicedSec > preclipDur + 0.25` → `audio_voiced_exceeds_video`
- `full > preclipDur + 0.5 && tailSilence < 0.2` → `audio_overflow_unverifiable_tail`
- WAV slice throws (unsupported format) → `unsupported_wav_format_for_trim`

All v128 terminal invariants preserved: `COMPLETED_NOOP_SUSPECT` terminal, `provider_unknown_error` terminal, no new auto-retry path introduced.

**Telemetry:** `syncso_dispatch_log.meta.payload_audio_normalized` (bool) + `meta.audio_normalization` ({ mode, original_*, trimmed_*, removed_lead_sec, removed_tail_sec, pre_roll_sec, post_roll_sec, sync_audio_url }).

**Root case:** scene `7aed09f4-…` Sarah pass-4 — preclip 1.785s vs 9s WAV with 6.688s leading silence → terminal `provider_unknown_error` on sync-3 + cut_off. v129.1 doc-strict + v129.2.1 ambiguity guard were green; coords were never the issue.
