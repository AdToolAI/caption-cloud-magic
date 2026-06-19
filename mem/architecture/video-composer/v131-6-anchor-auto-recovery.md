---
name: v131.6 Anchor Auto-Recovery (Face-Lock Attempt-3)
description: Composer cinematic-sync anchor: third compose attempt with FACE-LOCK mode auto-fires after attempt-2 still swaps identities, before showing the red "Re-Render empfohlen" failure
type: feature
---

# v131.6 — Anchor Identity Auto-Recovery

## Problem
`compose-video-clips` for `cinematic-sync` scenes with ≥2 cast members ran only **2** Nano-Banana-2 compose attempts. When both audits returned `swap` (Gemini Vision detects the wrong person in a reference slot), the scene was hard-failed with `anchor_identity_failed` and a red "Re-Render empfohlen" toast. In practice the manual re-render almost always succeeded on the 3rd try — so users were doing manually what the pipeline could do automatically.

## Fix
A 3rd attempt is dispatched **only when** `identityFailure === "swap"` after attempt-2 (clones/extras/missing get other fixes, not face-pixel-copy). It runs in `faceLockMode`:

- `compose-scene-anchor` body flag `faceLockMode: true` (implies `strictSwapMode`)
- Adds `FACE_LOCK_SUFFIX` to the edit instruction: "COPY THE FACE DIRECTLY FROM THAT SLOT'S IDENTITY HEADSHOT pixel-for-pixel ... NO creative interpretation ... NO blending ... NO substitution"
- Passes `temperature: 0` to Gemini Image (deterministic)
- Cache key bumped to `v16` and includes `fl=0|1`

Hailuo + Sync.so credits stay protected — the dispatch still happens only **after** a clean audit.

## Forensic Trail
Every attempt writes one entry to `composer_scenes.audio_plan.twoshot.anchor_attempts[]`:

```json
{ "attempt": 3, "mode": "face-lock", "identity": "ok",
  "faces": 4, "humans": 4, "mismatched": [], "at": "..." }
```

`mode ∈ {"normal", "strict", "swap", "face-lock"}`. The "Forensik" button surfaces this array unchanged.

## Files
- `supabase/functions/compose-video-clips/index.ts` — attempt-3 block + `anchor_attempts[]` persistence + stale-key strip
- `supabase/functions/compose-scene-anchor/index.ts` — new `faceLockMode` flag, `FACE_LOCK_SUFFIX`, `temperature: 0`, cache `v16`

## Guard Rails
- Attempt-3 requires `identityPortraitUrls.length === portraitUrls.length`; otherwise no face-lock fires (we have no canonical headshots to copy from).
- Identity audit & failure UI are unchanged — the red error still shows if all 3 attempts swap.
