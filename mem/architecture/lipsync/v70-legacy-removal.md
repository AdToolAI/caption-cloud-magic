---
name: v70 Legacy Lip-Sync Pipeline Removal
description: Deletes the legacy per-turn v4 dispatcher and unused admin probes so only the v69 unified single-face preclip pipeline (compose-dialog-segments → sync-so-webhook → render-sync-segments-audio-mux) can run. cinematic-sync-legacy engine option removed from UI/router/types. Historical dialog_shots.version∈{4,41..56} rows respond with legacy_v4_ignored 200 in the webhook and require user reset via reset-lipsync-scene to re-enter v69.
type: constraint
---

## Removed (DO NOT recreate)

Edge functions:
- `supabase/functions/poll-dialog-shots/` (per-turn v4/v5+shots[] dispatcher)
- `supabase/functions/render-dialog-turn/` (per-turn full clip renderer)
- `supabase/functions/render-dialog-stitch/` (per-turn ffmpeg stitch)
- `supabase/functions/sync-so-probe/` (admin doc-verifier, no callers)
- `supabase/functions/syncso-auto-tuner/` (Stage F.7 heuristic, no callers)

Remotion templates:
- `src/remotion/templates/DialogTurnClipVideo.tsx`
- (`DialogTurnFaceCropVideo.tsx` is KEPT — required by v69 preclip render via `_shared/pass-face-preclip.ts`)

UI/code paths:
- `engineOverride: 'cinematic-sync-legacy'` removed from `src/types/video-composer.ts`, SceneCard `<Select>`, and `sceneEngineRouter.ts`.
- `useTwoShotAutoTrigger.ts` no longer dispatches `poll-dialog-shots`; always invokes `compose-dialog-segments`.
- `compose-clip-webhook` always routes auto lip-sync to `compose-dialog-segments` (no speaker-count branching).
- `SceneCard` and `ClipsTab` Lip-Sync action buttons invoke `compose-dialog-segments` directly.
- `sync-so-webhook` v4 per-turn branch replaced with `legacy_v4_ignored` 200 (no DB mutation, no fan-out).
- `supabase/config.toml`: orphan `[functions.*]` blocks for the deleted functions plus the long-gone `compose-lipsync-scene` / `compose-twoshot-lipsync` removed.

## Kept (DO NOT delete)

- `compose-dialog-scene/index.ts` — 95-line forwarder to `compose-dialog-segments`, kept for backwards-compat with stray callers.
- `compose-twoshot-audio` — required audio prep for v69.
- `compose-dialog-segments` — v69 dispatcher.
- `sync-so-webhook` (segments branches only).
- `render-sync-segments-audio-mux` — preclip overlay + ffmpeg mux.
- `lipsync-watchdog`, `reset-lipsync-scene`, `cancel-dialog-lipsync`.
- All `_shared/` lipsync utilities: `cast-validation.ts`, `syncso-preflight.ts`, `lipsync-fail.ts`, `dialog-lock.ts`, `face-crop.ts`, `pass-face-preclip.ts`.
- Remotion `DialogTurnFaceCropVideo` and `DialogStitchVideo` compositions.

## Behaviour for historical rows

`composer_scenes.dialog_shots` rows with `version ∈ {2, 4, 41..56}` (≈20 v4 + 11 official-segments rows at time of cleanup) are no longer auto-resumable. The watchdog has already refunded them. Users can restart any such scene by clicking "Lip-Sync neu rendern" which calls `reset-lipsync-scene` and re-enters the v69 path.
