---
name: v356 Outcome-Based Lip-Sync Gate
description: Alle geometrischen Vorab-Blocker (144px Crop-Floor, 0.34 Side-Share, 120px Plate-Pixel-Vertrag) sind entfernt. Einziger verbindlicher Guard ist der Post-Run mouth-motion-verdict.
type: architecture
---

# v356 — Outcome-Based statt Geometry-Gating (2026-08-01)

## Beweislage
DB-verifizierter Erfolgsstand vom 2026-07-27 (`dialog_shots.status = done`):

```
scene 0f8818ee, 4 Sprecher: crop 128px → 720p, face-share 4.8 / 8.5 / 17.4 / 12.9 %
scene c01d339d, 4 Sprecher: crop 165–540px, share 15–21 %
```

Diese bestandenen Passes wären von **jedem** der Gates v344.1 / v353 / v355
abgelehnt worden. Die Gates waren aus einer einzelnen fehlgeschlagenen Szene
(7c11bc27) verallgemeinert.

## Regel
- **Kein geometrischer Pre-Dispatch-Block.** Nicht in `pass-face-preclip.ts`,
  nicht in `compose-dialog-segments`, nicht in `compose-video-clips`.
- `MIN_NATIVE_CROP_PX` und `FACE_SIDE_SHARE_FLOOR` dürfen nicht zurückkehren
  (Regressionstests erzwingen das).
- Crop-Geometrie: `minSize: 128`, `targetFaceShare: 0.42`, `outputSize: 720`.
- `assertPlateFaceContract` bleibt als Funktion bestehen, wird aber nur noch
  geloggt (`v356_plate_geometry_telemetry`), nie zum Abbruch verwendet.
- Der Anchor-Ratio-Check in `compose-video-clips` bleibt reiner Framing-Hebel.

## Einziger Guard
`_shared/mouth-motion-verdict.ts` vergleicht Provider-Output gegen Input
NACH dem Lauf. Passthrough → kein Mux, voller Refund. Das misst, was der
Kunde sieht, statt vorherzusagen, was der Provider kann.

## Tests
- `_shared/lipsync-noop-policy.test.ts`
- `_shared/closeup-contract.test.ts`
