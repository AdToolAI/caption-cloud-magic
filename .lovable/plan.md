

## Problem

The Facebook Page sync fails because Meta deprecated `page_impressions`, `page_post_engagements`, `page_total_actions`, `page_video_views`, and `page_fans` from the Page Insights API as of **November 15, 2025**. The API now returns error code 100: "The value must be a valid insights metric."

## Solution

Update the `facebook-page-sync` Edge Function to use the **new replacement metrics** introduced by Meta:

| Old (Deprecated) | New Replacement |
|---|---|
| `page_impressions` | `page_media_view` |
| `page_post_engagements` | *(removed — sum likes/comments/shares from posts)* |
| `page_total_actions` | *(removed — no direct replacement)* |
| `page_video_views` | `page_media_view` (includes video) |
| `page_fans` | `page_follows` (lifetime) |

## Changes

### 1. Update `supabase/functions/facebook-page-sync/index.ts`

- Replace the daily insights metric request:
  - Old: `page_impressions,page_post_engagements,page_total_actions,page_video_views`
  - New: `page_media_view` (period=day) — this is the unified "views" metric
- Replace the lifetime metric:
  - Old: `page_fans` (lifetime)
  - New: `page_follows` (day) — follower count
- Update metric parsing to match new metric names
- Keep the same DB columns but map new metrics to them (e.g., `page_media_view` → `impressions` column, `page_follows` → `fans_total` column)
- For `post_engagements` and `total_actions`: set to 0 or fetch from recent posts if needed (these metrics no longer exist at page level)

### 2. Update `fb_page_daily` table (migration)

- Optionally rename columns to better reflect new metrics, or keep existing columns for backward compatibility and just store the new data in them

## Technical Details

- The Graph API version stays at `v24.0` (supports new metrics)
- `page_media_view` with `period=day` replaces impressions
- `page_follows` with `period=day` gives follower snapshot
- Error handling remains the same

