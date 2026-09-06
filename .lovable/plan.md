# Video Enhance — Read-only Audit (Topaz + ByteDance)

No code or configuration was changed. Every statement below is backed by a file read, a database query or a test run in this turn.

## Verdicts

| Engine | Verdict | Core evidence |
| --- | --- | --- |
| ByteDance vCube (`bytedance/video-upscaler` on Replicate) | **WORKING** | Run `3d45c717` (2026-09-06 14:24): source 1080x1920, ordered 4K, measured **2160x3840**, 21.2 Mbit/s, 45.3 MB, `projection_matched = true` |
| Topaz Video Upscale (`topazlabs/video-upscale` on Replicate) | **PARTIALLY WORKING** | Portrait clips never reach the ordered frame, and a tier below the source silently **downscales** — see run `4b35f46a`: 1080x1920 ordered at 720p, measured **408x720**, charged 0.22 EUR |

There are **zero failed runs** in production: `video_enhance_runs` holds 24 `completed` and 2 `provider_cancelled_confirmed`, no `provider_failed`, no `manual_review`, no `asset_persist_failed`. The perception "upscaling is not working" is therefore not an API failure — it comes from what is delivered and what the screen says about it.

## 1. Architecture as deployed

- One engine function `supabase/functions/video-enhance/index.ts` (541 lines), actions `estimate | start | status | cancel`.
- One shared registry/authority `supabase/functions/_shared/video-enhance-models.ts`; frame contract `_shared/video-enhance-frame.ts`; finalisation `_shared/video-enhance-finalize.ts`; runtime/ledger `_shared/video-enhance-runtime.ts`.
- Callback `video-enhance-webhook` (standard-webhooks signature + replay window 300s + authoritative re-read by prediction id). Fallback `video-enhance-reconcile`.
- Client: `src/hooks/useEnhanceVideo.ts` -> `EnhanceVideoPanel.tsx` -> wrapped by `EnhanceVideoDialog.tsx`. All three entry points use it: `src/pages/MediaLibrary.tsx:1497`, `directors-cut/studio/sidebar/FXPanel.tsx:266`, `directors-cut/studio/RenderOverlay.tsx:227`, plus `directors-cut/features/AIVideoUpscaling.tsx` calling the hook directly. No second pricing or persistence path exists.

**Important naming correction:** the enhancement path does **not** use ModelArk/BytePlus. Both engines run through Replicate. `MODELARK_API_KEY` is used only by Seedance video *generation* (`modelark-poll`), never by Video Enhance.

## 2. Topaz — exact route and payload

`video-enhance-models.ts:101-123`, provider `topazlabs/video-upscale`, schema ref `972107c4`:

```
{ video, target_resolution, target_fps }
```

No scale factor, no model/mode, no codec or bitrate input — the published schema exposes none.

Hidden behaviour, documented in `_shared/video-enhance-frame.ts` and reproduced by tests: Topaz reads the tier as a **target line count on the height**, whatever the orientation (`ENGINE_LABEL_READING['topaz-video-upscale'] = 'line_count'`). Measured production evidence:

| Run | Source | Ordered | Measured | Short-edge gain |
| --- | --- | --- | --- | --- |
| `ee9fdb0e` | 1080x1920 | 4K | 1216x2160 (hevc, 7.5 Mbit/s) | 1.13x |
| `b9b479d4` | 720x1280 | 4K | 1216x2160 (hevc, 5.0 Mbit/s) | 1.69x |
| `c7d52d9e` | 720x1280 | 4K | 1216x2160 | 1.69x |
| `4b35f46a` | 1080x1920 | 720p | **408x720** (hevc, 0.8 Mbit/s, 0.5 MB) | **0.38x — downscale** |

So: portrait 4K on Topaz is not representable by this route at all, and a tier lower than the source produces a smaller file than the input while the customer is billed for an "enhancement".

## 3. ByteDance — exact route and payload

`video-enhance-models.ts:74-100`, provider `bytedance/video-upscaler`:

```
{ video, scene, processing_type, target_resolution, target_fps }
```

`scene` is the published enum (`aigc|short_series|ugc|old_film|common`), `processing_type` is the tier. No codec, bitrate or quality input exists on this route — output encoding is entirely the provider's. Measured: h264, ~21 Mbit/s at 4K portrait, ~11 Mbit/s at 1080p portrait.

The `pro` tier is an entitlement tier (`entitlementTiers: ['pro']`) gated by the secret `VIDEO_ENHANCE_VERIFIED_ENTITLEMENTS`. **That secret does not exist** in the project, so `pro` can never be selected or run — only `standard` is reachable today.

