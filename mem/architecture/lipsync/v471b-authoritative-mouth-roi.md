---
name: V471-B Autoritative Mouth-ROI
description: Verdict-ROI wird aus Face-Track + Mund-Anker abgeleitet — Landmark first, kalibrierte Face-Ratio 0.88 als Fallback, engeres Band
type: feature
---

**VERBINDLICH (Verdict-Seite).** Face-Tracking/ASD sind gesund; der Fehler lag in der
Mund-Ableitung innerhalb des Gesichts.

- Mund-Anker: `preclip_geometry_mouth_source === "landmark"` → persistierter signed
  Offset. Sonst Face-Box-Fallback mit `V471_FACE_MOUTH_Y_RATIO = 0.88`
  (der alte Pose-Estimate 0.78 sitzt auf Nase/Oberlippe → ROI ~70–90 px zu hoch).
- Band: `0.53 × faceSide` breit, `0.23 × faceSide` hoch (≈ 0.28 × 0.12) — das V434-Band
  war ~1.7× zu groß und verdünnte das Signal.
- Autorität: `resolveV471MouthRoi` in `_shared/v471-mouth-roi.ts`, adoptiert von
  `evaluateMouthRoiContract`, aktiv nur wenn `preclip_crop` UND `preclip_from_bbox`
  vorliegen. Legacy-Pässe ohne Face-Box bleiben bit-identisch auf V434/V404.
- Unauflösbare Geometrie ⇒ `mouth_roi_unresolved` → `motion_unverified`, nie ein NOOP.
- Nur Verdict: Dispatch, ASD und Preclip-Crop bleiben unverändert.
- Belege: `docs/v471a-roi-sampling-parity.md`, `docs/v471b-authoritative-mouth-roi.md`
  (P1 1.812 NOOP → 2.338 INDETERMINATE, Frozen-Kohorte unverändert, AUC 0.981).
