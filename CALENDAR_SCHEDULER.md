# Calendar Scheduler - Automated Publishing System

## Overview

The Calendar Scheduler extends the existing content calendar with **automated publishing capabilities**, enabling scheduled posts to be published automatically across multiple platforms (Instagram, TikTok, Facebook, X, LinkedIn, YouTube).

## Features

### ✅ Automated Publishing
- Events with `status='scheduled'` are automatically published at their scheduled time
- Multi-platform support: Publish to multiple channels simultaneously
- Real-time status updates and progress tracking

### ✅ Retry Logic with Exponential Backoff
- Failed publishes are automatically retried up to 5 times
- Smart backoff: 1min → 5min → 15min → 60min → 240min
- Detailed error logging and tracking

### ✅ Platform-Specific Validation
- Caption length validation (Instagram: 2200, X: 280, etc.)
- Hashtag count limits per platform
- Media count and aspect ratio validation
- Rate limiting checks (posts per hour per platform)

### ✅ Publishing Queue Dashboard
- Real-time view of publishing tasks
- Per-platform success/failure indicators
- Detailed logs with timestamps
- Manual retry for failed events
- Direct links to published posts

### ✅ Locking Mechanism
- Prevents duplicate publishes
- Concurrent execution safety
- Automatic lock release after processing

---

## Architecture

### Database Schema

#### Extended `calendar_events` Table
```sql
-- New columns for publishing automation
publish_results JSONB       -- Per-platform results {instagram: {ok, external_id, permalink}}
error JSONB                 -- Last error details
attempt_no INTEGER          -- Number of publish attempts (0-5)
locked_by TEXT             -- Lock identifier ('dispatcher')
locked_at TIMESTAMPTZ      -- Lock timestamp
next_retry_at TIMESTAMPTZ  -- Scheduled retry time
published_at TIMESTAMPTZ   -- Actual publish timestamp

-- New status values
status: 'scheduled' | 'queued' | 'published' | 'failed'
```

#### New `calendar_publish_logs` Table
```sql
id UUID
event_id UUID              -- FK to calendar_events
workspace_id UUID          -- FK to workspaces
at TIMESTAMPTZ            -- Log timestamp
level TEXT                -- 'info' | 'warn' | 'error'
message TEXT              -- Human-readable log message
meta JSONB                -- Additional context (results, errors, etc.)
```

#### New `platform_limits` Table
```sql
platform TEXT             -- 'instagram', 'tiktok', etc.
max_caption_length INT
max_hashtags INT
max_media_count INT
supported_ratios TEXT[]   -- ['1:1', '4:5', '9:16', '16:9']
rate_limit_per_hour INT
config JSONB             -- Additional platform-specific settings
```

### Edge Functions

#### 1. `calendar-publish-dispatcher` (Cron)
**Trigger:** Every minute via pg_cron  
**Purpose:** Find and publish scheduled events

**Logic:**
1. Query events with `status IN ('scheduled', 'failed')` AND `start_at <= now()`
2. Acquire lock atomically
3. Set status to `queued`
4. Call `publish` function for each platform
5. Update status to `published` (all succeeded) or `failed` (any failed)
6. Calculate next retry time with exponential backoff
7. Write detailed logs
8. Release lock

#### 2. `calendar-validate`
**Purpose:** Validate events against platform limits

**Input:**
```json
{
  "caption": "...",
  "platforms": ["instagram", "tiktok"],
  "media": [{"type": "image", "ratio": "1:1"}],
  "workspace_id": "uuid",
  "scheduled_at": "2025-01-15T10:00:00Z"
}
```

**Output:**
```json
{
  "ok": true,
  "warnings": ["Instagram: Close to hashtag limit (28/30)"],
  "errors": [],
  "platform_results": {
    "instagram": {
      "caption_ok": true,
      "media_ok": true,
      "rate_limit_ok": false,
      "issues": ["Rate limit reached: 25/25 posts/hour"]
    }
  }
}
```

#### 3. Extended `publish` Function
The existing `publish` function now accepts:
- `calendar_event_id` (optional): Links publish results to calendar event
- Updates `calendar_events.publish_results` after publish
- Writes to `calendar_publish_logs`

---

## Cron Job Setup

### Method 1: Supabase Dashboard (Recommended)
1. Go to **Database** → **Extensions**
2. Enable `pg_cron` extension
3. Run SQL:
```sql
SELECT cron.schedule(
  'calendar-publish-dispatcher',
  '* * * * *', -- every minute
  $$
  SELECT net.http_post(
    url := 'https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/calendar-publish-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

### Method 2: External Cron Service
Use services like:
- **Render Cron Jobs** (free tier available)
- **GitHub Actions** (scheduled workflows)
- **Vercel Cron** (for Next.js apps)

Example GitHub Action (`.github/workflows/calendar-dispatcher.yml`):
```yaml
name: Calendar Publisher
on:
  schedule:
    - cron: '* * * * *'  # every minute
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Dispatcher
        run: |
          curl -X POST \
            https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/calendar-publish-dispatcher \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"
```

---

## Usage

### 1. Create a Scheduled Event
```typescript
const { data, error } = await supabase
  .from('calendar_events')
  .insert({
    workspace_id: 'workspace-uuid',
    title: 'Product Launch Post',
    caption: 'Exciting news! 🚀 #launch #product',
    channels: ['instagram', 'tiktok', 'facebook'],
    status: 'scheduled',
    start_at: '2025-01-15T10:00:00Z',
    timezone: 'Europe/Berlin',
    assets_json: [
      { 
        type: 'image', 
        url: 'https://...', 
        mime: 'image/jpeg',
        size: 1024000
      }
    ]
  });
