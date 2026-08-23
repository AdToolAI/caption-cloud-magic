# V471-B — Eine autoritative Mouth-ROI (Verdict-Seite)

Scope laut Freigabe: **Landmark first, kalibrierte Face-Ratio als Fallback**,
**nur Verdict-ROI** (kein Eingriff in Dispatch, Preclip-Crop oder ASD),
**Abnahme über Re-Score der Frozen-Fälle + Regressionssuite**.

## Befund (aus V471-A)

Face-Tracking und ASD sind gesund (V464: per-Frame-Boxen, Mund 12/12 in der Box).
Fehlerhaft ist die **Ableitung der Mundposition innerhalb des verfolgten Gesichts**:

* Alle S01-Pässe tragen `preclip_geometry_mouth_source = "pose_estimate"` →
  Mund bei `FACE_MOUTH_Y_RATIO = 0.78` der Face-Box.
* Die Edit-Karte belegt den real bearbeiteten Mund bei ≈ **0.88** der Face-Box
  (Preclip `cy ≈ 0.61` statt persistiert `cy 0.5426`).
* Zusätzlich ist das V434-Band ~1.7× zu groß (95k vs. 55k ROI-Pixel, IoU 0.39).

## Implementierung

`supabase/functions/_shared/v471-mouth-roi.ts` (PURE):

1. **Landmark first** — `preclip_geometry_mouth_source === "landmark"` →
   persistierter signed Offset wird unverändert benutzt.
2. **Face-Ratio-Fallback** — sonst wird der Mund aus der getrackten Face-Box mit
   `V471_FACE_MOUTH_Y_RATIO = 0.88` neu abgeleitet (x bleibt pose-aware aus dem
   signed Offset, weil die Edit-Karte x bestätigt hat).
3. **Engeres Band** — `0.53 × faceSide` breit, `0.23 × faceSide` hoch
   (≈ 0.28 × 0.12 bei `face_share ≈ 0.277`).
4. **Nie raten** — unauflösbare Geometrie ⇒ `mouth_roi_unresolved`
   (→ `motion_unverified`), niemals ein False-NOOP.

`v456-roi-contract.ts` adoptiert diese ROI als **die** Autorität, sobald ein Pass
`preclip_crop` **und** `preclip_from_bbox` trägt. Legacy-Pässe ohne Face-Box
behalten bit-identisch das frozen V434/V404-Verhalten. `sync-so-webhook` reicht
`crop` + `mouthSource` durch und loggt `v471_anchor` / `v471_roi` / `v471_reason`.

## Abnahme

### Re-Score der eingefrorenen Artefakte (Produktions-Still-Pfad, N=6)

| Fall | prod-ROI | V471-ROI | cy prod → V471 |
|---|---|---|---|
| **P1** (Produktion NOOP 1.817) | 1.812 **NOOP** | **2.338 INDETERMINATE** | 0.543 → 0.608 |
| **P2** (Produktion MOVED) | 2.934 MOVED | **4.220 MOVED** | 0.548 → 0.613 |
| COH00–COH27 (28 Frozen-Fälle) | unverändert | **bit-identisch** | 0.600 → 0.600 |

Gesamt (n = 29 gelabelte Fälle): **AUC 0.981 → 0.981**, False-NOOP 0 → 0,
False-Green 1 → 1 (COH21, unverändert aus V465-B1 bekannt).

Die Frozen-Kohorte besitzt keine persistierte Face-Box, V471 ist dort per
Konstruktion ein No-op — also **keine Regression**, während der einzige belegte
False-NOOP (P1) korrigiert wird.

### Regressionssuite

`supabase/functions/_shared/v471-mouth-roi.test.ts` — 8 Tests
(Re-Anchoring auf cy ≈ 0.61, Bandverengung, Landmark-Vorrang, pose-aware x,
fünf unauflösbare Geometrien, Ratio-Konstante, Contract-Adoption,
`mouth_roi_unresolved` statt NOOP) plus die 8 bestehenden V456-Tests: 16/16 grün.

Artefakte: `/tmp/v471/out_v471b.json`, Harness `/tmp/v471/v471b_rescore.py`.

## Nicht geändert

Dispatch-Geometrie, ASD-Boxen, Preclip-Crop, V465-Band (2.00 / 2.65),
V466-Grauband-Regel, Watchdog-Legacy-Pfad. Kein S01-Rerender in diesem Gate.
