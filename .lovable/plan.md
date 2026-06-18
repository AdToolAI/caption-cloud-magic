# v129.21.5 — MediaPipe uses prebuilt frame URL (skip broken Replicate extractor)

## Root cause (confirmed in edge logs)

The forensics result shows `MEDIAPIPE_MS=278` + `MEDIAPIPE_FACES=0` + `MEDIAPIPE_ERROR=frame_extract_failed_all`. That means v129.21.4 worked — MediaPipe is now actually being called instead of silently skipped. But every frame-extraction sub-call fails with:

```
WARN [mp-detect] frame extract t=1.17s failed:
Request to https://api.replicate.com/v1/models/lucataco/ffmpeg-extract-frame/predictions
failed with status 404 Not Found
```

The Replicate model `lucataco/ffmpeg-extract-frame` no longer exists (already documented in `_shared/face-frame-extract.ts` v129.14: "server_extractor_disabled — edge runtime cannot run ffmpeg.wasm — use client-side canvas extractor and pass probe_frame_url"). MediaPipe inherited the same broken extractor, so it can never get a PNG to detect on → 0 faces → silent fall-through to Gemini.

The Forensics Sheet already extracts a JPEG client-side via Canvas and passes it to `syncso-preflight` as `probe_frame_url` (line 542). MediaPipe just isn't using it.

## Fix

Thread the existing client-side JPEG into MediaPipe and bypass the broken Replicate frame-extract step entirely.

### 1. `supabase/functions/_shared/face-detect-mediapipe.ts`

Add an optional `prebuiltFrameUrls?: string[]` input. When provided:
- Skip `extractFrame()` (no Replicate call to `lucataco/ffmpeg-extract-frame`)
- Use the prebuilt URLs as `validFrames` directly
- Run `callMediaPipe(frameUrl, …)` on each — that path still works (MediaPipe model itself is fine)

When not provided, keep current behaviour (so other callers don't break) but also flip the legacy path off behind a feature flag — it has been broken for weeks; log a single warn line saying so.

### 2. `supabase/functions/syncso-preflight/index.ts`

In `probeFaceAtFrame`, when `prebuiltFrameUrl` is non-null, call:
```ts
detectFacesMediaPipe({
  videoUrl, plateWidth, plateHeight, durationSec,
  prebuiltFrameUrls: [prebuiltFrameUrl],
})
```
When `prebuiltFrameUrl` is null, set `mediapipeSkippedReason = "no_probe_frame_url"` immediately — don't waste three 404 round-trips to Replicate.

### 3. `src/components/admin/SyncsoForensicsSheet.tsx`

Bump version tag: `v129.21.5 · mediapipe uses canvas frame`. Show `MEDIAPIPE_SOURCE: prebuilt_frame` when set.

## Verification

After deploy, re-run Forensics on the same scene:
- Expected: `FACE PROBE: MEDIAPIPE`, `MEDIAPIPE_OK=true`, `MEDIAPIPE_FACES≥1`, `MEDIAPIPE_MS ≈ 800–2500ms` (single MediaPipe call on the already-extracted frame), no 404 log lines for `ffmpeg-extract-frame`.
- If MediaPipe truly finds 0 faces on the client-extracted frame (genuinely face-less): `gemini_fallback` with **both** ms values — no longer a silent skip.

## Out of scope
Dispatch, watchdog, retry/refund logic, new providers — unchanged.
