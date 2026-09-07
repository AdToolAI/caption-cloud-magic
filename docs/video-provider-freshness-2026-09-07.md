# Video Provider Freshness Matrix — 2026-09-07

Route-by-route audit of every video model AdTool AI actually calls.
Only the **exact route our edge function invokes** is assessed. Marketing pages
are never accepted as evidence for a route capability.

Canonical source of truth: `supabase/functions/_shared/videoModelSpecs.ts`
Client mirror (generated): `src/config/videoModelSpecs.ts`

Status vocabulary: `CURRENT`, `CAPABILITY_UPDATE`, `NEW_MODEL_AVAILABLE`,
`ROUTE_REPLACEMENT`, `DOCS_CONFLICT`, `SMOKE_TEST_REQUIRED`, `PROVIDER_UNAVAILABLE`.

No paid provider call, no smoke test, no DB write, no deploy was performed for
this audit.

---

## 1. Runway

| Field | Value |
| --- | --- |
| model id | `runway-gen4-aleph` |
| provider / route | Runway, `runway:/v1/video_to_video`, model id `gen4_aleph` |
| AdTool capability (before) | live, startable, V2V 720p / 5s |
| Provider capability (now) | **route removed** — "Gen-3 Alpha Turbo (`gen3a_turbo`) and Gen-4 Aleph (`gen4_aleph`) are no longer available via the Runway API" |
| Status | `ROUTE_REPLACEMENT` / `PROVIDER_UNAVAILABLE` |
| Code change | done: `releaseStatus: 'removed'`, `deprecated`, `available: false`, `supersededBy: 'runway-aleph-2'`, `uiGroup: 'legacy'`. Spec kept so historical runs resolve. No alias onto Aleph 2. |
| Paid smoke test | no (dead route) |

| Field | Value |
| --- | --- |
| model id | `runway-aleph-2` (new, locked) |
| provider / route | Runway, model id `aleph2` |
| Status | `NEW_MODEL_AVAILABLE` + `SMOKE_TEST_REQUIRED` |
| Known | documented successor of `gen4_aleph`, video-to-video with prompt + keyframe images |
| UNKNOWN | exact REST path, resolutions, durations, FPS, pricing |
| Code change | done: locked spec, `available: false`, all tiers `UNVERIFIED` |
| Paid smoke test | yes, after route/pricing audit |

## 2. Hailuo / MiniMax

| Field | Value |
| --- | --- |
| model ids | `hailuo-standard`, `hailuo-pro` |
| Route actually called | `minimax/hailuo-2.3` on `replicate:/v1/predictions` |
| AdTool capability (before) | slugs `minimax/hailuo-02` and `minimax/hailuo-02-pro`; edge sent `last_frame_image` |
| Provider capability (now) | `minimax/hailuo-02-pro` does not exist (404 — "Pro" is only the 1080p tier). `minimax/hailuo-2.3` has **no** `last_frame_image` field. |
| Status | `CAPABILITY_UPDATE` |
| Code change | done: both slugs corrected to `minimax/hailuo-2.3`; dead `last_frame_image` removed from `generate-hailuo-video/index.ts`; no end-frame mode declared, so the gate rejects first+last before wallet/provider instead of silently dropping it. |
| Paid smoke test | no (capability was narrowed, not widened) |

| Field | Value |
| --- | --- |
| model id | `hailuo-h3` (new, locked) |
| Route | `minimax/h3` on Replicate |
| Provider capability | T2V/I2V, `first_frame_image` + `last_frame_image`, 768p/1080p, 6s/10s, 16:9 / 9:16 / 1:1 |
| Status | `NEW_MODEL_AVAILABLE` + `SMOKE_TEST_REQUIRED` |
| Paid smoke test | yes (I2V 1080p 6s and first+last) |

## 3. Kling

