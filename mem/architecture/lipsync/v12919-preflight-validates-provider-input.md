---
name: v129.19 — Preflight validates provider input (preclip), not plate
description: syncso-preflight now reads outbound_payload (preclip URL + transformed coords + frame_number) instead of plate URL, so a green preflight actually means Sync.so saw a face at the dispatched coord
type: architecture
---

## Problem
v129.18 and earlier `syncso-preflight` read `pass.payload_video_url` (plate)
and either `dispatch.coords` (plate-space [204,171]) or `dispatch.frame_number`
(mid plate frame). But the artifact Sync.so actually receives is the
**preclip MP4** with **frame_number=1** and **transformed coords** (e.g.
[363,360] in 720×720). A green preflight on the plate gave the false
impression "everything ok → Provider-Bug", while in reality the preclip
frame 1 at the transformed coord might have no face (motion blur, blink,
crop edge), and Sync.so legitimately returns `generation_unknown_error`.

## Fix
`supabase/functions/syncso-preflight/index.ts` resolves video/frame/coord
in this order:

1. `videoUrl` ← `meta.payload_summary.input_video` (preclip) → fallback plate
2. `frameNumber` ← `meta.outbound_payload.options.active_speaker_detection.frame_number` → fallback plate only when preclip URL missing
3. `coord` ← `meta.outbound_payload.options.active_speaker_detection.coordinates` → fallback plate only when preclip URL missing

Response adds `resolved.video_source_kind` (`preclip` | `plate`) +
`plate_video_url` + `preclip_video_url` + `preclip_crop` and
`preflight_version: "v129.19"`.

`SyncsoForensicsSheet.tsx` shows `source=preclip|plate` and warns when
preflight had to fall back to the plate (= outbound payload not logged).

## Rule
Preflight MUST validate exactly what the provider sees. Never validate the
plate when an outbound preclip payload exists in `syncso_dispatch_log.meta`.
