---
name: v163 Single-Face Preclip + bbox-url-pro exact framecount
description: Einheitlicher 1..N Sprecherpfad mit Preclip + Sync.so bbox-url-pro; Bounding-Box-JSON nutzt exakte Remotion durationInFrames, nie gerundete Dauer.
type: feature
---

# v163 — Single-Face Preclip + bbox-url-pro mit exakter Framezahl

## Pipeline (identisch für N=1 und N=4)

1. **Per-Pass Preclip Render** (`renderPassFacePreclip` aus `_shared/pass-face-preclip.ts`)
   - Square-Crop um die plate-native Face-Box des Zielsprechers, 720–1280 px
   - Render via Remotion Lambda `DialogTurnFaceCropVideo`
   - Sibling-coords verhindern dass Nachbargesichter im Crop landen
   - Idempotent: gespeichert auf `pass.preclip_url` / `preclip_crop` / `preclip_render_id` / `preclip_start_sec` / `preclip_end_sec`
   - `pass.preclip_frame_count` MUSS exakt `durationInFrames` aus Remotion sein
2. **Sync.so Dispatch** — `model: "sync-3"`, `sync_mode: "cut_off"`,
   `active_speaker_detection: { auto_detect: false, bounding_boxes_url: <clip-space JSON> }`
   - `video.url = preclip_url`
   - Bounding-Box ist in **Clip-Koordinaten**: `(plate - crop.x) * (outputSize / size)`
   - Frame count = `pass.preclip_frame_count`; legacy fallback nur `ceil(duration * fps)`, nie `round`
   - Windows = `speakerWindowsSecs - preclip_start_sec`
   - Area-Gate Upper Bound 0.98 (statt 0.45) im Preclip-Modus, da Face ~70-90% einnimmt
3. **Mux** (`render-sync-segments-audio-mux`)
   - `preclip_crop` triggert den `crop` overlay-Modus im Remotion Stitcher
   - Lipsynced Crop wird zurück auf die Master-Plate gelegt, kein Full-Frame-Output landet je im finalen Video

## Fail-Closed

- Wenn Preclip-Render scheitert → Fallback auf Full-Plate `bbox-url-pro` (alter v153-Pfad)
- Wenn keine Plate-Box hydratisiert ist → v153.5 Hard-Fail + Refund (greift weiterhin)
- Wenn keine sichere Preclip-Framezahl verfügbar ist → vor Sync.so failen/refunden; kein Auto-Detect-Fallback

## Warum v163 nötig war

Sync.so verlangt, dass `bounding_boxes_url.bounding_boxes.length` exakt der
Framezahl des Input-Videos entspricht. v162 nutzte für Preclips noch
`round(durationSec * 30)`; Remotion rendert aber `ceil(durationSec * 30)`.
Bei kurzen Turns entstanden dadurch 73 statt 74 oder 28 statt 29 JSON-Einträge,
was Sync.so als `generation_unknown_error` terminierte.

## Warum nicht mehr Full-Plate als Primärpfad

Sync.so Full-Plate `bbox-url-pro` produziert auf Multi-Face-Plates trotz korrekter
Box reproduzierbar Animorph-Artefakte auf Nachbargesichtern, weil das Modell die
gesamte Frame-Region als Input nimmt. Single-Face-Preclip schließt das strukturell aus.

## Versionsmarker

- `COMPOSE_DIALOG_SEGMENTS_VERSION = "v163"`
- Log-Marker pro Pass: `v163_preclip_render START/OK/FAILED`, `v163_bbox_framecount source=preclip_frame_count`, `v163_bbox_clip_space`, `v163_BBOX_URL_PRIMARY space=clip`