## 4. Routing / target-frame contract — working as designed

`planDelivery` in `video-enhance-frame.ts` + `index.ts:265-297`: if the requested engine cannot reach the promised frame, the run is routed to one that can. Confirmed live: run `3d45c717` has `requested_model_id = topaz-video-upscale`, `model_id = bytedance-vcube`, `delivery_strategy = engine_routed`, delivered 2160x3840. This is the only run carrying the new fields; all 23 earlier runs predate the contract (`target_width`, `projected_width`, `delivery_strategy` are NULL).

## 5. No recompression after the provider

`finalizeSuccess` (`video-enhance-finalize.ts`): `fetch(providerOutputUrl)` -> `arrayBuffer()` -> upload the **same bytes** to `background-projects/<user>/video-enhance-staging/<run>.mp4`, probe read-only, then `storage.move` to the final key. No ffmpeg, no proxy, no re-encode anywhere in the chain; the player and the download link point straight at the stored file. Provider bytes are delivered pixel- and byte-identical.

## 6. Measurement and display

Measurement **does** run for Video Enhance itself (independent of the AI-video-generation measurement path): `actual_width/height`, `output_size_bytes`, `output_bitrate_kbps`, `output_codec`, `projection_matched` are written in `finalizeSuccess`. The panel reads them (`EnhanceVideoPanel.tsx:348-360`, "Delivered: … × … pixels · x Mbit/s · y MB").

Two data-quality defects:
- `output_codec` stores the HTTP content type on the newest run (`video/mp4`) instead of the codec (`h264`/`hevc` on older rows) — `measurement.output_codec = contentType`.
- 15 of the 24 completed runs have `actual_*` NULL (older runs), so the "Delivered" line is simply absent for them.

`outputMatchesOrder` (`video-enhance-runtime.ts:228-252`) validates **height only** (>= 90% of the ordered height) and merely sanity-checks width > 16px. A width shortfall like Topaz's 1216 instead of 2160 would not be caught if the routing did not prevent it first.

## 7. Tests

`npx vitest run src/test/videoEnhance*.test.ts src/test/videoCapabilityGate*.test.ts` -> **9 files, 184 tests, all passing** (target frame, parity client/server, pricing cap, lifecycle, cost source, calibration, source picker, capability gate + ordering). No paid provider call was triggered.

## 8. Operational gap

There is **no cron job** scheduling `video-enhance-reconcile` (`select … from cron.job where command ilike '%enhance%'` returns nothing) and no other caller in the repository. Today every run finished through the webhook, so nothing is stuck — but if one webhook is missed, that run stays open until someone invokes the reconciler by hand: no retry of persistence, no manual-review transition, no late cost true-up.

## 9. Most likely reasons a user says "upscaling is not working"

1. **A tier at or below the source does nothing — or shrinks the file.** The panel defaults to `1080p`; on the operator's 1080x1920 portrait clips that is a no-op (run `0cadd9a1`: 1080x1920 -> 1080x1920, 0.09 EUR) and 720p is an actual downscale (run `4b35f46a`). Neither the client (`EnhanceVideoPanel.tsx:296`) nor the server rejects or warns about it.
2. **Topaz on portrait material.** 1.13x on the short side looks identical to the eye while the label says 4K.
3. **The engine swap is invisible.** `estimate` returns `delivery`, but the panel never reads it — the user picks Topaz, ByteDance runs, and nothing on screen says so.
4. **No progress feedback.** `useEnhanceVideo` polls every 5s and the button just spins; a multi-minute 4K job reads as "hung".
5. **Re-sharing kills the result.** Messengers recompress; the panel already warns about this, but only after the run finished.
6. **`output_codec` shows `video/mp4`** on the newest run, which reads like missing information in the delivered line.

## Proposed follow-up (not executed — approval turns this into work)

Fix order, no architectural change:
1. Block/warn on non-upscaling orders: hide or flag tiers whose target short edge is <= source short edge, server-side rejection with a clear code.
2. Show the executing engine and the promised pixel frame from `delivery` before the start, and a real progress/elapsed line while running.
3. Store the real codec instead of the content type; backfill the measured values for the older completed runs.
4. Schedule `video-enhance-reconcile` (e.g. every 5 minutes) as the webhook fallback.
5. Decide on ByteDance `pro`: either verify the entitlement and set the secret, or drop the tier from the registry.
