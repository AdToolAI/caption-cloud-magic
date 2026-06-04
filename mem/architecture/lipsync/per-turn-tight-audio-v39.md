---
name: Per-Turn Tight Audio Lip-Sync (v39)
description: Fixes "only speaker 1 has lip-sync in 3-speaker scenes" by making the pipeline INDEPENDENT of the deployed Remotion Lambda bundle version. v38 required `<Video startFrom>` on FaceMaskOverlay to seek silence-padded Sync.so output into the right window, which silently failed whenever `scripts/deploy-remotion-bundle.sh` hadn't been re-run after the template change — speakers 2/3 then played their output from t=0 (closed-mouth silence) instead of from their voiced window. v39 slices each pass's per-speaker WAV down to ONLY the voiced turn windows BEFORE dispatching to Sync.so (new `sliceWavToWindows` in `_shared/syncso-preflight.ts`). With `sync_mode=cut_off` Sync.so naturally returns an output equal to the turn duration with animation at t=0. The compositor tags those shots `sourceTiming: 'relative'` so both old and new Lambda bundles render correctly. `segments_secs` on the video input becomes a pure fallback when WAV-slicing fails.
type: architecture
---

**Bug history**
- v37: face-gate softening + sync-3 retry ladder.
- v38: turn-start `frame_number` + `segments_secs` on the video input + per-turn windowed compositor with `<Video startFrom>` to seek the silence-padded full-length Sync output into its window. **Required a Lambda bundle redeploy** that didn't happen → speakers 2/3 played from t=0 of their silence-padded output → mouth never moved.
- v39 (this): tight WAV at the source. Pipeline no longer depends on bundle version.

**Implementation**

1. **`_shared/syncso-preflight.ts`** — new `sliceWavToWindows(wav, windows, {gapSec})` returns a fresh 16-bit PCM WAV with only the voiced regions, concatenated with a tiny silence gap between multi-turn windows. Pure Deno, no ffmpeg.

2. **`compose-dialog-segments/index.ts`** — for multi-speaker scenes (`passes.length >= 2`) and BEFORE the Sync.so dispatch:
   - Fetch `pass.audio_url`, slice to `speakerWindowsSecs`, upload as `${userId}/twoshot-vo/${sceneId}-pass-N-tight-${ts}.wav`.
   - Set `pass.audio_url = tight_url`, persist original as `audio_url_full`, persist `audio_tight = { url, dur_sec, windows_secs }`.
   - If slicing fails, fall back to full-length WAV + `segments_secs` on the video input (v38 behaviour).
   - When tight audio is active, OMIT `segments_secs` from the video input to avoid double-cutting.

3. **`render-sync-segments-audio-mux/index.ts`** — when a pass has `audio_tight`, the shot is tagged `sourceTiming: 'relative'`. The compositor then plays `<Video>` from its own t=0 (no `startFrom` seek). Old Lambda bundles that don't know `sourceTiming` default to relative play — same result.

**Sync.so contract (confirmed against https://sync.so/docs/api-reference/endpoints/generate)**
- `sync_mode=cut_off`: output length = min(video, audio). With tight audio of 2.5s and 9s video, output is 2.5s.
- We anchor `frame_number = turn-start` so the mouth animation begins at the correct frame in the (now tight) output.

**Verification**
- Inspect `dialog_shots.passes[N].audio_tight.dur_sec` — must roughly match `(turnEnd - turnStart) + 0.16s` per pass.
- Each `passes[N].output_url` downloaded individually must now be ~`audio_tight.dur_sec` long with animation starting at frame 0.
- Final muxed `final_url`: all speakers lip-sync inside their own time slots regardless of which Lambda bundle is deployed.

**Out of scope (unchanged)**
- v37 sync-3 retry ladder.
- Single-speaker monologues (1 pass) — they keep using the full-length WAV as before.
- `compose-twoshot-audio` — still emits full-length silence-padded WAVs; v39 just slices them downstream.
