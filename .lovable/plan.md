# Plan: Echte v169-Parity — Silent-Layer abschalten

## Root Cause (Neuanalyse)

v169 hatte weder Halos noch Morphs — nicht wegen der Maskenform, sondern weil es die zusätzlichen Overlay-Layer schlicht nicht gab.

Was seit v169 dazukam und aktuell noch aktiv ist (auch nach v205):

1. **`SilentFaceFreeze`** (v197) — friert pro Non-Speaker einen Master-Plate-Crop ein und legt ihn über die animierende Master-Plate. Mit v169-weicher Maske: das statische Gesicht und das darunter atmende/wackelnde Master-Gesicht divergieren pro Frame → sichtbare **Morph/Wabbel-Effekte** an Rand und Nase.
2. **`SilentFaceAnchor`** (v183/v190) — statisches Portrait-Overlay auf Silent-Speakern.
3. **`MouthMatteFreeze`** (v193) — Mund-Matte-Freeze auf Non-Speakern.
4. **`FaceMaskOverlay`** — Mouth-Matte-Pfad (bereits durch v205-Guard blockiert).

In v169 war exakt eine Schicht aktiv: **`CroppedOverlay` (Sync.so-Output) über Master-Plate**, sonst nichts. Non-Speaker zeigten einfach das rohe Master-Plate-Video. Kein Freeze, kein Portrait, keine Matte → keine Divergenz → keine Morphs.

Der wahrgenommene Lip-Sync-Delay ist mit hoher Wahrscheinlichkeit derselbe Effekt: der Freeze-Layer verdeckt Teile des Mundbereichs des aktiven Sprechers bevor der Sync.so-Overlay einblendet, was als "verspätete Lippen" wirkt.

## Fix

### 1. `supabase/functions/render-sync-segments-audio-mux/index.ts`

- **`silentFaceFreezes` hart auf leer setzen** unter `OVERLAY_MASK_VERSION = "v169_parity"`. Der gesamte v195/v197-Block (Zeilen ~275–364) wird gated: Ergebnis ist immer `silentFaceFreezes = []`, unabhängig vom `system_config.composer.silent_anchor_v195`-Flag.
- Feature-Flag im Log dokumentieren: `silent_layers_disabled=true`.
- Ebenso `silentFaceAnchors`/`mouthMattes` (falls in inputProps aufgeführt) leer lassen — kein neuer Code, nur bestehende Feldzuweisungen ausnullen.
- Bestehender v205-Guard gegen `faceMask`-Fallback bleibt.

### 2. `src/remotion/templates/DialogStitchVideo.tsx`

- Keine Component-Removal, nur Render-Gate: Wenn `silentFaceFreezes` leer/undefined ist (Standard nach dem Edge-Function-Change), werden `SilentFaceFreeze`, `SilentFaceAnchor` und `MouthMatteFreeze` gar nicht erst gemountet. Das ist bereits so — es reicht, dass die Edge-Function die Arrays leer lässt. Kein Template-Change nötig.
- Sicherheits-Log am Composition-Mount: `console.log('[DialogStitch] v169_parity silent_layers_expected=empty')` — nur Diagnose.

### 3. Nicht angefasst

Sync.so-Dispatch (v204 preclip + clip-space bbox), Preclip-Render, Anchor/Cast-Resolution (v201), Refund/Watchdog, alle CroppedOverlay-Maskenprofile aus v205 (bleiben v169-weich). Kein Poisson-Blending, keine Landmark-Segmentation.

### 4. Deploy

1. Edge-Function `render-sync-segments-audio-mux` deployen (automatisch beim Speichern).
2. Remotion-Bundle über `scripts/deploy-remotion-bundle.sh` neu deployen (erforderlich für das Diagnostik-Log; die eigentliche Verhaltensänderung liegt in der Edge-Function).

## Verifikation

Mux-Log zeigt:
- `overlay_mask_version=v169_parity`
- `silent_slots_used=0`
- `facemasks_used=0`
- `silent_layers_disabled=true`
- `crops_used>=N-1`

Visuell:
- Kein Halo (v205-Weichmaske bleibt).
- Keine Morphs (kein Freeze-Layer mehr, der gegen die Master-Plate driftet).
- Lip-Sync-Timing wieder wie v169 (kein Freeze-Layer verdeckt den aktiven Mund).

## Risiko / Trade-off

Non-Speaker in Multi-Speaker-Szenen zeigen wieder die rohe Master-Plate. Auf Plates mit ausgeprägter Idle-Mundbewegung kann leichtes "Ghost-Mouthing" auf Non-Speakern sichtbar werden — genau das v169-Verhalten. Das war unter v169 offenbar akzeptabel, und die spätere professionelle Lösung (Landmark-Mund-Matte + Poisson) bleibt für die Feedback-Phase reserviert.

Falls das Ghost-Mouthing im Test stört, kann in einem separaten Schritt gezielt nur `SilentFaceFreeze` mit schmaler Ellipse unter dem Mundbereich reaktiviert werden — bewusst nicht Teil dieses Rollbacks.
