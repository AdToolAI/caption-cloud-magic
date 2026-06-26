---
name: Hailuo Lip-Sync Duration Lock
description: Hailuo + Lip-Sync scenes must preserve the user-selected 6s/10s bucket and never auto-extend from audio/container duration.
type: invariant
---

For `clip_source='ai-hailuo'` with Lip-Sync/Cinematic-Sync enabled:

1. `duration_seconds` is the user's selected provider bucket (`6` or `10`).
2. Do **not** auto-bump `6s → 10s` because VO/audio is close to/over the nominal scene duration.
3. Do **not** persist probed MP4/container duration back to `composer_scenes.duration_seconds` for Hailuo/Lip-Sync scenes; provider containers can report the other bucket while UI must keep the user's pick.
4. `compose-twoshot-audio` may trim/pad/regenerate audio to fit the selected bucket, but it must not update the scene duration for Hailuo.
5. `compose-video-clips` must log `honouring user pick` rather than `extending to 10s` for Cinematic-Sync overflow.

Rationale: Hailuo has discrete duration buckets. The UI card and downstream Sync.so pipeline must stay aligned to the explicit user choice, otherwise Realtime/polling appears to "switch" the scene from 6s to 10s about 20 seconds after generation starts.