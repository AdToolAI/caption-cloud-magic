---
name: v113 — Real 720p Preclip Payload + Sync.so No-op Guard
description: v112 computed 720p preclip metadata but forgot to pass `outputSize` into DialogTurnFaceCropVideo inputProps, so Lambda rendered real 512×512 files; v113 forwards outputSize, blocks <720p preclips before Sync.so, and records/retries COMPLETED no-op outputs.
type: architecture
---

# v113 — Real 720p Preclip Payload + Sync.so No-op Guard

## Root cause

The v112 fix only changed DB/render metadata. The actual Remotion composition
still fell back to 512×512 because `_shared/pass-face-preclip.ts` did not pass
`outputSize` into `DialogTurnFaceCropVideo` inputProps.

Observed on scene `3da688ef-e467-45e7-a6a7-503c1432270a`:

- `dialog_shots.passes[*].preclip_crop.outputSize = 720`
- `video_renders.format_config.width/height = 720`
- actual `ffprobe(preclip_url)` returned `512×512`
- Sync.so outputs were also `512×512` and nearly identical to preclips
  (`mean_diff ≈ 1–2`) → visually no mouth movement despite `COMPLETED`.

## Rules

1. `DialogTurnFaceCropVideo` payload MUST include `outputSize`.
2. `DialogTurnFaceCropVideoSchema` MUST accept optional `outputSize`.
3. After rendering a pass preclip, `compose-dialog-segments` MUST probe the
   actual URL. If the real min-axis is `<720`, treat it as a preclip failure
   and do not dispatch it to Sync.so.
4. `sync-so-webhook` records input/output HEAD + dimension probes on completed
   passes. If Sync.so returns an unchanged or resolution-regressed output, mark
   the pass `retrying`, clear stale `preclip_url`, and re-dispatch once/twice
   instead of muxing a silent no-op result.
5. Remotion bundle MUST be redeployed after this change; Edge Function deploy
   alone is insufficient because the 512 fallback lived in the Remotion bundle.

## Official Sync.so basis

- Sync.so recommends at least 480p for reliable face detection and 1080p as the
  quality/speed balance.
- AI-generated plate prompts should include: "the character should be speaking
  naturally" so the model has random/natural mouth motion to drive lipsync.
