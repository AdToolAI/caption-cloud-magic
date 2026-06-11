# v99: Preclip mit expliziter Crop-Local Bbox (kein auto_detect mehr)

## Diagnose

Heruntergeladen + analysiert (Szene `71abb2e2`, 4 Sprecher):

| Pass | Sprecher  | Output             | Mean Frame-Diff |
|------|-----------|--------------------|-----------------|
| 1    | Samuel    | full-plate         | **5.85**        |
| 2    | Matthew   | preclip 278→512    | **1.24** ← tot  |
| 3    | Kailee    | preclip            | **6.97**        |
| 4    | Sarah     | preclip            | normal          |

Sync.so akzeptierte Matthews Preclip + Audio, lieferte `status=done`, **erzeugte aber keinerlei Mundbewegung** (Frame-Diff 1.24 ≈ Standbild-Rauschen). Der v76 Neighbor-Cap arbeitet korrekt — Samuel ist **nicht** in Matthews 278×278 Crop (x=88..366, Samuel bei x=460..629). Das war die falsche Hypothese.

Wahres Problem: `auto_detect:true` auf einem 278→512 upscaled Hailuo-Preclip mit kurzem Audio (1.075 s) versagt still — Sync.so findet kein Target, kopiert das Eingangsvideo.

## Fix (v99 — deployed)

`compose-dialog-segments`: Preclip-Dispatch sendet jetzt explizit `active_speaker_detection.bounding_boxes` mit statischer Box in **Crop-Local Output-Pixel-Koordinaten**:

1. Plate-Bbox aus `speakerPlateBboxes` oder Anchor-Facemap.
2. In Crop-Local: `(plateBbox - preclip_crop.{x,y}) * (512/cropSize)` + 12 % Padding.
3. `bounding_boxes` Array Länge `ceil(dur_sec * 30)`, alle Frames = dieselbe Box.
4. `auto_detect: false`.

Fallback auf alten `auto_detect:true` Pfad nur wenn Bbox nicht berechenbar (`v99_preclip_bbox_skip` Log).

## Verifizierung

Nächster 4-Sprecher-Run:
- Log: `v99_preclip_bbox speaker=Matthew Dusatko cropLocalBox=[…] frames=…`
- Sichtprüfung: alle 4 Münder bewegen sich.
- Notfall-Quantcheck: `ffmpeg fps=10` Mouth-Crop Frame-Diff > 4 für jeden Pass.
