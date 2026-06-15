---
name: v123 — Stale Preclip Invalidation on Coords Refresh
description: ADVANCE COORDS REFRESH (v87) must also clear preclip_url/preclip_crop/status of the affected pass; v122 drift guard now fires regardless of whether bboxForCrop was set
type: architecture
---

# Symptom
Multi-Speaker-Dialog: nur der zuletzt gerenderte Sprecher animiert die Lippen, die anderen zeigen ein verpixeltes Hintergrund-Overlay (z. B. eine Pflanze) anstelle des Mundes.

# Root Cause
`v87 ADVANCE COORDS REFRESH` (`supabase/functions/compose-dialog-segments/index.ts`) hat `p.coords` aktualisiert, sobald `identity`-Quelle bessere Koordinaten lieferte — **aber** den bereits gerenderten Preclip (`preclip_url`, `preclip_crop`, `preclip_render_id`, `output_url`, `status`) nicht invalidiert. Folge: Sync.so animierte den alten Crop, audio-mux pasted ihn an die alte Bildposition → falsche Region.

Verifiziert an Scene `785168d1-066e-440f-9a1f-850d29080e55`: nur Pass 3 (Sarah) wurde nach dem Refresh frisch gerendert, Passes 0–2 behielten Crops mit Drift bis 270 px gegenüber neuen Coords.

Zusätzlich: `v122 coordsInsideCrop` Re-Render-Guard fiel im Verzweigungs-Gate `&& bboxForCrop` durch, wenn der ursprüngliche Crop bereits coords-zentriert war oder coords sich nach dem Preclip-Bake noch änderten.

# Fix
1. `v87`-Block (~Z. 1989): bei `changed === true` zuerst alle preclip-/render-Felder nullen, ggf. `status='pending'`, dann `coords` setzen und neu loggen mit Tag `v123 ADVANCE COORDS REFRESH + PRECLIP INVALIDATE`.
2. `v122`-Guard (~Z. 2551): `&& bboxForCrop` entfernt — jeder Drift > 35 % löst Re-Render mit `bbox=null` aus.

# Frozen Invariant
Jede Änderung an `p.coords` MUSS die preclip-Felder desselben Passes nullen. Wer `coords` mutiert, ist dafür verantwortlich.

# Files
- `supabase/functions/compose-dialog-segments/index.ts`
