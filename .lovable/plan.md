## Problem

In 3–4 person scene anchors composed by Nano Banana 2, the *count* is correct (no clones, no extras, no missing), but the **face mapping is wrong** — one character ends up with a different person's head (in this case Samuel rendered as a woman). Lipsync is now reliable, so this is the next visible defect.

### Root cause

Two compounding effects:
1. The compose step is fed **only one image per character** — the **outfit cover** (a Gemini-generated full-body in the picked outfit). On larger 3–4 cast counts, Gemini's outfit covers occasionally drift in face identity and gender. Nano Banana 2 then faithfully copies that wrong face.
2. The existing `auditAnchorIdentity` only catches `clone / extra / missing`. A clean **identity swap** (each ref appears once, count = N) passes the audit and is shipped.

## Plan (v111)

### 1. Send canonical portrait + outfit cover per character to compose-scene-anchor
File: `supabase/functions/compose-video-clips/index.ts` (cinematic-sync block, ~line 1220 and universal anchor block ~line 1670) and `supabase/functions/compose-scene-anchor/index.ts`.

- Extend the call payload with a new optional `identityPortraitUrls: string[]` aligned 1:1 to `portraitUrls` (the brand_character `reference_image_url`).
- In `compose-scene-anchor`, when `identityPortraitUrls` is present, append them as **additional reference images** after the world refs, and label them in the prompt:
  > `Image #X = IDENTITY reference for ${name} (face only — use this face for ${name}, but use the wardrobe/body of Image #${i+1}).`
- Bump cache key prefix `v14|…` → `v15|…` so old cached anchors don't suppress the new path.

### 2. Add identity-swap detection to the audit
File: `supabase/functions/_shared/identity-audit.ts`.

- Extend the Gemini prompt: ask for an extra field per `perReference` entry:
  ```
  "faceMatch": "match" | "mismatch" | "uncertain",
  "mismatchNotes": "<short — e.g. 'depicted person is female, reference is male'>"
  ```
- Add a new failure `reason: "swap"` with priority **above** `extra`/`missing`, returning the list of mismatched names.
- Keep the existing terminal `ok: true` only when every ref appears exactly once AND every `faceMatch === "match"`.

### 3. Wire swap into the existing retry ladder
File: `supabase/functions/compose-video-clips/index.ts` (anchor audit loop, search `prevAuditRaw` / `composeAnchor`).

- When the audit returns `reason === "swap"`, re-call `composeAnchor("retry-swap", true)` and inject a **STRICT SWAP RETRY** clause into `compose-scene-anchor` (new `strictSwapMode: boolean`) that names the mismatched character(s) and emphasizes the per-image identity binding.
- Reuse the existing 2-attempt cap — no extra credit cost beyond what we already spend on a retry.

### 4. Memory + cache bump
- New memory file `mem/architecture/video-composer/anchor-identity-swap-v111.md` describing: dual-reference (portrait + outfit), audit-extended swap reason, strict retry, cache key v15.
- Add to `mem/index.md`.

### 5. Reset the affected scenes so the user can re-compose
Migration:
- Scenes `c7d4bb76-b20d-4591-bc13-6763fbdf52bd` and `f2a58546-692a-4ef5-a690-ba93b513abf5`: clear `reference_image_url`, `audioPlan.twoshot.anchor_face_audit`, `clip_url`, `lip_sync_status`, `twoshot_stage`, `clip_status`, `clip_error` so the next dispatch rebuilds the anchor with v111.
- No credit refund needed (lipsync succeeded — only the anchor face was wrong; the user explicitly liked the lipsync). If you want a goodwill refund anyway, say so and I'll add it.

## Out of scope (for now)
- Per-character single-portrait compose + ffmpeg stitch (heavier, leave for v112 if v111 still drifts).
- Replacing Nano Banana 2 with a different model.
- Auto-fixing drifted outfit covers (separate Stage-21 regen flow).

## Verification
- `compose-scene-anchor` log line shows `identityRefs=N` when v111 path is used.
- Audit returns `reason: "swap"` on a known bad render (manually re-running the previous anchor URL through the extended audit).
- After reset, re-running the 4-person scene produces an anchor where each character's face visibly matches their brand portrait, and the audit logs `ok=true`.

## Files touched
- `supabase/functions/compose-scene-anchor/index.ts`
- `supabase/functions/compose-video-clips/index.ts`
- `supabase/functions/_shared/identity-audit.ts`
- `mem/architecture/video-composer/anchor-identity-swap-v111.md` (new)
- `mem/index.md`
- new migration to reset the two affected scenes
