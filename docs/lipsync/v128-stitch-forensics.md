# v128 Stitch Forensics — Are Sync.so pass outputs used in final mux?

**Status:** read-only investigation, parallel to v128 Track A (Soak). No code touched, no DB mutated, no re-render, no engine swap. Findings only.

**Trigger:** User reports `dialog-stitch-muxed-*.mp4` plays correct dialog audio but lips never move on any of the 4 speakers. Scene `lip_sync_status=done`, engine `sync-segments`, all 4 passes terminal `done` with `output_url` set.

**Scenes inspected:**
- Scene N (new, user-reported): `225ea521-7e18-4a02-b279-6f172db4ffd0`
- Scene O (older, gegen-probe): `a68624ff-66ab-4171-9190-eb5805d042cb`

Both share identical state shape: `engine=sync-segments`, `multi_pass=true`, `force_multipass=true`, `multipass_fallback_attempted=true`, `current_pass=3`, all 4 passes `status=done` with `output_url` + `preclip_crop` + `coords` set, `source_clip_url` set.

---

## 1 — Code-Beweis (the 8 questions)

### Q1. Who produces `final_url = dialog-stitch-muxed-*.mp4`?
`supabase/functions/render-sync-segments-audio-mux/index.ts` (`stage = "sync_segments_audio_mux"`), which dispatches a Remotion Lambda render with composition `DialogStitchVideo`. The webhook (`source: "dialog-stitch"`) then writes the resulting URL back to `composer_scenes.clip_url`.

### Q2. What manifest does the stitch renderer receive?
Built in `render-sync-segments-audio-mux/index.ts` lines 164–329. `inputProps` shape sent to Lambda:
```
{
  masterVideoUrl,       // ← source plate when overlay branch active
  masterAudioUrl,       // ← audio_plan.twoshot.url (merged master WAV)
  totalSec, targetWidth, targetHeight, srcWidth, srcHeight,
  shots: [ { startSec, endSec, outputUrl, sourceTiming,
             sourceStartSec, crop|faceMask } ]
}
```

### Q3. Does the manifest reference `passes[].output_url`?
**Yes.** `render-sync-segments-audio-mux/index.ts:284` and `:309` pass `outputUrl: String(p.output_url)` into every shot.

### Q4. Does it carry `preclip_crop { x, y, size, outputSize }`?
**Yes.** Lines 236–277: `preclipCropValid` gate, then `crop: { x, y, size }` injected into every shot for which `coords` lies inside `preclip_crop` (fallback to `faceMask` otherwise). For Scene N all 4 passes have `coords` inside `preclip_crop` → all 4 shots get the `crop` payload.

### Q5. Does the renderer actually load `output_url`?
**Yes.** `src/remotion/templates/DialogStitchVideo.tsx:185` and `:241` instantiate `<Video src={shot.outputUrl} muted .../>` inside `CroppedOverlay` / `FaceMaskOverlay` respectively.

### Q6. Is the crop composited back into the wide plate?
**Yes.** `DialogStitchVideo.tsx:348–376`: when `shot.crop.size > 0`, the renderer mounts a `<Sequence from=startFrame durationInFrames=segDuration>` containing `<CroppedOverlay left=crop.x*scaleX top=crop.y*scaleY size=crop.size*max(scaleX,scaleY)>`. Master plate `<Video src={masterVideoUrl} muted/>` plays beneath (lines 277–291). With `srcWidth=targetWidth=1376` and `srcHeight=targetHeight=768`, `scaleX=scaleY=1`, so left/top/size are written 1:1 from `preclip_crop`.

### Q7. Is there a "plate-only mux" fallback path?
There **is** a single-speaker legacy branch: when `useOverlay = isFanout || (donePasses>=1 && anyTight)` is false, `masterVideoUrl = finalLipsyncUrl` (the chained multi-pass output) and `shots = []` (line 317). For Scene N (4 done passes, all tight) `useOverlay=true`, so this is **not** the path taken.

### Q8. When does the fallback fire?
Only when no done pass has `audio_tight` set, or single speaker without `audio_tight`. Scene N has 4 passes each with `audio_tight` → fallback is **not** active.

**Conclusion of code audit:** The stitch wiring is correct in intent. The `outputUrl` is referenced, the `preclip_crop` geometry is applied, the composite branch is actually selected, and there is no silent plate-only fallback being triggered.

---

## 2 — Manifest-Beweis (Scene N actual values)

