## Ziel

Mux/Overlay-Pfad exakt auf den v169-Zustand zurücksetzen, der nachweislich ohne sichtbare Kanten/Halos gerendert hat. Sync.so-Dispatch (v204 Preclip + clip-space bbox) bleibt unberührt.

## Was v169 anders gemacht hat (Baseline)

- **Active Overlay** (`CroppedOverlay`) und **Silent Slots** (`SilentFaceFreeze`) nutzten **identische, breite, symmetrische** Alpha-Feather-Masken über den gesamten Square-Crop — keine harten Kreisränder (55–63%), keine unterschiedlichen Profile für aktiv/silent.
- **Kein** `faceMask`-Pfad und **keine** Mouth-Mattes im Multi-Speaker-Fall — nur die einheitliche Square-Overlay-Route mit weichem Radial-Gradient.
- **Kein** Farb-/Helligkeits-Matching-Filter (der käme erst bei Tier 1 der A-Lösung dazu, ist hier explizit ausgeklammert).
- Bundle wurde nach jedem Mask-Change über `scripts/deploy-remotion-bundle.sh` neu deployed.

## Plan

### 1. `src/remotion/templates/DialogStitchVideo.tsx`

- **`CroppedOverlay`** (aktiver Sprecher-Overlay, `mode: 'crop'`):
  - Radial-Gradient-Maske zurücksetzen auf v169-Profil: `core ~30%` voll opak, weicher Fade bis `~78%`, danach transparent. Keine harte Kante bei 55–63%.
  - Kein `filter: brightness()/saturate()` auf dem inneren `<Video>`.
- **`SilentFaceFreeze`** (eingefrorene Nicht-Sprecher):
  - **Exakt dasselbe** Maskenprofil wie `CroppedOverlay` (identische Stops in %). Kein separates, schmaleres Profil.
- **`FaceMaskOverlay`** (Mouth-Mattes-Pfad):
  - Für den v169-Rollback im Multi-Speaker-Dialog **deaktiviert** — Mux übergibt keine `faceMask`/`mouthMattes` mehr (siehe §2). Code darf bleiben (Rückwärtskompatibilität), wird aber nicht mehr getriggert.
- **Version-Marker** im Template: `v205_mux_v169_parity` (nur Logging/Diag, keine Verhaltensverzweigung).

### 2. `supabase/functions/render-sync-segments-audio-mux/index.ts`

- **Overlay-Modus erzwingen**: Alle Shots werden mit `mode: 'crop'` + `preclip_crop` gebaut, exakt wie v163/v164/v165. Kein Fallback auf `faceMask`, kein `mouthMattes`-Feld.
- **Silent-Slots**: unverändert wie in v164/v165 (`v164SilentSlotsByExcludedIdx`), aber `shape/coreStopPct/fadeStartPct/fadeEndPct` werden **nicht** mehr per shot gesetzt — das Template nutzt die v169-Defaults.
- **Konstanten** (fürs Log/Telemetrie, nicht als Runtime-Tuning):
  - `OVERLAY_MASK_VERSION = "v169_parity"`
  - `COLOR_MATCH_ENABLED = false`
- **Telemetrie** in Mux-Row / Log:
  - `overlay_mask_version`, `crops_used`, `silent_slots_used`, `facemasks_used` (muss `0` sein), `color_match_enabled=false`.
- **Guard**: Wenn irgendein Shot ohne `preclip_crop` gebaut würde (also alter FaceMask-Pfad), hard-fail + Refund statt still auf FaceMask fallen — damit der v169-Pfad wirklich kanonisch ist.

### 3. Deploy & Verifikation

1. Edge-Function `render-sync-segments-audio-mux` deployen.
2. Remotion-Bundle via `scripts/deploy-remotion-bundle.sh` neu deployen (Pflicht, sonst greift der Template-Change nicht).
3. Eine bekannte Multi-Speaker-Szene neu muxen und prüfen:
   - Mux-Log zeigt `overlay_mask_version=v169_parity`, `crops_used>=N-1`, `facemasks_used=0`.
   - Sync.so-Dispatch-Log unverändert `canonical_lipsync_pipeline=v204_preclip_bbox_clipspace`.
   - Visuell: keine sichtbaren Ovale/Umrandungen mehr um Sprecher; Silent-Freeze-Slots pixelgleich zum Master-Plate.

## Explizit NICHT angefasst

- Sync.so-Dispatch, Preclip-Render, Anchor/Cast-Resolution, ID-Resolution (v201), Silent-Faces-Prinzip.
- Refund-/Watchdog-Pfade.
- Kein Poisson-Blending, keine Landmark-Segmentation, kein Color-Match — kommt erst nach Kundenfeedback (B/C später).

## Erwartetes Ergebnis

Multi-Speaker-Dialoge sehen wieder aus wie unter v169: keine sichtbaren Kanten oder Halos um aktive/passive Sprecher, während der v204-Dispatchpfad (Preclip + clip-space bbox, `generation_input_face_selection_invalid`-frei) erhalten bleibt.
