## Problem

In multi-/single-speaker dialog scenes the rendered clip freezes on the last frame while the voiceover keeps playing. Cause: the master plate (Hailuo / HeyGen i2v, typically 6–12 s) is often shorter than the master VO audio. We currently send `options.sync_mode = "cut_off"` to Sync.so, which per their docs trims the output to the **shorter** of (video, audio). When `plate < audio`, the returned lipsync clip ends early. The composer then plays the master VO track over a clip whose last frame is held → "frozen scene, voice continues".

Evidence in `supabase/functions/compose-dialog-segments/index.ts`:
- line 1144: `options: { sync_mode: "cut_off" }` (v56 multi-speaker official segments payload)
- line 1920: `sync_mode: "cut_off"` (single-speaker / v39 per-turn path)
- line 2361: `sync_mode: "cut_off"` (per-turn pass dispatch)

Comment block around 1918–1920 even acknowledges: *"cut_off = cut to shortest input length"*.

There is also a log line 2168 that explicitly warns *"audio < expected — Sync.so will truncate output"* — same family of bug, just inverted.

## Fix

Switch the dispatched `sync_mode` from `cut_off` to **`loop`** at all 3 dispatch sites in `compose-dialog-segments/index.ts`. Per Sync.so docs `loop` repeats the source video to match the audio duration, which is exactly what we want for our **locked-camera, no-cut master plates** — looping a static plate is visually invisible while guaranteeing the output length equals the master audio length.

Why `loop` over the alternatives:
- `cut_off` — current bug.
- `remap` — time-stretches the video; on a locked plate this is fine but it also stretches any subtle motion (blinks, micro-movements) which can look unnatural.
- `bounce` — ping-pongs frames; risk of visible reversal on plates with motion.
- `loop` — safest for our v57 locked-plate guarantee; a static plate looped is indistinguishable from a static plate held.

### Files to edit
1. `supabase/functions/compose-dialog-segments/index.ts`
   - line 1144 — multi-speaker v56 official segments payload
   - line 1920 — single-speaker per-turn payload
   - line 2361 — per-turn pass dispatch
   - Update the surrounding log lines (1151, 2177) and the explanatory comments (1787, 1849, 1872, 1918, 2134, 2155, 2164–2168) to reference `loop` and "match audio length".

2. `mem/architecture/lipsync/v63-sync-mode-loop.md` (new) — short architecture note documenting:
   - Symptom (frozen frame + ongoing VO)
   - Root cause (`cut_off` + plate < audio)
   - Fix (`loop`)
   - Why locked-plate invariant (v57) makes `loop` visually safe.

3. `mem/architecture/lipsync/FROZEN-INVARIANTS.md` — add Rule **I.11**: *"Sync.so dispatches MUST send `options.sync_mode = "loop"`. `cut_off`, `bounce`, `remap`, `silence` are forbidden. Rationale: master plate may be shorter than master audio; we require output length = audio length and our plates are locked-camera so looping is invisible."*

4. `mem/index.md` — append the v63 entry under the lipsync block.

### Deploy
- `supabase functions deploy compose-dialog-segments`

### Verification
- Re-render a known 3-speaker scene where the master VO is longer than the Hailuo plate (e.g., ~14 s VO on a 10 s plate).
- Expected edge log: `… sync_mode=loop plate=…` and the returned `clip_url` duration should equal the master audio duration (±0.1 s), not the plate duration.
- In the composer player, the lipsync clip should play through to the end of the VO with no freeze on the last frame.

## Out of scope
- No change to model selection (v62 `sync-3` universal default stays).
- No change to pricing, refund, ASD, face-gate, retry ladder, watchdog.
- No change to the per-turn dialog-shots pipeline beyond the same `sync_mode` swap.
- No client / composer / UI changes — only the dispatched payload changes.