Reconstructed from DB:
```
scene_id        : 225ea521-7e18-4a02-b279-6f172db4ffd0
engine          : sync-segments
multi_pass      : true
force_multipass : true
multipass_fallback_attempted : true
source_clip_url : .../composer/.../225ea521-...mp4   (1376x768, 24fps)
final_url       : dialog-stitch-muxed-225ea521-...-1781641597710.mp4
                  (1376x768, 30fps, h264+aac, dur 9.088s)
total_sec       : 9
video_width/h   : 1376 / 768

passes:
  #0 Samuel  seg=[0.000, 2.276]  coords=[302,103]  preclip_crop={x:184, y:0,   size:234, outputSize:720}  out=lipsync-pass-1.mp4 (720x720, 2.30s, 30fps)
  #1 Matthew seg=[2.526,3.408]  coords=[537,230]  preclip_crop={x:426, y:120, size:220, outputSize:720}  out=lipsync-pass-2.mp4 (720x720, 1.00s, 30fps)
  #2 Kailee  seg=[3.658,6.537]  coords=[303,138]  preclip_crop={x:192, y:28,  size:220, outputSize:720}  out=lipsync-pass-3.mp4 (720x720, 3.00s, 30fps)
  #3 Sarah   seg=[6.787,8.691]  coords=[1128,230] preclip_crop={x:994, y:96,  size:268, outputSize:720}  out=lipsync-pass-4.mp4 (720x720, 2.03s, 30fps)

→ All 4 shots qualify for the crop branch.
```

Manifest is well-formed. `outputUrl` + `crop` + `sourceTiming=relative` + `sourceStartSec=0` for every shot.

---

## 3 — Pixel / ROI-Beweis

Sampled mid-frame of each speaker's segment.
- **A** = `source_clip_url` cropped at `preclip_crop {x,y,size}` at global time τ.
- **B** = `output_url` (full 720×720), rescaled to `size×size`, at relative time τ − seg.start (since `sourceTiming=relative`, `sourceStartSec=0`).
- **C** = `final_url` cropped at the same `{x,y,size}` at global τ.

### Single-frame MSE (lower = more similar)

| Speaker | MSE(C,A) | MSE(C,B) | MSE(A,B) | Single-frame verdict |
|---|---:|---:|---:|---|
| 0 Samuel  | 4.3  | 3.4  | 3.3  | C ≈ B (slightly), **A ≈ B too** |
| 1 Matthew | 15.6 | 11.6 | 20.1 | C ≈ B |
| 2 Kailee  | 6.8  | 4.5  | 7.7  | C ≈ B |
| 3 Sarah   | 27.5 | 29.4 | 37.7 | C ≈ A (Sarah moves naturally in plate) |

The shot **is** being composited (C tracks B more than A in 3 of 4 cases). But the absolute MSE values are tiny (<30 on a 0–65k scale) — A, B, C are all visually almost the same frame, which already hints at the actual problem.

### Temporal motion (mean absolute pixel delta between 8 consecutive sampled frames inside each segment)

| Speaker | motion(A plate) | motion(B Sync.so out) | motion(C final) |
|---|---:|---:|---:|
| 0 Samuel  | 0.68 | 0.92 | 1.05 |
| 1 Matthew | 0.47 | 0.52 | 0.75 |
| 2 Kailee  | 0.65 | 0.86 | 1.05 |
| 3 Sarah   | 2.40 | 2.09 | 2.32 |

These are tiny deltas (≪ 5 on a 0–255 scale), and crucially **B is essentially as still as A**. A real Sync.so render with active lip animation in the mouth region produces motion scores well above the plate's idle motion. Here Sync.so adds at most ~0.3 per speaker — within compression noise.

### Sync.so output vs Sync.so input (preclip 0)

| Stream | Frame-to-frame motion | Mean |C−input| per matched frame |
|---|---:|---:|
| Preclip 0 (Sync.so input) | 0.61 | — |
| Out 1 (Sync.so output) | 0.74 | 1.06 |

**Sync.so output ≈ Sync.so input.** The provider is returning the preclip essentially untouched: no lip animation was added.

Side-by-side strip (A | B | C per speaker): `/mnt/documents/v128-stitch-rois/sceneN_AvsBvsC.png`.

<presentation-artifact path="v128-stitch-rois/sceneN_AvsBvsC.png" mime_type="image/png"></presentation-artifact>

---

## 4 — Audio / Mux-Beweis

`ffprobe final.mp4`:
```
video: h264 1376x768 30fps  bit_rate=1.99 Mb/s
audio: aac  48kHz                bit_rate=317 kb/s
duration: 9.088s
container: mp4
```

The plate is 24 fps; final is 30 fps — final is a true re-encode through Remotion Lambda (`DialogStitchVideo`), **not** a `-c:v copy` plate passthrough. The Lambda render is actually executing the composite tree.

---

## Vergleichs-Tabelle Scene N vs Scene O

| | Scene N (225ea521) | Scene O (a68624ff) |
|---|---|---|
| `engine` / `multi_pass` / `force_multipass` / `multipass_fallback_attempted` | sync-segments / true / true / true | sync-segments / true / true / true |
| Pass-Outputs exist? | 4 / 4 (`status=done`, `output_url` set) | 4 / 4 (`status=done`, `output_url` set) |
| Manifest references `output_url` + `preclip_crop`? | Yes for all 4 | Yes for all 4 (same shape) |
| `useOverlay` branch taken? | Yes (fanout, tight) | Yes (fanout, tight) |
| Plate-only fallback triggered? | No | No |
| `final_url` re-encoded by Lambda? | Yes (24fps→30fps) | (not re-downloaded; same code path) |
| Visual lip motion in passes? | **No (motion ≈ 0.5–1.0)** | (not measured this run; same engine + flags) |

