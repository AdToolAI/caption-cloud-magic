

# Fix: Instagram Sync – IG User ID Resolution

## Problem
The `instagram-graph-sync` function tries to call `/{pageId}?fields=connected_instagram_account` to discover the Instagram User ID. But in `social_connections`, the `account_id` for Instagram is **already the IG User ID** (`17841477402452109`), not a Facebook Page ID. The Graph API returns an error because `connected_instagram_account` is not a valid field on an IG User node.

## Fix
In `supabase/functions/instagram-graph-sync/index.ts`, change the IG User ID resolution logic:

1. **Use `account_id` directly** as the IG User ID (since it's already stored correctly)
2. **Remove** the `connected_instagram_account` Graph API call entirely
3. Keep the `metadata?.ig_user_id` as a secondary fallback

Replace lines 58-77 with:
```typescript
// The account_id for Instagram connections IS the IG User ID
const metadata = conn.account_metadata as any;
const igUserId = metadata?.ig_user_id || conn.account_id;
if (!igUserId) throw new Error('No Instagram User ID found. Please reconnect Instagram.');
console.log(`[IG Sync] IG User ID: ${igUserId}`);
```

## Technical Details
- File: `supabase/functions/instagram-graph-sync/index.ts`
- Lines 58-77 replaced with simplified direct ID usage
- No database changes needed

