# V458 — Mouth-ROI Vector Persistence + Non-Terminal ROI-Unresolved

Ziel: Der V456-ROI-Contract soll im ehemaligen Produktionsfall tatsächlich `resolved + authoritative` erreichen — nicht nur „nicht mehr rot". Zweiter Pfad bleibt das ehrliche Sicherheitsnetz ohne Fail/Refund/Retry.

## Beweiskette, die nach dem Fix nachvollziehbar sein muss

```text
finale V457-Crop-Geometrie
  -> Mund-Anker (plate px)
  -> signierter mouthOffsetXy (plate px, ungerundet)
  -> V456 ROI-Contract = authoritative
  -> Geometry-ROI autoritativ
  -> Server-Motion-Messung mit echtem Verdikt
```

Fallback-Pfad (unverändert non-terminal):

```text
kein vertrauenswürdiger Mundanker
  -> mouthOffsetXy = null
  -> mouth_roi_unresolved -> indeterminate
  -> motion_unverified (NICHT motion_verified)
  -> kein Fail, kein Refund, kein Retry, kein neuer Dispatch
```

## Änderungen

1. `supabase/functions/_shared/compute-mouth-centered-crop.ts` (+ Node-Mirror `src/lib/composer/computeMouthCenteredCrop.ts`)
   - Neu: `mouthOffsetXy = { dx, dy }` = `mouthPoint_plate − finalCropCenter_plate`, berechnet auf der FINALEN Geometrie (nach Projection/Clamp), **ungerundet** (Halb-Pixel bei ungeraden Crop-Größen bleiben erhalten).
   - `mouthOffsetXy = null` bei Anker `face_center`.
   - Neue Konstante/Feld `mouthOffsetSpace = "plate"` als Code-Invariante für den Koordinatenraum.
   - `mouthOffsetPx = round(hypot(dx, dy))` bleibt der skalare Legacy-Wert, abgeleitet aus demselben finalen Vektor (Skalar/Vektor-Kohärenz).

2. `supabase/functions/_shared/pass-face-preclip.ts`
   - Mundpunkt merken und Vektor/Skalar **nach** der Repair-Expansion + erneuter V457-Projektion auf der finalen Crop-Geometrie neu berechnen.
   - `mouthOffsetXy` in `PassPreclipResult` und in allen Return-Pfaden (Reuse-Hit und Frisch-Render) mitgeben.

3. `supabase/functions/compose-dialog-segments/index.ts`
   - Persistiert `preclip_mouth_offset_xy = { dx, dy }` (plate px) im Pass-JSONB neben dem bestehenden `preclip_mouth_offset_px`; Logzeile ergänzt.

4. `supabase/functions/sync-so-webhook/index.ts`
   - Passthrough-Bedingung eng erweitern: `indeterminate` + `v443MotionUnverified` + (`probe_infra_error` **oder** `mouth_roi_unresolved`). Kein anderer `measured_ambiguous`-Fall wird durchgelassen.
   - Telemetrie behält die Unterscheidung `failure_class: mouth_roi_unresolved` vs. `probe_infra_error`; Zustand bleibt `motion_unverified`.

5. `supabase/functions/lipsync-watchdog/index.ts`
   - Kandidaten mit `meta.failure_class === "mouth_roi_unresolved"` werden **nicht** neu gemessen (Geometrie ist statisch), sondern einmalig als `MOTION_RECHECKED` mit `recheck_skipped: roi_unresolved_structural` gebucht. Echte Infra-Fälle behalten das genau-einmal-Reprobe.

## Tests (müssen grün sein vor Deploy)

- Koordinatenraum-Invariante: gespeicherter Vektor ist Plate-Pixel; Consumer (`deriveMouthRoi`) normalisiert mit der Plate-Pixel-`cropSize` — Regressionstest, der einen skalierten Provider-/Preclip-Raum simuliert und beweist, dass der Vektor nicht ungeprüft als Preclip-Pixel benutzt wird.
- Halb-Pixel-Fall (`size = 153`) → `dx/dy` behalten `.5`, nur `mouthOffsetPx` wird gerundet.
- Produktionsfall `be60d106`: finale V457-Geometrie → Contract `authoritative`, `failedCheck = null`.
- `face_center`-Fallback → `mouthOffsetXy = null` → Contract `unresolved:mouth_offset_direction_unknown`.
- End-to-End: ROI-unresolved-Pass wird für Mux akzeptiert, ohne Refund, ohne Retry, ohne Provider-Dispatch; Telemetrie bleibt `motion_unverified` (nicht `motion_verified`).
- Watchdog: strukturell unresolved → kein Re-Measure; Infra → genau ein Re-Measure.

## Deploy & Stop

Nach grünen Tests genau: `compose-dialog-segments`, `sync-so-webhook`, `lipsync-watchdog`.
Danach STOP vor S01 — nur Revision/Health und Prüfung auf unerwartete Jobs/Dispatches. Der kontrollierte S01-Lauf erfolgt erst nach separater Freigabe.