```

### 2. Validate Before Scheduling
```typescript
const { data: validation } = await supabase.functions.invoke(
  'calendar-validate',
  {
    body: {
      caption: event.caption,
      platforms: event.channels,
      media: event.assets_json,
      workspace_id: event.workspace_id,
      scheduled_at: event.start_at,
    }
  }
);

if (!validation.ok) {
  console.error('Validation errors:', validation.errors);
  console.warn('Warnings:', validation.warnings);
}
```

### 3. Monitor Publishing Queue
The `PublishingStatusPanel` component automatically displays:
- Active publishing tasks (`queued` status)
- Failed tasks with retry information
- Detailed logs per event
- Per-platform publish results
- Direct links to published posts

### 4. Manual Retry
```typescript
const { error } = await supabase
  .from('calendar_events')
  .update({
    status: 'scheduled',
    attempt_no: 0,
    next_retry_at: null,
    locked_by: null,
  })
  .eq('id', eventId);
```

---

## Status Flow

```
draft → scheduled → queued → published
                  ↓
                failed → (retry after backoff) → scheduled
                     ↓ (after 5 attempts)
                  failed (manual intervention required)
```

---

## Platform Limits Reference

| Platform | Caption Length | Hashtags | Media Count | Supported Ratios | Rate Limit |
|----------|----------------|----------|-------------|------------------|------------|
| Instagram | 2,200 | 30 | 10 | 1:1, 4:5, 9:16, 16:9 | 25/hour |
| TikTok | 2,200 | 30 | 1 | 9:16 | 10/hour |
| Facebook | 63,206 | 100 | 10 | 1:1, 4:5, 16:9 | 50/hour |
| X (Twitter) | 280 | 30 | 4 | 1:1, 16:9 | 50/hour |
| LinkedIn | 3,000 | 30 | 9 | 1:1, 16:9 | 20/hour |
| YouTube Shorts | 100 | 30 | 1 | 9:16 | 10/hour |

---

## Monitoring & Debugging

### View Dispatcher Logs
```typescript
const { data: logs } = await supabase
  .from('calendar_publish_logs')
  .select('*')
  .eq('workspace_id', workspaceId)
  .order('at', { ascending: false })
  .limit(100);
```

### Check Locked Events
```sql
SELECT * FROM calendar_events 
WHERE locked_by IS NOT NULL 
AND locked_at < now() - INTERVAL '5 minutes';
-- These might be stuck and need manual unlock
```

### Release Stuck Locks
```sql
UPDATE calendar_events 
SET locked_by = NULL, locked_at = NULL 
WHERE locked_at < now() - INTERVAL '10 minutes';
```

---

## Security Considerations

- ✅ **RLS Policies:** All tables have workspace-based RLS
- ✅ **Locking:** Prevents race conditions in concurrent execution
- ✅ **Service Role:** Dispatcher uses service role key (never exposed to client)
- ✅ **Validation:** Double validation (client + server)
- ✅ **Rate Limiting:** Per-platform hourly limits enforced

---

## Future Enhancements

### Planned Features (Not Yet Implemented)
- [ ] **Recurring Posts:** Series/repeat scheduling (e.g., "every Monday at 10 AM")
- [ ] **Content Slots:** Define prime-times per platform with auto-suggest
- [ ] **Bulk Operations:** Shift multiple events, batch status changes
- [ ] **AI-Assisted Scheduling:** Optimal time suggestions based on analytics
- [ ] **CSV/ICS Import:** Bulk import from external calendars
- [ ] **Approval Workflow:** Multi-step review before publishing
- [ ] **A/B Testing:** Schedule variants for testing

---

## Troubleshooting

### Events Not Publishing
1. Check cron job is running: `SELECT * FROM cron.job;`
2. Verify event status: `SELECT * FROM calendar_events WHERE status = 'scheduled' AND start_at <= now();`
3. Check logs: `SELECT * FROM calendar_publish_logs WHERE level = 'error';`
4. Ensure publish function is deployed
5. Verify platform credentials are configured

### High Failure Rate
1. Check platform API limits
2. Review error messages in `calendar_publish_logs`
3. Validate media file sizes and formats
4. Check caption lengths and hashtags
5. Verify rate limits aren't exceeded

### Stuck in Queued Status
1. Check if dispatcher is running
2. Look for locks older than 10 minutes
3. Review dispatcher logs
4. Check for errors in publish function

---

## API Reference

### Supabase Functions

#### `POST /calendar-publish-dispatcher`
Triggers the publishing dispatcher (called by cron).
- **Auth:** Service role
- **Body:** `{}`
- **Response:** `{ processed: number, succeeded: number, failed: number }`

#### `POST /calendar-validate`
Validates event against platform limits.
- **Auth:** User session
- **Body:** `{ caption, platforms, media, workspace_id, scheduled_at }`
- **Response:** `ValidationResult` (see above)

---

## Support

For issues or questions:
1. Check logs in Publishing Status Panel
2. Review error messages in event details
3. Consult this documentation
4. Check platform-specific API documentation

---

**Version:** 1.0.0  
**Last Updated:** 2025-01-15
