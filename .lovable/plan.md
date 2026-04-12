

## Fix: Seedance 2.0 Duration-Limit

### Problem
Replicate's `bytedance/seedance-1-lite` model rejects `duration > 12`:
```
input.duration: Must be less than or equal to 12
```
The config in `src/config/seedanceVideoCredits.ts` sets `maxDuration: 15`, so users can select 15s which then fails.

### Fix

**1. `src/config/seedanceVideoCredits.ts`** — Change `maxDuration` from `15` to `12` for both Standard and Pro models.

**2. `src/pages/SeedanceVideoStudio.tsx`** — Ensure the duration slider respects the model's `maxDuration` (it likely already reads from config, but verify the slider max matches).

No Edge Function changes needed — the input is already passed through correctly; the issue is that the UI allows an invalid value.

### Dateien
- `src/config/seedanceVideoCredits.ts` — `maxDuration: 15` → `maxDuration: 12`
- `src/pages/SeedanceVideoStudio.tsx` — verify slider uses config max (minor fix if hardcoded)

