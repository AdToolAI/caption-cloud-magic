---
name: Scene Anchor Identity Swap Hardening (v111)
description: Dual-reference compose (outfit cover + canonical brand portrait) + audit-extended swap detection + strict-swap retry for compose-scene-anchor, preventing wrong-face/wrong-gender mappings in multi-speaker Nano Banana 2 anchors.
type: architecture
---

## Problem
3–4 person scene anchors composed by Nano Banana 2 had correct face *count* (no clones / extras / missing) but occasionally a clean **identity swap** — one character rendered with another person's (or wrong-gender) head. Root causes:
1. `compose-scene-anchor` was fed **only one image per character** (the Gemini outfit cover). On 3–4 cast counts those outfit covers occasionally drift in face identity/gender, and Nano Banana 2 faithfully copies that drifted face.
2. `auditAnchorIdentity` only flagged `clone | extra | missing`. A clean swap (each ref appears exactly once) passed audit and shipped.

## Fix (v111)

### Dual-reference compose
- `compose-scene-anchor/index.ts` now accepts `identityPortraitUrls: string[]` aligned 1:1 to `portraitUrls`. When provided, those canonical brand portraits are appended after the world refs and labeled in the prompt as IDENTITY references ("use this face for ${name}, but use the wardrobe/body of the outfit cover").
- Cache key prefix bumped `v14 → v15` so old single-ref anchors don't suppress the new path.
- `compose-video-clips/index.ts` (cinematic-sync + universal anchor blocks) now passes both outfit covers as `portraitUrls` AND the brand_character `reference_image_url` set as `identityPortraitUrls`.

### Audit-extended swap detection
- `_shared/identity-audit.ts` Gemini prompt now also asks per perReference entry for `faceMatch: "match" | "mismatch" | "uncertain"` + `mismatchNotes`.
- New failure `reason: "swap"` with priority **above** `extra` / `missing`. `ok: true` only when every ref appears exactly once AND every `faceMatch === "match"`.
- `ANCHOR_AUDIT_VERSION` bumped to **8** to invalidate cached pre-v111 audits.

### Strict-swap retry
- Retry ladder in `compose-video-clips` now treats `reason === "swap"` as a re-compose trigger: calls `composeAnchor("retry-swap", true)` with `strictSwapMode: true`.
- `compose-scene-anchor` `STRICT_SWAP_SUFFIX` names the mismatched character(s) and emphasizes per-image identity binding.
- Reuses the existing 2-attempt cap — no extra credit cost beyond the standard retry.

## Verification
- `compose-scene-anchor` logs `identityRefs=N` when v111 path is used.
- Audit returns `reason: "swap"` on a drifted render, then retry produces an `ok=true` anchor where each character's face visibly matches their brand portrait.

## Out of scope
- Per-character single-portrait compose + ffmpeg stitch (deferred to v112 if v111 still drifts).
- Replacing Nano Banana 2 with a different model.
- Auto-fixing drifted Stage-21 outfit covers (separate regen flow).
