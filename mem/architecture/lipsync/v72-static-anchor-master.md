---
name: v72 Static Anchor Master superseded by v75 Windowed Moving Master
description: v72/v74 static-anchor + hold-to-end overlays are superseded and must not be used as the normal multi-speaker mux path. They caused frozen Photoshop-like scenes and could make one speaker visually lip-sync the whole dialog. v75 restores moving i2v master + per-speaker windowed Sync.so overlays.
type: architecture
---

## Superseded

Do **not** use the v72/v74 static-anchor + hold-to-end approach as the default final mux path.

It was introduced to hide i2v master drift in 4-speaker scenes, but it caused worse production regressions:

- Static anchor master makes characters look frozen / Photoshopped with no breathing, blinking, or scene motion.
- Hold-to-end overlays can visually let one cropped speaker dominate the remaining dialog.
- Long face crossfades into a static anchor read as AI morphing.

## Current rule (v75)

Multi-speaker dialog mux must use:

```text
master = moving source_clip_url when available, else finalLipsyncUrl
overlays = per-speaker segment windows only
holdToEnd = false for normal mux
masterImageUrl = not sent for normal multi-speaker mux
relative tight preclip = Sequence at segment, Video from frame 0
absolute full-scene output = Sequence at segment, Video startFrom = segment startFrame
```

## Drift handling

If the moving master drops speakers, treat that as a plate-quality failure / regeneration case, not as a reason to silently replace the final scene with a static image.

## Verification

- Edge log should show `fanout-N-speakers-windowed`.
- Shot count should match actual dialogue windows, not just one shot per speaker.
- Every speaker moves only in their own time window.
- Base scene remains a moving video, not a static anchor image.
