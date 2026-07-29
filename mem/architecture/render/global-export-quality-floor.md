---
name: Global Export Quality Floor
description: Visually-lossless encode settings applied to ALL Lambda export renders (UCC, Director's Cut, Motion Studio, AI Video Studio, Composer) and the Lip-Sync Mux. Preview renders in the browser Remotion Player are unaffected.
type: architecture
---

# Global Export Quality Floor

All customer-facing Lambda export renders MUST use these encode settings.
Never lower them without a load test — the perceived softness/contrast drift
customers reported before this floor was traced back to `jpegQuality=80` +
default CRF 18 + `x264Preset=medium`.

## Values

| Setting | Global export | Lip-Sync Mux | Reason |
|---|---|---|---|
| `jpegQuality` | 95 | 95 | Q80 was visibly soft on camera-uploaded material |
| `crf` | 16 | 16 | Visually-lossless H.264 (prosumer standard) |
| `x264Preset` | `slow` | `medium` | Mux path is closest to 600s Lambda timeout (v205 4-speaker) |
| `videoBitrate` | `10M` | `10M` | Floor for 1080p; prevents CRF starving in low-motion frames |
| `audioBitrate` | `256k` | `256k` | Up from 128k default |
| `audioCodec` | `aac` | `aac` | unchanged |

## Files

- `supabase/functions/render-with-remotion/index.ts` — global entry-point for
  UCC, Director's Cut, Motion Studio, AI Video Studio, Composer exports.
- `supabase/functions/render-sync-segments-audio-mux/index.ts` — Lip-Sync mux.
- `remotion.config.ts` — mirror values so local/CI renders match Lambda.
- `src/remotion/utils/sensorBaselineGrade.ts` — shared Sensor-Baseline-Grade
  applied on export-only to video/image backgrounds in both UCC
  (`UniversalCreatorVideo.tsx`) and DC (`DirectorsCutVideo.tsx`).

## Sensor Baseline Grade

Value: `contrast(1.03) saturate(1.05)` — exported from
`src/remotion/utils/sensorBaselineGrade.ts` as `SENSOR_BASELINE_GRADE_FILTER`.

Applied on the outgoing frame of every Lambda export render, on video and
image backgrounds only (never on solid color / gradient fills, never in the
in-browser Preview player). It exists so that UCC's `rawMediaMode: true`
export does not look visibly flatter than Director's Cut export, which had
always shipped with a similar micro-contrast baseline via its
`SharpnessFilter` + default color-grade chain.

The baseline is **not** cinematic post-processing (no mood, no grain, no
vignette, no Ken Burns, no parallax, no overlays, no scene-fx). The
UCC Raw-Media-Invariant still holds — see the `raw-media-invariant` memory
and `src/lib/__tests__/universalCreatorRenderPayload.test.ts`.

Do not change this value without a side-by-side frame comparison of UCC vs
DC export from the same source clip.

## OffthreadVideo in export

Both `UniversalCreatorVideo.tsx` (`SafeVideo`) and `DirectorsCutVideo.tsx`
(`SceneVideo`) render video backgrounds through Remotion's `OffthreadVideo`
in export (`previewMode === false`) and through classic `<Video>` in preview
(OffthreadVideo cannot run in the browser). This eliminates Chromium
video-element frame blending and yuv↔rgb color drift that were the residual
softness under the CRF-16 encode floor.



## Exceptions

- **Preview renders** (`RemotionPreviewPlayer`, Motion-Studio preview) run in
  the browser Remotion Player — no Lambda encode. Not affected.
- **Mux path** uses `x264Preset=medium` (not `slow`) to keep 4-speaker v205
  muxes under the 600s Lambda timeout. Everything else matches.

## Cost impact

- +15–25 % Lambda runtime (`slow` preset + larger JPEGs)
- +50–80 % MP4 file size (~15 MB → ~27 MB for 15s 1080p)
- **~0.2 ¢ additional cost per 15 s customer video** at 3008 MB Lambda + S3
  egress. Neutralised by the first sold video credit for ~500 subsequent
  renders (3× margin on video credits).

## Do NOT

- Do not lower any value to save cost — the margin absorbs it.
- Do not apply `slow` preset to the mux path (timeout risk).
- Do not apply these to Preview — Preview renders in the browser.
- Do not touch `rawMediaMode`, `objectFit`, Cinematic-Post, or tier scheduling
  when re-visiting quality — those are orthogonal.
