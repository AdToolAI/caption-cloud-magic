---
name: v62 Sync-3 Universal Default (All Speaker Counts)
description: As of June 2026, model `sync-3` is the Sync.so default for EVERY lip-sync dispatch from compose-dialog-segments — single-speaker (N=1) and multi-speaker (N>=2) alike. The v61 carve-out that kept N=1 on lipsync-2-pro is removed. Reason: Composer/Hailuo plates are locked-camera for single-speaker too, and lipsync-2-pro's Still Frame Limitation triggers `provider_unknown_error` on those just as it did for N>=2 pre-v61. lipsync-2-pro remains reachable only via the explicit `coords-pro-lp2pro` retry variant in the webhook ladder.
type: architecture
---

## Why

The v61 split kept `lipsync-2-pro` as N=1 default on the assumption that
single-speaker plates carry natural speaking motion (HeyGen / avatar /
user upload). In practice almost all single-speaker Composer scenes are
locked Hailuo plates (Cinematic-Sync engine, dialog-shot pipeline) —
exactly the input shape sync-3 was promoted for in v61.

User-confirmed: the only way to stop the recurring `provider_unknown_error`
on N=1 is to push sync-3 to the first attempt for N=1 as well.

## What changed

`supabase/functions/compose-dialog-segments/index.ts` (`payloadModel` picker):

```ts
// before (v61):
(retryVariant === "coords-pro" || retryVariant === "coords-pro-box")
  ? (isMultiSpeakerForModel ? SYNC3_MODEL : LIPSYNC_MODEL)
  : LIPSYNC_MODEL;

// after (v62):
(retryVariant === "coords-pro" || retryVariant === "coords-pro-box")
  ? SYNC3_MODEL
  : SYNC3_MODEL;
```

Only `coords-pro-lp2pro` (explicit) and `auto-standard` (explicit) still
select lipsync-2-pro / fallback model.

## Decision matrix (post-v62)

| N | First attempt | Retry ladder | Final fallback |
|---|---------------|--------------|----------------|
| 1 | `coords-pro` → **sync-3** | coords-pro-box (sync-3) → sync3-coords (sync-3) → coords-pro-lp2pro (lipsync-2-pro) | auto-pro / auto-standard |
| 2-4 | `coords-pro` → **sync-3** | coords-pro-box (sync-3) → sync3-coords (sync-3) → coords-pro-lp2pro (lipsync-2-pro) | refund (auto-* blocked) |

The N=1 and N>=2 ladders are now identical model-wise; only the final
auto-fallback differs (allowed for N=1, blocked for N>=2 to prevent
face-swap risk).

## Out of scope

- Pricing unchanged (sync-3 and lipsync-2-pro are priced identically).
- Idempotent refund path (v23) unchanged.
- v60 unified chained pipeline (FROZEN I.1, I.9) unchanged.
- Locked-camera prompt (FROZEN I.4) unchanged.
- ASD branch unchanged — `coords-pro-lp2pro` already matched there in v61.

## Verification

- 1-speaker scene first dispatch: edge logs show
  `model=sync-3 variant=coords-pro` (NOT `model=lipsync-2-pro`).
- 2-4 speaker scene first dispatch: unchanged from v61 (already sync-3).
- `coords-pro-lp2pro` only appears in logs after 3 sync-3 retries failed.
