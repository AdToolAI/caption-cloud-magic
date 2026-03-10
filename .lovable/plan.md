

# r54b-hotfix: `VALID_TRANSITIONS is not defined`

## Problem
Line 1340 references `VALID_TRANSITIONS` but the constant is defined as `VALID_TRANSITION_TYPES` on line 28.

## Fix
Change line 1340 from `VALID_TRANSITIONS` to `VALID_TRANSITION_TYPES`. One-line fix, then redeploy.

### File
- `supabase/functions/auto-generate-universal-video/index.ts` — line 1340

