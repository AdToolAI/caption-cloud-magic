---
name: v267 Anchor Back + Soft Identity Audit
description: v266 removed the composed Nano Banana anchor from multi-speaker cinematic-sync and morphs/lipsync-miss came back (speaker 2 not hit). v267 restores the composed anchor as reference_image_url (stabilises N>=2 against face-morph) but demotes the Gemini identity audit from hard-gate to soft-warn — any identity failure (clone/swap/missing/ambiguous) writes a warning into composer_scenes.clip_error + twoshot_stage='anchor_soft_pass' and the pipeline continues. Default flag CINEMATIC_SYNC_NO_ANCHOR flipped from "1" to "0". Only genuine technical failures (portraits absent → v195_cinematic_sync_anchor_missing, provider errors) still hard-block with refund.
type: architecture
---

# Why

v266 disabled the composed anchor entirely for multi-speaker cinematic-sync. The theory was that raw portraits + prompt should be enough for Hailuo/HappyHorse. In practice, without the 2-Shot / Group-Shot reference plate, face-morphs returned and the Sync.so face-map drifted → speaker 2 (and often 3/4) was not lip-synced.

The real problem was never the composed anchor — it was the **hard blocking Gemini identity audit** on top of it, which false-flagged cast members with shared surnames as clone/swap/missing.

# Rule

- Composed anchor is generated (all attempts, face-lock, strict-retry stay).
- Anchor is pinned as `reference_image_url` and handed to the video provider.
- Gemini identity audit still runs, but:
  - `ok` → continue silently
  - any of `clone / swap / missing / ambiguous` → write soft-warn into `composer_scenes.clip_error`, set `twoshot_stage='anchor_soft_pass'`, log `v267_anchor_soft_warn`, **continue**.
- `extra` is ignored as before (bystanders allowed).
- Only remaining hard-fail on anchor path: `!scene.referenceImageUrl` → `v195_cinematic_sync_anchor_missing`.

# Feature flag

`CINEMATIC_SYNC_NO_ANCHOR` default `"0"` (v267 mode). Set to `"1"` to restore v266 behaviour (anchor completely bypassed for N>=2).

# Not changed

- `compose-scene-anchor` internals (Two/Group-Shot prompt, portrait cap 4, outfit lock).
- Sync.so multi-face pipeline (face-map, preclips, v129 doc-strict, v264 race guard).
- Single-speaker cinematic-sync path.
