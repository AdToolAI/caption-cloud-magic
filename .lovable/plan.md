## Diagnose

Nach v196 (harte Masken) + v197 (Silent-Windows) sind die großen Morphs weg, aber im Screenshot ist bei der rechten Sprecherin noch ein leichter Rand-Morph im Kiefer-/Wangenbereich sichtbar. Ursache:

Die harten Face-Disc-Masken (`#000 47% → transparent 48%`) sind zwar hart, aber der **Radius selbst ist zu klein**. Die Maskenkante liegt bei den meisten Preclip-Crops mitten auf der Haut (Kinn/Wange/Hals). Genau an dieser Kante trifft der Sync.so-Face-Layer (leicht reprojiziert/skaliert) auf das Live-Plate-Gesicht darunter — zwei minimal verschobene Hautflächen an derselben Stelle lesen sich als Morph, obwohl gar kein Alpha-Blend mehr stattfindet.

Bei den Fan-Out-Passes ist der Sync.so-Output ein **Full-Frame-Render** derselben Szene, in dem nur die Lippen des Zielsprechers bewegt sind. Wir dürfen die Maske also deutlich größer machen — bis in Haare/Hintergrund — ohne visuelle Nachteile, weil der Rest des Frames sowieso identisch zur Master-Plate ist.

## Fix (v198 — Mask Enlargement)

1. **`FaceMaskOverlay` (Fan-Out, Zeile 290–328)**
   - Radius intern auf `radiusPx * 1.6` skalieren (Kopf + Kiefer + etwas Umgebung).
   - Kante bleibt hart (1 px AA-Band).
   - Kommentar aktualisieren: „v198: enlarged disc so the seam falls in hair/background, not on skin."

2. **`CroppedOverlay` (Face-Crop, Zeile 218–272)**
   - Statt `radial-gradient` mit 47/48% jetzt einen deutlich größeren Disc: `#000 62% → transparent 63%`.
   - Alternativ: gar keine Maske mehr wenn `holdToEnd`/Fan-Out-Pfad — dann ist die Kante = Crop-Rechteck-Kante im ohnehin identischen Hintergrund.

3. **`SilentFaceAnchor` (v183, Zeile 352–404)**
   - Nur kosmetisch: Radius von 47/48% auf 55/56% erhöhen, damit statisches Anker-Portrait bei Silent-Windows nicht mitten auf der Haut endet.

4. **`SilentFaceFreeze` (v197, Zeile 487–525)**
   - Radius von 47/48% auf 55/56% erhöhen (analog zu Anchor).

5. **`MouthMatteFreeze` (v193, Zeile 418–470)**
   - Ellipse-Radius von 54/55% auf 60/61% erhöhen.
   - Bleibt sowieso opt-in-off (siehe v197).

## Erwartetes Ergebnis

- Kein Rand-Morph mehr, weil die Maskenkante in Bereichen liegt, in denen Sync.so-Output und Live-Plate praktisch pixelgleich sind (Haare, Hintergrund).
- Kein neuer Alpha-Blend eingeführt — Kanten bleiben hart (1 px AA).
- Silent-Windows-Verhalten (v197) und v169-Single-Face-Layer-Invariante unverändert.

## Betroffene Dateien

- `src/remotion/templates/DialogStitchVideo.tsx` (5 Mask-Konstanten in 5 Komponenten)
- `mem/architecture/lipsync/v195-silent-face-freeze.md` (v198-Addendum)

Kein Backend-, Payload- oder Pipeline-Change. Rein visueller CSS-Mask-Tune.
