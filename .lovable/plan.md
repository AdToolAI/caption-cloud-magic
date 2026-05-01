## HappyHorse 1.0 — Integration Plan

**Good news:** HappyHorse 1.0 is officially available on Replicate as `alibaba/happyhorse-1.0`. We can reuse the existing `REPLICATE_API_TOKEN` — **no new API key required.**

### Provider Capabilities (per Replicate schema)

| Property | Value |
|---|---|
| Model ID | `alibaba/happyhorse-1.0` |
| Modes | Text-to-Video, Image-to-Video |
| Duration | 3–15 seconds (default 5s) |
| Resolution | 720p / 1080p (default 1080p) |
| Aspect Ratios | 16:9, 9:16, 1:1, 4:3, 3:4 (T2V only; I2V uses image ratio) |
| Pricing | ~$0.14/s (720p) / $0.28/s (1080p) — comparable to Kling Std/Pro |
| Strength | Multi-shot consistency, dialog-driven scenes, motion stability |

> **Note on "native audio":** The Artlist marketing page advertises native lip-sync + audio, but the **Replicate endpoint exposes only video output** (no audio params in schema). We integrate it as a video-only provider for now and can revisit if Replicate adds audio-enabled variants later.

---

### What gets built

#### 1. New Edge Function: `generate-happyhorse-video`
- Pattern: identical to `generate-vidu-video` / `generate-pika-video`
- Inputs: `prompt`, `image` (optional, for I2V), `duration` (3–15), `resolution` (720p/1080p), `aspect_ratio`
- Replicate polling via `EdgeRuntime.waitUntil`
- Wallet pre-check + credit reservation (`credit-reserve`) before Replicate call
- Idempotent refund on failure (`credit-refund`) — required by core memory
- QA mock short-circuit via `_shared/qaMock.ts` (returns sample video for `x-qa-mock: true`)
- Persists result to `video_creations` table

#### 2. AI Video Toolkit Registration
File: `src/config/aiVideoModelRegistry.ts`
- Add `happyhorse` provider entry with capabilities:
  - `t2v: true`, `i2v: true`, `v2v: false`, `referenceImages: false`
  - Duration tiers: 3, 5, 8, 10, 12, 15 seconds
  - Resolution selector: 720p / 1080p
  - Pricing tiers per second
- Brand Character Lock compatibility (auto-injects character image as I2V first frame + identity card into prompt)
- Shot Director + Cinematic Style Presets work out-of-the-box (English prompt enrichment)
- Video Prompt Optimizer compatible

#### 3. Composer Integration
Files: `src/types/video-composer.ts`, `src/lib/video-composer/modelMapping.ts`
- New `ClipSource = 'ai-happyhorse'`
- Engine normalization: if unsupported feature requested (e.g. v2v), silently fallback to `ai-hailuo` (per existing Composer Engine Normalization policy)
- Available in Motion Studio scene picker

#### 4. QA & Observability
- Add HappyHorse to `PROVIDER_MATRIX` in `qa-live-sweep` (mock mode by default)
- Add to `qa-weekly-deep-sweep` real-spend rotation (one real render every 6h cycle)
- Watchdog auto-fails stuck rows (already covered by existing infra)

#### 5. UI Touch-Points
- New tile in `/ai-video-toolkit` model dropdown with badge "NEW · Alibaba"
- Status: `live` (not `coming-soon`, not `maintenance`)
- Legal compliance section: append Alibaba HappyHorse 1.0 to the EU AI Act provider list

---

### Pricing & Wallet

We charge users in line with existing video providers:

| Tier | Duration | Resolution | Internal Cost | User Credits |
|---|---|---|---|---|
| Quick | 5s | 720p | ~$0.70 | 70 |
| Standard | 8s | 1080p | ~$2.24 | 224 |
| Pro | 15s | 1080p | ~$4.20 | 420 |

(Final pricing to be confirmed during build — using same margin model as Kling 3.)

---

### Out of scope (deferred)

- **Native audio/lip-sync via HappyHorse**: not exposed by Replicate yet. Talking Head pipeline stays on HeyGen.
- **Reference-to-video / multi-shot extensions**: not in Replicate schema; revisit if added.
- **FAL or Alibaba Cloud direct API**: skipped — Replicate is the simplest path with zero new secrets.

---

### Estimated effort

~30–45 min build time. No new env vars, no new buckets, no DB migrations needed (uses existing `video_creations` table).

**Ready to proceed once you approve.**