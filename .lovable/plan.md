

# Fix: Facebook "View Post" Button — Video ID from Wrong Response

## Root Cause
The Facebook Resumable Video Upload API works in 3 phases:
1. **Start** → returns `{ upload_session_id, video_id, ... }`
2. **Transfer** → uploads chunks
3. **Finish** → returns `{ success: true }` — **no `id` field!**

The current code reads `finishData.id` which is always `undefined`. The video ID must be captured from the **start** phase response (`initData.video_id`).

## Fix (1 file)

### `supabase/functions/publish/index.ts`

1. **Capture `video_id` from start phase** (~line 667):
   ```typescript
   const initData = await initResponse.json();
   const uploadSessionId = initData.upload_session_id;
   const videoId = initData.video_id; // ← ADD THIS
   ```

2. **Use `videoId` instead of `finishData.id`** for permalink fetch (~line 728-742):
   ```typescript
   // Use videoId from start phase, not finishData.id
   const permalinkRes = await fetch(
     `https://graph.facebook.com/v18.0/${videoId}?fields=permalink_url&access_token=${accessToken}`
   );
   ```

3. **Use `videoId` in fallback URL** (~line 740-742):
   ```typescript
   if (!videoPermalink && videoId) {
     videoPermalink = `https://www.facebook.com/${pageId}/videos/${videoId}`;
   }
   ```

4. **Use `videoId` in return** (~line 749-754):
   ```typescript
   return {
     provider: 'facebook',
     ok: true,
     external_id: videoId,
     permalink: videoPermalink,
   };
   ```

5. **Log with correct ID** (~line 744-747):
   ```typescript
   console.log('[Facebook] Video published', { 
     external_id: videoId, 
     permalink: videoPermalink 
   });
   ```

## Result
After this fix, the `publishToFacebook` video path will correctly capture the video ID and generate a working permalink, making the "View post" button appear in the UI.

