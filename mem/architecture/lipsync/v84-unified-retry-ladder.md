---
name: v84 Unified Retry Ladder (Phase 2.3)
description: compose-dialog-segments `RETRY_VARIANTS` now matches sync-so-webhook `V5_RETRY_VARIANTS` exactly — `["bbox-url-pro","coords-pro","coords-pro-box","sync3-coords","coords-pro-lp2pro","auto-pro","auto-standard"]`. Previously the dispatcher omitted `coords-pro-lp2pro`, so a fresh dispatch with that retry_variant was rejected by `isRetryVariant`. Both files now share the same 7-step ladder with `coords-pro-lp2pro` as the lipsync-2-pro escape hatch before falling into auto-detect.
type: architecture
---

# v84 — Unified retry ladder (June 2026, Phase 2.3)

## What changed
`supabase/functions/compose-dialog-segments/index.ts`:
- `RETRY_VARIANTS` extended with `"coords-pro-lp2pro"` (slot 4), matching
  `V5_RETRY_VARIANTS` in `sync-so-webhook/index.ts`.
- All downstream branches (variant dispatch model picker at line ~1986,
  facemap-box gate at line ~1860) already handled `coords-pro-lp2pro` —
  this was purely a validation/accept-list fix.

## Why
The webhook escalates `sync3-coords` → `coords-pro-lp2pro` on 3+ speaker
soft-fails (line 754-757 in sync-so-webhook). It then re-invokes the
dispatcher with `pass.retry_variant = "coords-pro-lp2pro"`. The
dispatcher's `isRetryVariant` guard rejected the value because it wasn't
in `RETRY_VARIANTS`, silently dropping back to default. Net effect: the
v61 lipsync-2-pro fallback never actually ran.

## Ladder (now identical in both files)
1. `bbox-url-pro`     — v82 PRIMARY (sync-3 + per-frame JSON URL)
2. `coords-pro`       — sync-3 + point ASD
3. `coords-pro-box`   — sync-3 + inline bounding_boxes (v50/v77)
4. `sync3-coords`     — sync-3 + point ASD (legacy alias)
5. `coords-pro-lp2pro` — **lipsync-2-pro** + point ASD (v61 escape hatch)
6. `auto-pro`         — lipsync-2-pro + auto_detect
7. `auto-standard`    — lipsync-2 + auto_detect (last ditch before refund)

## Files
- edited `supabase/functions/compose-dialog-segments/index.ts`
