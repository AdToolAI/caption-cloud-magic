---
name: v342 Bbox-Derived Mouth Crop + Face-Share-Floor
description: Preclip crop must be face-tight even without detector mouth landmarks; hard 15% face-share floor before Sync.so dispatch
type: feature
---

**Root cause (Szene 69d56a49, 31.07.2026):** `pass-face-preclip.ts` nutzte den
mund-zentrierten Crop nur, wenn ein echter Detector-Mund-Landmark vorlag. AWS
Rekognition liefert auf Hailuo-Plates oft nur eine Face-Bbox. Folge: Fallback auf
`computeFaceCrop` → fixer ~394px-Crop um ein 60–100px-Gesicht → face_share ~3 %
→ Sync.so gibt den Clip unverändert zurück ("kein Lip-Sync").

**Regeln:**
1. Sobald eine valide Face-Bbox existiert, wird `computeMouthCenteredCrop`
   benutzt. Fehlt der Mund-Landmark, wird er aus dem unteren Drittel der Bbox
   abgeleitet (x = Mitte, y = y1 + 0.72 * h), Anchor-Tag `mouth_from_bbox`.
2. Harte Untergrenze: finaler `faceShareInCrop` < 0.15 → Pass wird mit
   `preclip_face_share_too_low:*` abgebrochen, kein Dispatch, Refund durch den
   Caller. Die Share wird gegen den FINALEN Crop (nach Expansion-Retries)
   gerechnet, nicht gegen crop0.
3. Telemetrie in `syncso_dispatch_log.meta`: `preclip_anchor`,
   `preclip_face_share`, `preclip_crop_to_face_ratio` (Soll ≈ 1.5).

Kein Rückgriff auf die v334–v341-Geometrie-Tracker.
