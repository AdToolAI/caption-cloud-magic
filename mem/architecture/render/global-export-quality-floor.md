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