Scene N and Scene O take **byte-identical** stitch code paths. There is no v128-adjacent flag that selects a different stitch branch for one vs the other.

---

## Pflicht-Schluss — Klassifizierung

> **E — Composite is correct, but the pass output itself is not lipsynced. Problem is upstream of Stitch (Targeting / Preclip / Sync.so), not in the Stitch/Mux step.**

Evidence chain:
1. The Stitch manifest **does** reference `passes[].output_url` (Q3).
2. The Stitch manifest **does** carry valid `preclip_crop` geometry (Q4).
3. The Remotion `DialogStitchVideo` composition **does** load `outputUrl` and mounts a `<CroppedOverlay>` at the correct rect (Q5–Q6).
4. The plate-only fallback is **not** triggered (Q7–Q8).
5. The final mp4 is a true Lambda re-encode (24fps→30fps), not a `-c:v copy` plate passthrough (§4).
6. ROI compare shows `C ≈ B` slightly more than `C ≈ A` in 3 of 4 speakers (§3 MSE), confirming the synced crop **is** being painted on top of the plate.
7. But `B` (Sync.so output) has near-zero per-frame motion delta vs `A` (plate) (§3 motion table).
8. And `B` (Sync.so output) is essentially **frame-identical to its own preclip input** (§3 last table: mean diff 1.06 / 255).

Therefore Sync.so accepted the preclip + tight WAV, returned 200 OK with an `output_url`, but the returned video is **the input video with the WAV simply muxed back in** — no actual lip animation was generated. The stitch then dutifully composites these unsynced crops onto the plate, producing the symptom the user sees: correct audio, static mouths.

### Branches **A–F** explicitly ruled out

- **A — Manifest does not reference `output_url`.** Ruled out by Q3 + §2.
- **B — Renderer ignores `output_url`.** Ruled out by Q5–Q6 + §3 (C tracks B in 3/4 speakers).
- **C — Geometry missing/wrong.** Ruled out by Q4 + §2 (all 4 preclip_crops valid, coords inside).
- **D — Composite at wrong scale/position.** Ruled out by scaleX=scaleY=1 + visible alignment in `sceneN_AvsBvsC.png`.
- **F — Plate-only fallback active.** Ruled out by Q7–Q8 + §4 (true re-encode).

Only **E** survives.

---

## Implications for v128 Soak (Track A)

This scene **does not constitute a v128 Soak failure**:
- No terminal recycle observed on this scene.
- No duplicate `provider_job_id` per `(pass_idx, attempt_id)`.
- All 4 passes transitioned `dispatched → done` cleanly, terminally, with the v128 dispatch-log metadata.
- No Watchdog re-dispatch.
- No Plan-D fan-out.
- Webhook writes happen inside `withDialogLock`.

The state machine, locks, transition-guard, watchdog reduction, and Plan-D kill-switch are all behaving as designed. The visible lip-sync failure has a different root cause and a different blast radius.

## Out of scope of this report

- No code edits.
- No DB mutation.
- No re-render.
- No engine swap.
- No proposed hotfix wording (the Stitch path is innocent; the upstream Sync.so dispatch is the actual suspect surface and needs its own forensics track that is not blocked by v128 Soak exit).

A follow-up read-only forensics on the upstream side should look at:
- Why `_v105_probe.asd_has_coordinates=false` and `asd_auto_detect=true` for every pass despite `coords` being persisted on the pass record (see `mem://architecture/lipsync/sync-3-doc-strict-options-v106` — multi-speaker should never dispatch with `auto_detect`).
- Whether Sync.so silently no-ops when ASD cannot lock onto a face in the 720×720 single-face preclip and returns the input with the new WAV.
- Whether the 4 lipsync-pass-N.mp4 files are stored in Supabase Storage as fetched from Sync.so verbatim, or whether they're a fallback copy of the preclip after an upstream error.

These belong to a separate "Sync.so output authenticity" track and explicitly stay parked until v128 Soak exits (48h green).

---

## STATUS: CLOSED — Classification E confirmed

- Composite/Stitch is innocent: `final_url` correctly references `passes[].output_url` and overlays them via `<CroppedOverlay>` at the persisted `preclip_crop` geometry.
- Root cause is **upstream of Stitch**: Sync.so pass `output_url` is visually ≈ Sync.so input/preclip (effective no-op / passthrough).
- The suspicious datapoint — `_v105_probe.asd_auto_detect=true` and `asd_has_coordinates=false` despite persisted coords — points at the actual outbound Sync.so request, not at Stitch.

Continued in `docs/lipsync/v129-syncso-output-authenticity.md`.
