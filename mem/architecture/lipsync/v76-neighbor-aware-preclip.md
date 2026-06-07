---
name: v76 Neighbor-Aware Single-Face Preclip
description: For 3–4 speaker dialog scenes the v69 single-face preclip used `safeH * 0.55` as crop floor, which on narrow group-shot plates (e.g. 768×1028 with 4 heads ~130 px apart) produced a 564 px crop that contained 2–3 faces. Sync.so's active speaker detection then animated the wrong face inside the crop, and at audio-mux time the large circular overlay (radius ~282 px) visually covered the other characters — symptom "Character 2 speaks the whole script alone". v76 adds a neighbor-aware cap to `computeFaceCrop` in `_shared/face-crop.ts`: when `siblingCoords` of the other passes are provided, the final crop edge is clamped to `max(160, 0.9 * minNeighborDistance)`. For N≥3 the bbox/no-bbox floor is also softened from `srcH * 0.55/0.6` to `srcH * 0.35/0.4` so the cap can actually bite. `pass-face-preclip.ts` and `compose-dialog-segments` pass the other passes' `coords` as `siblingCoords`. No changes to Sync.so model/mode, DialogStitchVideo overlay renderer, refunds, or pricing. v72/v74 static-anchor remains forbidden (v75 windowed moving master policy unchanged).
type: feature
---

**Trigger:** `passes.length >= 3` on the v69 unified preclip path. 1–2 speaker scenes get the cap too when faces happen to be close, but the floor stays at the historical `0.55/0.6` so behaviour is effectively unchanged.

**Verification:**
- New 4-speaker scene → `dialog_shots.passes[].preclip_crop.size` should be roughly `0.9 * neighborDistance` (typically 150–260 px on a 768-wide plate) instead of 564.
- Edge log `[compose-dialog-segments] … v69_preclip_unified dispatching … siblings=N` confirms siblings were passed in.
- Final mux: each character moves only the own mouth only in the own time window; no overlay swallows the others.

**Out of scope:**
- DialogStitchVideo `CroppedOverlay` feather mask, overlay z-order, hold-to-end — unchanged.
- v70 legacy removal, v69 unified-preclip routing — unchanged.
- Sync.so pricing / refund / `sync_mode` / model selection — unchanged.
