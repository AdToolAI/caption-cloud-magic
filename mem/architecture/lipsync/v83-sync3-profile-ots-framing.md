---
name: v83 sync-3 Profile/OTS Framing Allowed (Phase 2.2)
description: neutralTwoShotPrompt no longer forces "clean front or three-quarter angle" for n=1 and n=2. Profile and over-the-shoulder framings are now explicitly allowed because sync-3 handles profile + partial occlusion natively. n>=3 group framing unchanged (still needs orderly equal-share line for slot-based ASD). Frozen invariant I.4 (LOCKED static camera tail + framing-change negative prompts) untouched.
type: architecture
---

# v83 — sync-3 Profile/OTS framing allowed (June 2026, Phase 2.2)

## What changed
`supabase/functions/compose-video-clips/index.ts` `neutralTwoShotPrompt`
visibility clauses for `n === 1` and `n === 2`:
- n=1: now "clean front, three-quarter **or natural profile angle**" with a
  parenthetical "(sync-3 handles profile and partial-occlusion natively)".
- n=2: now "front, three-quarter, profile **or over-the-shoulder** angles
  are all acceptable" — was previously frontal/three-quarter only.
- n>=3: unchanged. Group framing must stay orderly horizontal line so
  slot-based ASD (and v82 `bbox-url-pro` per-frame boxes) keep mapping
  each speaker to a stable plate region.

## Why
sync-3 (Sync.so default since June 2026) supports profile + partial
occlusion + still-frame natively. Hard-pinning Hailuo to frontal/three-
quarter only cost us natural staging (OTS reaction shots, profile two-
shots) without any lip-sync benefit on sync-3. Loosening matches plan
Phase 2.2 ("Frontal-Zwang lockern, Profile/OTS erlaubt").

## Explicitly NOT done (and why)
- **Did NOT add the "speaking naturally with subtle mouth/jaw movement"
  suffix** that plan 2.2 mentioned. That suffix directly contradicts the
  existing in-code warning ("do NOT instruct the model to keep lips
  closed or 'rest' the mouth posture... we only ask for a natural,
  lip-ready neutral expression... All 'no speech / no mouth flap'
  constraints live exclusively in the negative_prompt"). Reintroducing
  active mouth motion in the master plate brings back the ventriloquist
  /double-mouth artefact the v60 stabilization removed. The original
  rationale (still-frame artefacts on `lipsync-2-pro`) no longer applies
  because sync-3 is universal default since v62 and handles still frames
  natively.

## Frozen invariants — verified untouched
- I.4 LOCKED-camera master plate tail (`LOCKED static camera mounted on a
  tripod for the entire shot — no cuts, no zoom, ...`) — unchanged.
- `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` framing-change keyword list —
  unchanged.
- n>=3 ASD-critical "single horizontal line, equal screen share" framing
  — unchanged.

## Files
- edited `supabase/functions/compose-video-clips/index.ts`
