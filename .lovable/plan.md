

## Fix: Seedance 2.0 Duration-Slider noch auf 15s

### Problem
Die Config wurde auf `maxDuration: 12` geändert, aber der Slider in `SeedanceVideoStudio.tsx` ist hardcoded auf `max={15}`. Deshalb können Nutzer weiterhin 15s auswählen, was Replicate ablehnt.

### Fix

**`src/pages/SeedanceVideoStudio.tsx`** — 3 Änderungen:

1. **Zeile 228**: `max={15}` → `max={selectedModelConfig.maxDuration}` (oder direkt `max={12}`)
2. **Zeile 234**: `<span>15s</span>` → `<span>{selectedModelConfig.maxDuration}s</span>`
3. **Edge Function Zeile 173**: `duration: Math.min(duration, 12)` als Sicherheitsnetz

### Dateien
- `src/pages/SeedanceVideoStudio.tsx` — Slider-Max und Label anpassen
- `supabase/functions/generate-seedance-video/index.ts` — Duration cappen