| Field | Value |
| --- | --- |
| model id | `kling-3` |
| Route | `kwaivgi/kling-v3-video` on Replicate |
| Provider capability (now) | `mode = standard (720p) | pro (1080p) | 4k`; also `end_image` (first+last) and `multi_prompt` (up to 6 shots) |
| Status | `CAPABILITY_UPDATE` + `DOCS_CONFLICT` + `SMOKE_TEST_REQUIRED` |
| Code change | done: 4K added as a **locked** tier (`UNVERIFIED`, not startable). Existing 1080p untouched and still usable. |
| Conflict | Replicate documents the `4k` mode but not the exact pixel frame or the duration/aspect/audio restrictions under it. Third-party 3840x2160 claims were not accepted. |
| Not yet modelled | `end_image`, `multi_prompt` — need payload work plus a smoke test |
| Paid smoke test | yes for 4K |

| Field | Value |
| --- | --- |
| model id | `kling-omni` |
| Route | `kwaivgi/kling-v3-omni-video` |
| Finding | no native 4K mode. Hard exclusion: `generate_audio` cannot be combined with `reference_video`; with a reference video max. 4 reference images (otherwise 7); reference video 3–10s |
| Status | `CAPABILITY_UPDATE` |
| Code change | done: V2V mode now `audio: false` plus a machine-readable constraint, so requested audio blocks visibly instead of being dropped |

## 4. Seedance

| Field | Value |
| --- | --- |
| model id | `seedance-pro` |
| Route | `bytedance/seedance-2.0` on Replicate |
| Provider capability (now) | the only Seedance route documenting 4K ("4K outputs 10-bit H.265/HEVC at high bitrate"); Fast and Mini explicitly point here for 1080p/4K. Also: `last_frame_image`, `reference_images` (max 9), `reference_videos` (max 3), `reference_audios` (max 3), native audio, smart duration (`-1`). Exclusion: `image`/`last_frame_image` cannot be combined with `reference_images`. |
| Status | `CAPABILITY_UPDATE` + `SMOKE_TEST_REQUIRED` |
| Code change | done: 1080p and 4K added as **locked** tiers; the remaining modes documented in `verificationNotes`, not enabled |
| Paid smoke test | yes for 1080p and 4K |

| Field | Value |
| --- | --- |
| model id | `seedance-2-5` (ModelArk) |
| Status | `DOCS_CONFLICT` — several secondary sources state 480p/720p only, no primary route doc confirms 1080p/4K |
| Code change | none. Tiers stay as shipped; conflict recorded |

| Field | Value |
| --- | --- |
| model id | `seedance-2-0-mini` (new, locked) |
| Route | `bytedance/seedance-2.0-mini` |
| Provider capability | T2V/I2V, reference images, native audio, up to 720p |
| Note | does **not** replace `seedance-mini` (Seedance 1 Lite); old id stays for historical runs |
| Paid smoke test | yes |

## 5. LTX

| Field | Value |
| --- | --- |
| model ids | `ltx-2-3-fast`, `ltx-2-3-pro` |
| Status | `DOCS_CONFLICT` |
| Finding | the Replicate routes advertise up to 4K and 50fps; Lightricks' own docs describe lower limits for the same generation. No tier was unlocked on marketing evidence. |
| Code change | none beyond documentation; shipping tiers untouched |

| Field | Value |
| --- | --- |
| model id | `ltx-2-5-fast` (new, locked) |
| Route | `lightricks/ltx-2.5-fast` |
| Status | `NEW_MODEL_AVAILABLE` + `DOCS_CONFLICT` |
| Note | does not replace LTX 2.3; all tiers locked until the resolution/FPS conflict is resolved on the exact route |

## 6. Wan

| Field | Value |
| --- | --- |
| model ids | `wan-2-7-standard`, `wan-2-7-pro` |
| Route actually called | `wan-video/wan-2.7-t2v` and `wan-video/wan-2.7-i2v` |
| Finding | neither `wan-video/wan-2.7` nor `wan-video/wan-2.7-pro` exists; Wan 2.7 is split into task-specific routes. `wan-2.7-r2v` (reference-to-video) and `wan-2.7-videoedit` are separate routes and therefore separate capability identities. |
| Status | `CAPABILITY_UPDATE` |
| Code change | done: slugs corrected on both specs; no capability transferred from the r2v/edit routes |
| Paid smoke test | no |

