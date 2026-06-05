---
name: v61 Sync-3 Default for Multi-Speaker Chained Pipeline
description: As of June 2026, the chained per-speaker Sync.so pipeline (v58/v59/v60) defaults to model `sync-3` for every scene with N>=2 speakers, instead of `lipsync-2-pro`. Reason: the chained path feeds Sync.so a LOCKED Hailuo plate where the mouth never moves — exactly the class of input lipsync-2-pro silently rejects with `provider_unknown_error` ("Still Frame Limitation" per https://sync.so/docs/models/lipsync). sync-3 has built-in obstruction detection and can open closed lips. Single-speaker (N=1) keeps `lipsync-2-pro` as default because those plates typically carry natural speaking motion (HeyGen / avatar / user upload) where lipsync-2-pro's fidelity ceiling is higher. `coords-pro-lp2pro` is a new retry variant that forces lipsync-2-pro on the proven coords-pro shape — final fallback in the multi-speaker ladder, restoring the historically successful path before refunding.
type: architecture
---

## Why this change

The v58/v59/v60 chained pipeline has been stable structurally — one Sync.so
call per speaker, manual coords ASD, serial dispatch via the webhook. But
the default model was `lipsync-2-pro`, chosen historically when the plate
was assumed to contain natural speaking motion.

The reality of the Composer pipeline since the locked-camera prompt (v57,
FROZEN I.4) is the opposite: every multi-speaker plate is a LOCKED Hailuo
shot where the mouth never moves until Sync.so paints it. The Sync.so docs
explicitly warn that `lipsync-2-pro` requires natural speaking motion in
the source video — the "Still Frame Limitation". On static plates it
returns the opaque `An unknown error occurred.` (`provider_unknown_error`).

`sync-3` is Sync.so's recommended model for static, occluded, multi-person
plates. It has built-in obstruction detection and can open closed lips.
The existing v37 retry ladder already escalated to `sync-3` on failure;
v61 simply promotes it to the FIRST attempt for multi-speaker.

## Decision matrix

| N | First attempt | Retry ladder | Final fallback |
|---|---------------|--------------|----------------|
| 1 | `coords-pro` → lipsync-2-pro | coords-pro-box → sync3-coords → coords-pro-lp2pro | auto-pro / auto-standard |
| 2-4 | `coords-pro` → **sync-3** | coords-pro-box (sync-3) → sync3-coords (sync-3) → **coords-pro-lp2pro (lipsync-2-pro)** | refund (auto-* blocked) |

## What changed

1. `supabase/functions/compose-dialog-segments/index.ts` ~L1993-2020
   - `payloadModel` picker: when `speakers.length >= 2` and `retryVariant`
     is `coords-pro` or `coords-pro-box`, use `SYNC3_MODEL` instead of
     `LIPSYNC_MODEL`.
   - Added `coords-pro-lp2pro` variant → forces `LIPSYNC_MODEL` (lipsync-2-pro)
     with the same point-coord ASD shape as `coords-pro`.

2. `supabase/functions/compose-dialog-segments/index.ts` ~L1922
   - ASD branch now also matches `coords-pro-lp2pro` (same point-coord
     shape — only the model differs).

3. `supabase/functions/sync-so-webhook/index.ts` ~L67
   - `V5_RETRY_VARIANTS` now includes `coords-pro-lp2pro` between
     `sync3-coords` and `auto-pro`.

4. `supabase/functions/sync-so-webhook/index.ts` ~L1057-1083
   - Split the v37 escalation branch: `coords-pro-box → sync3-coords` is
     unchanged. After `sync3-coords` exhausts (v61 branch), ladder steps
     to `coords-pro-lp2pro` once — same point-ASD shape but on
     `lipsync-2-pro`. This restores the "proven path" that ran reliably
     in production before sync-3 was promoted to default. Activates for
     N>=2 (not just N>=3).

## Sync.so payload compatibility

Per `mem://architecture/lipsync/v54-sync3-official-segments`: `sync-3`
ignores `temperature` and `occlusion_detection_enabled` (managed natively).
Our `syncOptions` only set `sync_mode: "cut_off"` and
`active_speaker_detection` — both supported by sync-3 and lipsync-2-pro
identically. No payload change required.

## Pricing & refunds

Unchanged. `ceil(durSec) × 9 × N_passes` applies regardless of model.
sync-3 and lipsync-2-pro are priced identically per Sync.so. Idempotent
refund path (v23 server-owned state) unchanged.

## Out of scope

- `MAX_SPEAKERS = 4` (FROZEN I.6) unchanged.
- v60 unified chained pipeline (FROZEN I.1, I.9) unchanged.
- v56 `segments[]` path stays dead for multi-speaker (FROZEN I.2).
- Locked-camera prompt (FROZEN I.4) unchanged.
- Manual-ASD guard (FROZEN I.5) unchanged.

## Verification

- 2-4 speaker scene first dispatch: edge logs show
  `model=sync-3 variant=coords-pro` (NOT `model=lipsync-2-pro`).
- On sync-3 failure (rare): ladder runs `coords-pro-box (sync-3)` →
  `sync3-coords (sync-3)` → `coords-pro-lp2pro (lipsync-2-pro)` → refund.
- 1-speaker scene first dispatch: unchanged, `model=lipsync-2-pro`.
