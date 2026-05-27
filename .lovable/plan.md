Do I know what the issue is? Yes.

The hosted backend is healthy. The current render rows show the real problem: `render-with-remotion` creates `video_renders` rows like `pending-...`, Lambda accepts the async invocation with HTTP 202, but no `remotion-webhook` request arrives and `real_remotion_render_id` stays empty. Because the frontend now only polls the database row, it keeps seeing `status='rendering'` forever instead of forcing reconciliation or failure.

## Plan

1. **Clean up the stuck renders now**
   - Mark the currently stuck Universal Creator `video_renders` rows as `failed` with a clear timeout/start-failure message.
   - Refund credits idempotently so the same failed row cannot refund twice.
   - Leave unrelated active render types, like the very recent dialog-stitch row, untouched unless they are stale and clearly orphaned.

2. **Make `render-with-remotion` non-sticky**
   - Store reliable tracking metadata on every render row: `lambda_invoked_at`, `tracking_mode`, `bucket_name`, `out_name`, `credits_used`, and an idempotent refund marker.
   - Explicitly pass `bucketName` and deterministic `outName` into the Remotion Lambda payload instead of leaving `bucketName: null`.
   - Keep the quick return behavior, but treat “Lambda accepted” only as “start requested”, not proof that Remotion is actually rendering.

3. **Make progress polling authoritative again**
   - Change the Universal Creator polling to call `check-remotion-progress` for active render IDs instead of only reading `video_renders`.
   - Use the function response to update UI progress, completed URL, or failure message.
   - Keep realtime as a fast path, but polling must be able to recover a completed S3 output or fail/refund a dead job.

4. **Harden `check-remotion-progress`**
   - For Universal Creator rows with no real Remotion render ID, no progress file, and no webhook after a short grace period, mark them failed with “Render konnte nicht gestartet werden”.
   - Keep a hard timeout around 6 minutes for short Universal Creator renders and persist the failure in the database.
   - Refund credits only once using the stored refund marker.

5. **Improve the UI state**
   - Add per-job `startedAt` tracking so the timeout cannot reset on rerender/reload.
   - Replace the endless “Rendering läuft…” message with progress from the backend and a visible failure state when the backend marks the render failed.
   - Unlock the render button after all jobs complete or fail.

6. **Deploy and validate**
   - Deploy `render-with-remotion` and `check-remotion-progress` after changes.
   - Verify logs show new render rows receiving tracking metadata.
   - Verify a stuck render becomes `failed` with refunded credits instead of spinning indefinitely.
   - Verify a successful render becomes `completed` with a download URL via webhook or S3 reconciliation.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>