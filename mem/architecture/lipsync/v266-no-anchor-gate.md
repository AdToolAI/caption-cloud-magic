---
name: v266 No-Anchor-Gate for Multi-Speaker Cinematic-Sync
description: Composed anchor + Gemini identity audit are no longer a hard gate for N>=2 cinematic-sync. Anchor is still generated best-effort as a reference image, but anchor_identity_* failures no longer block Hailuo/HappyHorse or Sync.so. Feature-flag CINEMATIC_SYNC_NO_ANCHOR (default "1"). Sync.so multi-face pipeline is unchanged.
type: architecture
---

# Why

v170 → v264 layered strict-retry, face-lock, soft-pass, missing-guard, safe-fail and framing-retry onto the composed anchor path. The failure they all tried to work around is the same: Nano Banana 2 blends similar-looking cast (shared surnames like Dusatko), and Gemini Vision then flags the resulting anchor as clone/swap/missing. That gate ran BEFORE the video/lip-sync providers, so users saw "anchor_identity_missing_detected" scene failures even when the actual Sync.so path would have worked on the real video frame.

# What changed

`supabase/functions/compose-video-clips/index.ts` around the multi-cast anchor block:

- The anchor is still composed (still stored as `reference_image_url`, still useful as a provider reference).
- The final `if (identityFailure && identityFailure !== "extra")` gate is now bypassed for `portraitUrls.length >= 2` when `CINEMATIC_SYNC_NO_ANCHOR` is truthy (default `"1"`).
- Bypass path logs `v266_anchor_gate_bypass` and falls through to normal provider dispatch.
- Single-speaker cinematic-sync keeps the original gate — there is no family-drift risk with N=1.

# Not changed

- Sync.so multi-face lipsync (face map, preclips, v129 doc-strict, v264 safe-fail race guard) is untouched.
- Anchor composition, retries and the audit still run — only the final blocking branch is skipped.
- `compose-scene-anchor` is unchanged.
- Single-speaker path is unchanged.

# Rollback

Set edge env `CINEMATIC_SYNC_NO_ANCHOR=0` to restore the old blocking behavior.
