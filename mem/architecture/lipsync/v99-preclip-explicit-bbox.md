---
name: v99 Preclip Explicit Crop-Local Bbox (no auto_detect)
description: When dispatching a per-pass preclip to Sync.so, compose-dialog-segments now sends a static per-frame `active_speaker_detection.bounding_boxes` in CROP-LOCAL output-pixel space (derived from faceMap/plate-identity bbox + persisted preclip_crop). Fixes silent no-op on edge-speaker preclips (DB-verified Matthew scene 71abb2e2: mean frame-diff 1.24 vs 5.85/6.97 → mouth closed despite Sync.so returning "done"). Falls back to legacy auto_detect:true only when bbox cannot be computed.
type: architecture
---

# Why
v76 neighbor-aware preclip correctly shrunk Matthew's 4-speaker preclip to 278px (Samuel out of crop). v68 then dispatched it with `auto_detect:true`. Sync.so accepted the 1.08s audio + 278→512 upscaled preclip, returned `status=done`, but produced an essentially unchanged output (frame-diff 1.24 vs Samuel/Kailee 5.85/6.97 — mouth never moved). The user-visible symptom: "alle Charaktere lip-syncen korrekt, nur Matthew hat den Mund zu".

# Rule
Preclip dispatch never relies on `auto_detect`. It computes the speaker's face bbox in crop-local output coordinates via:
1. Resolve plate-pixel bbox: prefer `speakerPlateBboxes[speaker_idx]` (plate-identity), fallback to anchor-rescaled `faceMap.faces[].bbox`.
2. Translate into preclip-local coords: `(plateBbox - preclip_crop.{x,y}) * (outputSize / size)` with ±12 % padding on the larger bbox dim.
3. Build `bounding_boxes: [ [x1,y1,x2,y2], … ]` length = `ceil(dur_sec * 30)`, all entries = same box (static — preclip is single-face by construction).
4. Set `active_speaker_detection = { auto_detect: false, bounding_boxes: [...] }`.

If either plateBbox or preclip_crop is missing the path graceful-degrades to legacy `auto_detect:true` and logs `v99_preclip_bbox_skip`.

# Files
- `supabase/functions/compose-dialog-segments/index.ts` — preclip-branch of the syncOptions builder (line ~2465).

# Verification
- Log line `v99_preclip_bbox speaker=… cropLocalBox=[…] frames=… preCrop=… plateBbox=…` for each preclip pass.
- Frame-diff sanity (ffmpeg fps=10 / mean L-abs-diff on mouth crop): expect ≥ 4 on lipsynced output, < 2 = silent no-op (re-investigate).
