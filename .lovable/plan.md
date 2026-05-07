## Problem

Talking-Head generation fails with:
```
HEYGEN_AVATAR_LIMIT: {"code":401028,"message":"You have exceeded your limit of 3 photo avatars. Please upgrade for more."}
```

The function already tries to auto-prune old uploaded photos before each upload, but the log shows:
```
prune: 0 custom, deleting 0
```

…and the upload still fails. So our prune call lists the wrong resource: `/v1/talking_photo.list` returns HeyGen's sample/preset library (filtered out by `is_preset`), **not** the user's uploaded photo avatars that actually count against the 3-avatar quota.

## Fix (single edge function, no DB changes)

Edit `supabase/functions/generate-talking-head/index.ts` → `pruneHeyGenTalkingPhotos`:

1. Replace the listing source with HeyGen's photo-avatar endpoint that actually represents the quota:
   - `GET https://api.heygen.com/v2/photo_avatar/photo/list` (user-owned uploads)
   - Fallback: `GET https://api.heygen.com/v2/avatar.list` filtered to `avatar_type === 'photo'` if the first returns 404.
2. Delete via `DELETE https://api.heygen.com/v2/photo_avatar/{id}` (and fallback to `/v2/talking_photo/{id}` if 404).
3. Skip any item whose `id` matches `system_config.qa.heygen_talking_photo_id` (the cached QA preset) so we never delete it.
4. Keep `maxKeep = 0` behavior for normal calls; log how many were found + deleted so we can verify in logs.
5. If the upload still returns `401028` after a successful prune, surface a clearer user-facing error: *"HeyGen-Avatar-Kontingent voll — bitte kurz warten und erneut versuchen."* instead of the raw API string.

## Verification

1. Deploy `generate-talking-head`.
2. Retry "Talking-Head generieren" from the Motion Studio dialog with the same image + script.
3. Check edge logs: expect `prune: N custom, deleting N` with N ≥ 1, followed by a successful `talking_photo upload status=200`.
4. Confirm the dialog shows "Talking-Head wird generiert" toast instead of the red error.

## Out of scope

- No frontend, DB, or other edge-function changes.
- No change to credit refund logic (already handled).
- No change to the QA preset cached in `system_config.qa.heygen_talking_photo_id`.
