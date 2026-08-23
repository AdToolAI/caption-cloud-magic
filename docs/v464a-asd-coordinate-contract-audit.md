# V464-A — READ-ONLY ASD / Coordinate Contract Audit

Scope: scene `be60d106…` (S01, 4× NOOP) vs. `c934a823…` (GOLD, 4× MOVED).
Quelle: die **tatsächlich hochgeladenen** `bounding_boxes`-JSONs aus `composer-frames/**/asd/` plus die
**tatsächlich versendeten** Preclips (`/tmp/v462/*.mp4`). Keine Code- oder DB-Änderung in diesem Gate.

## 1. Formale Vertragsprüfung — PASS

| Prüfung | S01 (p1–p4) | GOLD (p1–p4) |
|---|---|---|
| `bounding_boxes.length` vs. Preclip-Frames | 71/48/69/65 = **exakt gleich** | 55/49/66/49 = **exakt gleich** |
| FPS / Auflösung | 30 fps, 720×720 | 30 fps, 720×720 |
| Nulls / Lücken | keine (100 % nonnull) | keine |
| Koordinaten innerhalb 0…720 | ja | ja |
| Index i ↔ Frame i | konsistent (Länge exakt) | konsistent |

Es gibt **keinen** Off-by-N-, FPS-, Normalisierungs- (0–1 vs. px) oder Plate-statt-Preclip-Skalenfehler.
Die S01-Boxen liegen in Preclip-Pixeln und decken grob das Gesicht ab (median IoU 0.59 vs. GOLD 0.61).

## 2. Der reale Bruch: zeitliche Registrierung (mouth-in-box) — FAIL

Alle versendeten Box-Arrays sind **konstant über die Zeit** (genau 1 unique Box pro Pass), auch dort, wo
der Preclip nachweislich eine dynamische Kamerafahrt hat.

Mund-Position (Vision, 8 gleichverteilte Frames pro Preclip) gegen die versendete Box:

| Pass | mouth-in-box | Median-Abstand zur Kante |
|---|---|---|
| S01_p1 | 2/8 | −22 px |
| S01_p2 | 0/8 | −75 px |
| S01_p3 | 0/8 | −55 px |
| S01_p4 | 0/8 | −16 … −120 px (driftend) |
| **S01 gesamt** | **2/32 (6 %)** | **−51 px** |
| GOLD_p1 | 8/8 | +37 px |
| GOLD_p2 | 8/8 | +50 px |
| GOLD_p3 | 0/8 | −15 px (knapp, trotzdem MOVED) |
| GOLD_p4 | 8/8 | +16 px |
| **GOLD gesamt** | **24/32 (75 %)** | **+20 px** |

Verletzte Kante bei S01 in **allen** Fällen: **rechts**. Der Kopf wandert im Preclip nach rechts
(Mund x ≈ 590–660), die statische Box endet bei x2 ≈ 540. Zusätzlich sind die S01-Boxen oben auf `y1 = 0`
geklemmt, d. h. sie wurden nach oben aus dem Bild geschoben.

## 3. Ursache im Dispatch

`dialog_shots.passes` von S01:

| Pass | camera_path_dynamic | Keyframes | preclip_crop (statisch für die Box) | versendete Box |
|---|---|---|---|---|
| 0 | **true** | 20 | x181 y160 size165 | `[170,0,545,511]` |
| 1 | false | 1 | x181 y160 size165 | `[170,0,545,511]` |
| 2 | false | 1 | x456 y140 size151 | `[172,0,539,515]` |
| 3 | false | 1 | x456 y140 size151 | `[172,0,539,515]` |

- Pass 0: Preclip wird mit **zeitabhängigem** Crop (20 Keyframes) gerendert, die Box aber mit **einem**
  statischen Crop projiziert. Korrekt wäre `x_preclip(t) = (x_plate(t) − cropX(t)) × 720 / cropSize(t)`.
- Pass 1–3: Crop ist statisch, aber die Plate-Box stammt aus **einem** Ankerframe, während sich der Kopf
  in der Plate bewegt. Die Box ist damit ebenfalls nur bei t≈0 gültig (siehe S01_p1: Frame 0 in-box,
  ab Frame ~2 dauerhaft außerhalb).

Beides ist derselbe Vertragsbruch: **zeitinvariante Box auf zeitvariantem Mund.**

## 4. Verdikt

Von den vier möglichen Schlüssen aus der Gate-Definition trifft **C** zu:
Koordinatenraum und Skalierung sind korrekt, die **zeitliche/räumliche Registrierung pro Frame** ist es nicht.
Sync-3 bekommt bei S01 in 94 % der Frames eine Region **ohne Mund** — konsistent damit, dass derselbe
Input ohne `active_speaker_detection` MOVED liefert (V463) und dass GOLD (statische Köpfe, Box sitzt) MOVED liefert.

Kein Provider-A/B nötig. Der Fix gehört in die Box-Erzeugung (per-Frame-Boxen aus dem Face-Track,
projiziert mit dem jeweiligen Frame-Crop), nicht in die Provider-Wahl. Kein Code in diesem Gate geändert.
