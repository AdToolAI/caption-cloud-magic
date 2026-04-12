

## Plan: Fix Kling 3.0 Duration Check Constraint

### Problem
The `ai_video_generations` table has a check constraint `ai_video_generations_duration_seconds_check` that only allows `duration_seconds IN (4, 8, 12)` -- these are Sora 2's fixed durations. Kling 3.0 needs 3-15 seconds (any integer), so inserts fail.

### Fix

**Database Migration**: Drop the old constraint and replace it with one that allows both Sora 2 and Kling durations:

```sql
ALTER TABLE ai_video_generations 
  DROP CONSTRAINT ai_video_generations_duration_seconds_check;

ALTER TABLE ai_video_generations 
  ADD CONSTRAINT ai_video_generations_duration_seconds_check 
  CHECK (duration_seconds >= 3 AND duration_seconds <= 180);
```

This allows 3-180 seconds, covering Kling's 3-15s range and future models with longer durations (Kling supports up to 180s in multi-shot mode).

No code changes needed -- the edge function and frontend are already correct.

