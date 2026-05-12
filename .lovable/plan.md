# Fix: New avatars show uploaded image instead of generated portrait

## Root Cause

`generate-avatar-portrait` successfully generates the clean studio portrait via Gemini, uploads it, but the final DB update fails with:

```
new row for relation "brand_characters" violates check constraint "brand_characters_portrait_mode_check"
```

The current constraint only allows `'original' | 'auto_generated' | 'manual_upload'`. Stage 22 introduced the new value `'auto_default_outfit'` in code (and types) but never extended the check constraint.

Result: the generated portrait is uploaded to storage, but `portrait_url` / `portrait_mode` are never written → `BrandCharacterCard` falls back to `reference_image_url` (the raw upload).

## Fix

### 1. DB migration
Drop and recreate the constraint to include `auto_default_outfit`:

```sql
ALTER TABLE public.brand_characters
  DROP CONSTRAINT IF EXISTS brand_characters_portrait_mode_check;

ALTER TABLE public.brand_characters
  ADD CONSTRAINT brand_characters_portrait_mode_check
  CHECK (portrait_mode = ANY (ARRAY[
    'original','auto_generated','manual_upload','auto_default_outfit'
  ]));
```

### 2. Backfill existing avatars
The user's existing avatar (Matthew Dusatko) currently has no clean portrait because every prior generation attempt failed silently on the constraint. After the migration, the existing "Generate studio portraits" bulk button on `/brand-characters` will now actually persist the result.

No code changes needed — only the migration. Edge function, hooks and UI are already correct.

## Validation

1. Apply migration.
2. On `/brand-characters` click "Generate studio portraits" → Matthew gets a new clean grey-tee portrait.
3. Add a new avatar → after upload the card shows the auto-generated default-outfit portrait, not the raw selfie.
4. Edge function logs show `success`, no more `check constraint` error.
