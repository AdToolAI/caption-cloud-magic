---
name: v452 Dynamische Gesichtsverfolgung im Preclip + Reprojektion
description: Bewegter Crop-Pfad (Kamerafahrt) für Preclip und Mux-Reprojektion; Identität bleibt statisch, Größe bleibt beim eingefrorenen Static-Crop, Pfad ist Teil der Preclip-Signatur und des Frozen Wire
type: architecture
---

# v452 — Dynamic Face Tracking im aktuellen V450+-Pfad

## Invarianten (nicht verhandelbar)
1. **Identität ist statisch.** Getrackt wird ausschließlich die per Assignment-Lock
   zugewiesene Box (`trackAssignedFaceAcrossTurn`, IoU + Sibling-Veto).
   Unauflösbare Samples werden interpoliert, nie neu identifiziert.
2. **Größe bleibt beim Static-Crop.** Der Pfad verschiebt nur das Fenster
   (`buildDynamicCameraPath` übernimmt `staticCrop.size` wörtlich).
3. **Ein Pfad, zwei Verbraucher.** `DialogTurnFaceCropVideo` (Preclip) und
   `DialogStitchVideo.CroppedOverlay` (T13-Reprojektion) samplen dieselbe reine
   Funktion (`sampleCameraPath` / `cameraPathRuntime.ts`).
4. **Pfad ist Teil der Preclip-Signatur** (`cp=<signature>`) → kein Reuse eines
   Preclips mit anderer Geometrie.
5. **Frozen Wire (V450) gewinnt.** NOOP-Retry und beweisgebundene Recovery
   verwenden `_v450_frozen_camera_path` wörtlich; es wird nie neu getrackt.
6. **Fail-soft.** Tracking-Fehler, leere Samples oder unbewegte Spur →
   `moving=false` → verhalten identisch zum bisherigen fixen Crop.
7. **Kein Eingriff in v404.** `preclip_mouth_roi_samples` ist reine Telemetrie;
   Schwellen, ROI und NOOP-Leiter des Verdikts bleiben unverändert.

## Dateien
- `supabase/functions/_shared/dynamic-camera-path.ts` (pur)
- `supabase/functions/_shared/plate-face-track.ts` (Remotion-Stills + Rekognition, AWS-only per v347)
- `src/lib/composer/cameraPathRuntime.ts` (Frontend-Spiegel)
- `src/remotion/templates/DialogTurnFaceCropVideo.tsx`, `DialogStitchVideo.tsx`
- Verdrahtung: `compose-dialog-segments`, `render-sync-segments-audio-mux`
- Test: `src/lib/composer/__tests__/v452DynamicFaceTracking.test.ts`

## Persistierte Felder am Pass
`preclip_camera_path`, `preclip_camera_path_sig`, `preclip_camera_path_dynamic`,
`_v450_frozen_camera_path`, `preclip_mouth_roi_samples`.

## Deploy-Hinweis
Änderungen an den Remotion-Templates wirken erst nach erneutem Bundle-Deploy
(`scripts/deploy-remotion-bundle.sh`).


## V452 Reconciliation (verbindlich)

- **Planer**: `planCameraPath` (v359, `_shared/camera-path.ts`) ist der AUTORITATIVE
  Bewegungsplaner. `dynamic-camera-path.ts` ist nur noch ein Adapter: bounded
  Rekognition-Samples werden deterministisch auf eine Per-Frame-Boxserie (30 fps,
  lineare Interpolation zwischen gemessenen Samples, Halten an den Rändern)
  verdichtet, der Planer liefert die Trajektorie, danach wird die Trajektorie mit
  der EINGEFRORENEN Crop-Größe neu gefenstert (v359-Konstant-Zoom würde die Größe
  ändern und V445/V450 verletzen). Es existiert KEIN zweites Glättungssystem mehr.
- **Statische Äquivalenz**: Liegt der Travel unter `STATIC_TRAVEL_EPSILON`, wird
  exakt der eingefrorene Static-Crop zurückgegeben (`reason=static_equivalent`) —
  niemals eine mundabgeleitete Alternative.
- **Ein Prädikat**: `shouldUseCameraPath` (Edge) und `isDynamicPathRuntime`
  (Runtime-Spiegel) entscheiden identisch (`moving===true` + >1 Keyframe +
  Signatur). Preclip-Render, Mux und T13-Overlay nutzen ausschließlich dieses
  Prädikat — sonst beide den statischen Crop.
- **Identität**: `pickAssignedFace` hat zusätzlich ein Ambiguitäts-/Kreuzungs-Veto
  (zwei fast gleich plausible Kandidaten ⇒ `null`, kein Wechsel).
- **Metrik**: v404-Schwellen, Klassifizierer und NOOP-Leiter unverändert;
  Mundgeometrie bleibt reine Telemetrie.
