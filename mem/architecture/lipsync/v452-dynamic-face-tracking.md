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
