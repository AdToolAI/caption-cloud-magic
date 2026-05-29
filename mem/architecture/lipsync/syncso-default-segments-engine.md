---
name: Sync.so Segments (v5) is the Default Dialog Engine
description: useTwoShotAutoTrigger routes ALL dialog scenes (cinematic-sync, sync-segments, auto) to compose-dialog-segments by default; only engine_override='cinematic-sync-legacy' falls back to the old v4 per-turn compose-dialog-scene chain. sceneEngineRouter auto-recommends 'sync-segments'. SceneCard surfaces "⚡ Fast Dialog · 1-Call — Default" and "🐢 Legacy Cinematic Chain". sync-so-webhook now walks every known Sync.so error shape so terminal failures stop persisting "An unknown error occurred." PipelineProgressBar shows live Sync.so concurrency-slot usage (X/3).
type: architecture
---

**Sync.so secret name (CRITICAL):** The Vault secret is `SYNC_API_KEY` (legacy). Every new Sync.so caller MUST read all three names in this order or it will boot into a silent 500: `SYNC_API_KEY → SYNC_SO_API_KEY → SYNCSO_API_KEY`. Use `getSyncApiKey()` from `_shared/syncso-preflight.ts` — never hand-roll the lookup. A 500 with `error: "missing_sync_api_key"` was the root cause of "Edge Function Fehler" on every dialog scene after the v5 default switch until 2026-05-29.


**Why:** v4 (`compose-dialog-scene`) splits each dialog scene into N sequential per-turn Sync.so calls — ~10–15 min wallclock per scene and burns the Sync.so Creator concurrency budget on a single scene. v5 (`compose-dialog-segments`) sends ONE call with `segments[]` and Sync.so parallelizes internally (Artlist pattern). With v5 as default the 3-slot Sync.so concurrency budget covers 3 *different* scenes in parallel instead of 3 turns of one scene.

**Routing change** (`src/hooks/useTwoShotAutoTrigger.ts`):
- `DIALOG_ENGINES` now includes `cinematic-sync-legacy` so the auto-trigger still picks up opt-in legacy scenes.
- Dispatch: `engine_override === 'cinematic-sync-legacy' ? 'compose-dialog-scene' : 'compose-dialog-segments'` — auto + cinematic-sync + sync-segments all hit v5.
- v5 stale-watchdog now applies to any non-legacy dialog row whose `dialog_shots.version === 5` (was: only `engine_override === 'sync-segments'`), so auto-routed scenes are protected.
- v4 stuck rows still drain through `dialogShotRows` poll-dialog-shots loop unchanged.

**Recommendation** (`src/lib/video-composer/sceneEngineRouter.ts`):
- Auto path for dialog+cast returns `sync-segments` (not `cinematic-sync`).
- Override `cinematic-sync` is normalized to the same `sync-segments` recommendation (since they now share the same dispatcher).
- New `cinematic-sync-legacy` recommendation labeled "🐢 Legacy" with explicit ~10–15 min disclaimer.

**SceneCard** (`src/components/video-composer/SceneCard.tsx`):
- Engine `<Select>` now lists "⚡ Fast Dialog · 1-Call — Default" first and "🐢 Legacy Cinematic Chain (Per-Turn)" last, muted. Removed the old `cinematic-sync` option (it was a footgun — same code path as sync-segments after this change, only difference was which dispatcher got called).

**Error capture** (`supabase/functions/sync-so-webhook/index.ts`):
- New `extractError(payload)` walks every nested Sync.so shape: `error`, `errorMessage`, `error_message`, `message`, `failureReason`, `errorCode`, `error.message|details|detail|reason`, plus all `data.*` mirrors.
- Filters out the placeholder `"An unknown error occurred."` so the next meaningful candidate wins.
- On any non-COMPLETED terminal status, the full payload is logged once with the extracted error for post-mortem without re-instrumentation.

**Concurrency UI** (`src/components/video-composer/PipelineProgressBar.tsx`):
- While lipsync phase is running, polls `syncso_inflight_jobs` (started_at within last 10 min) every 5 s and renders a pill `⚡ X/3`.
- Pill turns amber at 3/3 with tooltip "Alle 3 Sync.so-Slots belegt — weitere Szenen werden eingereiht und automatisch nachgezogen.", emerald otherwise.

**Type** (`src/types/video-composer.ts`): `engineOverride` union extended with `'cinematic-sync-legacy'`.

**Migration impact:** zero — all existing rows with `engine_override='cinematic-sync'` are now silently re-routed to v5 on their next retry/dispatch. No DB rewrites needed.
