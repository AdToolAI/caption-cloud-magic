---
name: v164-silent-faces-overlay
description: Multi-Speaker Dialog stitches frieren während jedes aktiven Sprecher-Fensters die Münder aller anderen Sprecher mit `<Freeze frame={0}>` über den Master-Plate ein, damit nicht-aktive Charaktere nicht "mitreden"
type: feature
---

# v164 — Silent-Faces Overlay (Plate-Mouth-Mute für Nicht-Sprecher)

## Problem

v163 dispatcht Pass-Preclips/BBoxes korrekt an Sync.so, aber im finalen MP4 sah es so aus, als würde z.B. Samuel (Pass 1) sprechen, während Kailees (Pass 3) Audio läuft.

Root Cause: `render-sync-segments-audio-mux` legt nur die **aktive** Sprecher-Region per Preclip/FaceMask über den Master-Plate. Darunter läuft das originale AI-Plate-Video weiter — in dem **alle vier Gesichter** ihre natürlichen, ungesynchten Mund-Animationen aus der i2v-Generation behalten.

## Lösung

Für jedes Sprecher-Window legen wir auf jedes andere Gesicht ein eingefrorenes Master-Plate-Crop (`<Freeze frame={0}>`), sodass nur der aktive Sprecher animiert ist.

## Implementation

- **`render-sync-segments-audio-mux`** (`v164SilentSlotsByExcludedIdx`):
  - Sammelt einmalig alle gültigen `preclip_crop`-Boxen aus `donePasses` (gemappt auf `speaker_idx`).
  - Pro Shot wird `silentSlots: Array<{x,y,size}>` = alle Crops *außer* dem eigenen Sprecher angehängt.
  - Log: `v164_silent_slots speakers=N crops_available=K/N`.

- **`DialogStitchVideo.tsx`**:
  - Neues optionales Feld `silentSlots` im `ShotSchema`.
  - Neue `SilentFaceFreeze`-Komponente: `<Freeze frame={0}><Video src={masterVideoUrl} muted /></Freeze>` in einem cropped, mask-feathered Div.
  - In jeder `Sequence` werden silent slots **vor** dem aktiven Overlay gerendert (also darunter im Stack).
  - Funktioniert für alle drei Pfade: `faceMask`, `crop`, `FullFrameOverlay`.

## Wichtige Details

- Keine serverseitige Frame-Extraktion nötig — Remotion's `<Freeze>` macht das auf Lambda.
- `silentSlots` ist optional/nullable → alte Render-Jobs/Bundle ignorieren das Feld ohne Fehler.
- **Remotion-Bundle muss neu deployed werden** (`scripts/deploy-remotion-bundle.sh`), sonst rendert Lambda mit dem alten Bundle ohne die `SilentFaceFreeze`-Logik.
- Bei N=1-Szenen ist `silentSlots` leer (kein "anderer" Slot) → kein Effekt.

## Akzeptanzkriterien

- Logs zeigen `v164_silent_slots speakers=4 crops_available=4/4` und `shotSummary[i].silentSlots > 0`.
- Im finalen MP4 bewegt sich während Kailees Audio nur Kailees Mund; Samuel/Matthew/Sarah stehen still.
