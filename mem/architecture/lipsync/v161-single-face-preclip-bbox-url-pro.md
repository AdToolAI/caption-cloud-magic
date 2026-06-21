---
name: v161 Single-Face Preclip + bbox-url-pro (1..N einheitlich)
description: Einheitlicher Dispatch-Pfad für 1..N Sprecher — Per-Pass Remotion Preclip + Sync.so bbox-url-pro in CLIP-Koordinaten, Mux via preclip_crop. Eliminiert Animorph-Morphen auf Nachbargesichter.
type: feature
---

# v161 — Single-Face Preclip + bbox-url-pro für 1..N Sprecher

## Pipeline (identisch für N=1 und N=4)

1. **Per-Pass Preclip Render** (`renderPassFacePreclip` aus `_shared/pass-face-preclip.ts`)
   - Square-Crop um die plate-native Face-Box des Zielsprechers, 720–1280 px
   - Render via Remotion Lambda `DialogTurnFaceCropVideo`
   - Sibling-coords verhindern dass Nachbargesichter im Crop landen
   - Idempotent: gespeichert auf `pass.preclip_url` / `preclip_crop` / `preclip_render_id` / `preclip_start_sec` / `preclip_end_sec`
2. **Sync.so Dispatch** — `model: "sync-3"`, `sync_mode: "cut_off"`,
   `active_speaker_detection: { auto_detect: false, bounding_boxes_url: <clip-space JSON> }`
   - `video.url = preclip_url`
   - Bounding-Box ist in **Clip-Koordinaten**: `(plate - crop.x) * (outputSize / size)`
   - Frame count = probe(preclip mp4), Windows = `speakerWindowsSecs - preclip_start_sec`
   - Area-Gate Upper Bound 0.98 (statt 0.45) im Preclip-Modus, da Face ~70-90% einnimmt
3. **Mux** (`render-sync-segments-audio-mux`)
   - `preclip_crop` triggert den `crop` overlay-Modus im Remotion Stitcher
   - Lipsynced Crop wird zurück auf die Master-Plate gelegt, kein Full-Frame-Output landet je im finalen Video

## Fail-Closed

- Wenn Preclip-Render scheitert → Fallback auf Full-Plate `bbox-url-pro` (alter v153-Pfad)
- Wenn keine Plate-Box hydratisiert ist → v153.5 Hard-Fail + Refund (greift weiterhin)

## Warum nicht mehr Full-Plate als Primärpfad

Sync.so Full-Plate `bbox-url-pro` produziert auf Multi-Face-Plates trotz korrekter
Box reproduzierbar Animorph-Artefakte auf Nachbargesichtern, weil das Modell die
gesamte Frame-Region als Input nimmt. Single-Face-Preclip schließt das strukturell aus.

## Versionsmarker

- `COMPOSE_DIALOG_SEGMENTS_VERSION = "v161"`
- Log-Marker pro Pass: `v161_preclip_render START/OK/FAILED`, `v161_bbox_clip_space`, `v161_BBOX_URL_PRIMARY space=clip`
