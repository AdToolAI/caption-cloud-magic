---
name: v204 Preclip-BBox Clip-Space Rollback
description: Rollback of v203 full-plate zwang; multi-speaker dialog dispatches use per-pass single-face preclips with bounding_boxes_url in clip coordinates.
type: architecture
---

# v204 — Rollback zu v169-Preclip-Pipeline

## Problem mit v203

Der v203-Full-Plate-Zwang (`bounding_boxes_url` gegen Master-Plate) produzierte reproduzierbar `generation_input_face_selection_invalid` bei Sync.so. Multi-Face-Plates werden vom Provider systematisch abgelehnt — genau der Grund, warum v107 die Preclips ursprünglich verpflichtend gemacht hat.

## Kanonischer Multi-Speaker-Pfad (v204)

Für JEDEN Pass (unabhängig von `speakers.length`):

1. **Single-Face-Preclip** über Remotion Lambda (`renderPassFacePreclip`) — Square-Crop des aktiven Sprechers.
2. **Sync.so-Dispatch** mit:
   - `video_url` = `preclip_url` (Single-Face-Crop, nicht Master-Plate)
   - `active_speaker_detection` = `{ mode: "bounding_boxes_url", bounding_boxes_url: <clip-space bbox JSON> }`
   - `model` = `sync-3`
   - `sync_mode` = `cut_off`
   - **KEIN** `auto_detect:true` für N≥2 (v169-Regel bleibt in Kraft, Zeile ~6001 im Compose)
3. **Fail-Closed**: wenn `bbox.frame_count !== preclip.frame_count` → hard fail + refund.
4. **Mux** über `render-sync-segments-audio-mux` legt den lipsync-ten Crop via `preclip_crop` zurück auf die Master-Plate.

## Verbotene Pfade

- Full-Plate `bounding_boxes_url` für N≥2 (v203 — reverted, produziert `generation_input_face_selection_invalid`).
- `auto_detect:true` für N≥2 (v169-Regel).
- `coords-pro`, `auto-pro`, `auto-standard`, `coords-pro-lp2pro` als Fresh-Dispatch für N≥2 (Zeile ~4400).

## Telemetrie

Alle Multi-Speaker-Dispatches persistieren:
- `canonical_lipsync_pipeline = "v204_preclip_bbox_clipspace"`
- `input_space = "clip"`
- `preclip_used = true`
- `model = "sync-3"`

## Was aus v201/v202 bleibt

- ID-basierte Speaker/Cast-Resolution (dialog_turns UUIDs).
- Anchor-Image-Invariant (v195).
- Face-Track-Preclip-Renderer selbst (funktioniert).
