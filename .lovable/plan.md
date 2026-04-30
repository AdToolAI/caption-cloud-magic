I found the new failures from the latest Deep Sweep run and the root causes are now clear:

1. Flow 1 still fails with `Unauthorized`, but now the 401/500 comes from the downstream `compose-video-assemble` call, not from `compose-stitch-and-handoff`.
2. Flow 2 fails because the bootstrapped `test-video-2s.mp4` is not actually a playable MP4. The storage object is only 133 bytes and has `application/xml`, so Lambda/Remotion throws `MEDIA_ELEMENT_ERROR: Format error`.
3. Flow 6 fails because `render-long-form-video` calls `render-with-remotion` with a `sora_long_form_projects.id` as `project_id`; `render-with-remotion` validates `project_id` against `content_projects`, so it returns `404 Project not found`.
4. Flow 7 is skipped because `sample-mask-512.png` is missing. The bootstrap function only skips existing files and does not repair corrupt/missing required assets reliably.

Plan:

1. Fix Flow 1 auth propagation
   - Add the existing QA service-auth shortcut (`detectQaServiceAuth`) to `compose-video-assemble`.
   - Extend its CORS headers to allow `x-qa-real-spend` and `x-qa-user-id`.
   - In `compose-stitch-and-handoff`, when running as QA service-auth, forward the service-role auth and QA headers to `compose-video-assemble` instead of forwarding a token that downstream standard auth rejects.

2. Repair QA test asset bootstrapping
   - Update `qa-live-sweep-bootstrap` so it validates existing asset type/size before skipping.
   - If `test-video-2s.mp4` or `test-audio.mp3` is the current 133-byte XML error object, overwrite it with a valid known playable sample.
   - Ensure `sample-mask-512.png` is always created if missing.
   - Add clearer bootstrap response details so the UI/user can see which assets were repaired.

3. Make Deep Sweep use valid signed assets for render flows
   - Change `qa-weekly-deep-sweep` asset loading to prefer signed URLs and/or fallback public known-good video if the bucket asset is not valid.
   - Use the signed/validated video URL for Flow 1, Flow 2, and Flow 6 to avoid private/public bucket and malformed-object issues.
   - Keep Magic Edit using signed image/mask URLs.

4. Fix Flow 6 Long-Form render tracking
   - Change `render-long-form-video` so it does not pass the Sora long-form project id as `project_id` into `render-with-remotion` when that function expects `content_projects`.
   - Include a Long-Form-specific marker in the render metadata/customizations so the render can be tracked without failing the `content_projects` lookup.
   - Update Flow 6 polling to track the `video_renders` row returned by `render-with-remotion`, and optionally update the `sora_long_form_projects.final_video_url` when completed.
   - Keep the seeded project alive until polling finishes, then clean it up.

5. Add webhook support for Long-Form completion
   - Extend `remotion-webhook` to recognize a Long-Form source marker.
   - On success, update both `video_renders` and `sora_long_form_projects` (`status = completed`, `final_video_url`).
   - On failure, update `sora_long_form_projects` to `failed` and preserve the detailed error in `video_renders`.

6. Deploy and verify
   - Deploy the affected backend functions:
     - `compose-stitch-and-handoff`
     - `compose-video-assemble`
     - `qa-live-sweep-bootstrap`
     - `qa-weekly-deep-sweep`
     - `render-long-form-video`
     - `render-with-remotion` if needed for metadata passthrough
     - `remotion-webhook`
   - After deployment, rerun/trigger bootstrap so corrupt QA assets are repaired before the next Deep Sweep.

Expected result:
- Flow 1 should pass the auth handoff and proceed to render invocation.
- Flow 2 should no longer crash on an invalid 133-byte MP4.
- Flow 6 should no longer hit `Project not found` in the generic render function.
- Flow 7 should run once the mask is provisioned instead of being skipped.
- Hedra/Talking Head may remain `budget_skipped` until provider migration, which is expected.