| Field | Value |
| --- | --- |
| Wan 3.0 | `NEW_MODEL_AVAILABLE`, but the exact Replicate slugs could not be verified. **No spec prepared** — a locked spec with a guessed slug would itself be drift. Re-audit required. |

## 7. Grok

| Field | Value |
| --- | --- |
| Status | `CURRENT` |
| Finding | no route-documented resolution above the tiers we already ship |
| Code change | none. No resolution invented |

## 8. Luma

| Field | Value |
| --- | --- |
| model ids | `luma-ray32-5s`, `luma-ray32-10s` |
| Provider capability | 540p / 720p / 1080p, 5s and 10s, native HDR, optional EXR output; ACES UNKNOWN |
| Status | `CAPABILITY_UPDATE` (documentation only) |
| Code change | none in UI. HDR/EXR are **not** exposed: our backend cannot yet send or post-process those output formats, and per policy a new output format may only surface once the backend really handles it. |

## 9. Vidu

| Field | Value |
| --- | --- |
| Finding | there is no separate `vidu/q3-i2v` slug; image-to-video is a mode of `q3-pro` / `q3-turbo` driven by `start_image`. No multi-reference capability on our route. |
| Status | `CURRENT` for the modes we ship |
| Code change | none. No invented multi-reference capability |

## 10. Pika

| Field | Value |
| --- | --- |
| Status | `PROVIDER_UNAVAILABLE` (intentionally disabled / maintenance) |
| Finding | the usable Pika API today is fal.ai (`/fal-ai/pika`, `pikascenes`, `pikaframes`, v2.2). Pikaffects/Pikaswaps UNKNOWN. The old Replicate route stays as the historical/deprecated route. |
| Code change | none — **no reactivation**. Stays locked until a real smoke test passes |

## 11. HappyHorse

| Field | Value |
| --- | --- |
| model ids | `happyhorse-standard`, `happyhorse-pro` |
| Finding | `alibaba/happyhorse-1.0-pro` does not exist; both tiers run on `alibaba/happyhorse-1.0` |
| Status | `CAPABILITY_UPDATE` |
| Code change | done: `happyhorse-pro` slug corrected |

| Field | Value |
| --- | --- |
| model id | `happyhorse-1-1` (new, locked) |
| Route | `alibaba/happyhorse-1.1` |
| Provider capability | T2V / I2V / reference-to-video with up to 9 reference images |
| Note | own spec; HappyHorse 1.0 kept for historical runs |
| Paid smoke test | yes |

---

## Proposed MINIMAL paid test plan (NOT executed)

| Model | Route | Mode | Resolution | Duration | Aspect | Why needed | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kling 3.0 | `kwaivgi/kling-v3-video` | t2v | 4K | 5s | 16:9 | unlock the new 4K tier + measure real frame size | ~$2–4 |
| Seedance 2.0 | `bytedance/seedance-2.0` | t2v | 1080p | 5s | 16:9 | unlock 1080p, cheapest proof of the high-res path | ~$1–2 |
| Seedance 2.0 | `bytedance/seedance-2.0` | t2v | 4K | 5s | 16:9 | unlock 4K + verify HEVC output | ~$4–6 |
| Hailuo H3 | `minimax/h3` | i2v | 1080p | 6s | 16:9 | new model, verify payload + first/last | ~$1–2 |
| Seedance 2.0 Mini | `bytedance/seedance-2.0-mini` | t2v | 720p | 5s | 16:9 | new economy route | <$1 |
| HappyHorse 1.1 | `alibaba/happyhorse-1.1` | reference | 1080p | 5s | 16:9 | new multi-reference route | ~$1–2 |
| LTX 2.5 Fast | `lightricks/ltx-2.5-fast` | t2v | 1080p | 6s | 16:9 | resolve the 2K/4K/FPS docs conflict | ~$1 |
| Runway Aleph 2 | `aleph2` | v2v | 720p | 5s | 16:9 | only after the REST path + pricing are confirmed | UNKNOWN |

Everything on this list stays locked and unusable for customers until its row
passes.
