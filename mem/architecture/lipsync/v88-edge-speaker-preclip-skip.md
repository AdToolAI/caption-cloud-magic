---
name: v88 Edge-Speaker Preclip Skip (mute-mouth fix for edge faces)
description: compose-dialog-segments skips the 512x512 single-face preclip for speakers whose coords lie in the outer 25 % width / 15 % height of the plate. Edge speakers go directly via bbox-url-pro on the full multi-face plate (sync-3), because auto_detect:true on an edge-cropped 512x512 frame routinely returns the preclip unchanged → closed mouth in the muxed scene.
type: architecture
---

**Symptom**: DB-confirmed on scene `ec22e048…` (June 2026, 4-speaker dialog, 1376×768 plate). Sync.so jobs completed `COMPLETED` for all 4 passes, but the muxed output showed closed mouths during the windows of the two edge speakers (Kailee at x-frac 0.22, Sarah at x-frac 0.84). The two center speakers (Samuel 0.63, Matthew 0.41) animated correctly.

**Root cause**: The unified per-face preclip pipeline (v68/v69) crops a 512x512 single-face window and dispatches with `active_speaker_detection.auto_detect:true`. For edge speakers the crop hugs the plate boundary; the face sits at the crop edge with minimal contextual pixels. Sync.so's auto-detect fails to lock onto the face and returns the preclip unmodified.

**Fix** (`supabase/functions/compose-dialog-segments/index.ts`, around line 1950):

```ts
const EDGE_X_FRAC = 0.25;
const EDGE_Y_FRAC = 0.15;
const speakerIsEdgePositioned = …  // xFrac < 0.25 || > 0.75 || yFrac < 0.15 || > 0.85
const haveBboxUrlPathForEdge = speakers.length >= 2 && plateDims && plateIdentityMap?.resolvedCount > 0;
const skipPreclipForEdgeSpeaker = speakerIsEdgePositioned && haveBboxUrlPathForEdge;
const wantPassPreclip = … && !skipPreclipForEdgeSpeaker;
```

When the guard fires, `freshDefaultVariant` (line ~1756) already chooses `bbox-url-pro`, so Sync.so receives a per-frame deterministic target box on the full plate — exactly the path sync-3 handles natively for multi-speaker locked plates.

**Diagnostic log**: `[compose-dialog-segments] v88_edge_speaker_skip_preclip coords=… plate=…`.

**Guardrails**:
- Only fires when `plateDims` AND a resolved `plateIdentityMap` are available (otherwise no reliable bbox target → fall back to preclip path).
- Center speakers and single-speaker scenes are unaffected (preclip path remains preferred).
- Does NOT change cost, retry ladder, or webhook contract.
