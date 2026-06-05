---
name: Lip-Sync Pipeline Frozen Invariants (≤4 speakers)
description: Single source of truth for the rules that MUST stay true after the v54→v59 stabilization. Any refactor in Motion Studio, Composer or the dialog edge functions must preserve every rule listed here. Each rule lists where it is enforced and which memory documents the reasoning.
type: constraint
---

# Lip-Sync Pipeline — Frozen Invariants (1–4 speakers)

The pipeline shipped after v59 produces stable lip-sync for 1, 2, 3 and 4
speaker scenes. The fix surface touched many seemingly-unrelated files
(prompt builders, webhook retry logic, frontend cast filtering). The
following invariants are the load-bearing pieces — do **not** change any
of them without explicit approval AND a corresponding update to this file.

Every load-bearing call site is annotated with:

```
// FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md
```

Grep for that string before touching the area.

---

## I.1 — v58 multipass is the only stable path for ≥3 speakers

The Sync.so `segments[]` payload returns `provider_unknown_error` on most
3+ speaker plates regardless of model (`sync-3` or `lipsync-2-pro`). The
per-speaker chained v5 fan-out (one Sync.so call per speaker, audio of
the others muted, output of pass N feeds pass N+1) is the only path that
holds.

- Enforced: `supabase/functions/compose-dialog-segments/index.ts` ~L820–840
- Background: `mem://architecture/lipsync/v58-multispeaker-multipass-fallback`

## I.2 — `useV41Official` gate

```
useV41Official =
  !forceMultipass &&
  !stateForcesMultipass &&
  !stateMultipassAttempted &&   // v59 — sticky
  speakers.length >= 3 &&
  (isV41Retry || !isAdvance);
```

Never relax any of these clauses. In particular `!stateMultipassAttempted`
is the v59 stickiness rule — once multipass fired for a scene, no later
retry may re-enter the segments[] path.

- Enforced: `supabase/functions/compose-dialog-segments/index.ts` ~L830
- Background: `mem://architecture/lipsync/v59-multipass-state-carryover`

## I.3 — Multipass markers are sticky across state writes

Every write of the v5 `state` object MUST carry over from the previous
state (or body flag):
- `force_multipass`
- `multipass_fallback_attempted`
- `multipass_fallback_reason` (when present)

Dropping any of them lets a failing pass-0 re-trigger v58, refund credits,
and loop forever (the bug we shipped in v58 and fixed in v59).

- Enforced: `supabase/functions/compose-dialog-segments/index.ts` ~L2253–2296
- Webhook retry body must also include `force_multipass: true` when markers
  are present: `supabase/functions/sync-so-webhook/index.ts` v5 retry path.

## I.4 — Locked-camera master plate

The `neutralTwoShotPrompt` builder MUST end with the literal phrase
`LOCKED static camera mounted on a tripod for the entire shot`. The
negative prompt block `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` MUST list
every framing-change keyword (cut, zoom, push-in, pull-out, dolly, pan,
tilt, whip pan, close-up insert, reframe, shot change, second camera,
multi-camera, picture-in-picture).

Without these, Hailuo/Kling/Wan i2v invent mid-clip pushes-ins or
inserts that wreck ASD and produce wrong-face audio mapping.

- Enforced: `supabase/functions/compose-video-clips/index.ts`
  `neutralTwoShotPrompt` (~L606–630) and
  `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` (~L353).
- Background: `mem://architecture/lipsync/v57-locked-plate-and-multispeaker-asd-guard`

## I.5 — No auto-ASD fallback for ≥2 speakers

`wantV56NoAsdRetry` MUST stay gated on `!isMultiSpeaker`
(`speaker_refs.length >= 2` disables it). For multi-speaker scenes the
manual-ASD coords are the only thing keeping audio bound to the right
face — falling back to auto-ASD on a stray close-up pastes the wrong
speaker's voice onto whichever mouth Sync.so finds.

- Enforced: `supabase/functions/sync-so-webhook/index.ts` ~L500–510
- Background: `mem://architecture/lipsync/v57-locked-plate-and-multispeaker-asd-guard`

## I.6 — Hard cap at 4 speakers

`MAX_SPEAKERS = 4` in `supabase/functions/_shared/cast-validation.ts`.
Reasons:
- Multi-portrait Nano Banana 2 composition becomes unreliable above 4 faces.
- Per-speaker chained Sync.so passes scale linearly in latency.
- ASD face-map confidence drops sharply when 5+ faces share a 16:9 plate.

Do not raise this constant without a dedicated N=5 hardening pass.

## I.7 — Frontend cast must be sanitized before render

`StoryboardTab` MUST pass `safeCharacters` (filtered for non-empty
`name`) — not the raw `characters` prop — to every child
(`useGenerateAllClips`, `useSceneGenerate`, `CastConsistencyMap`,
`SceneCard`, `SceneAvatarMode`, `TalkingHeadDialog`). One nameless
library entry used to throw `Cannot read properties of undefined (reading
'toLowerCase')` deep in the storyboard tree and replace the whole tab
with the global error boundary.

- Enforced: `src/components/video-composer/StoryboardTab.tsx` `safeCharacters` useMemo (~L94).

## I.8 — `safeLower()` is the only allowed lowercasing path for DB/LLM strings

Any string field arriving from `brand_characters`, `brand_locations`,
`scene_director_cache`, or any Lovable-AI tool output MUST go through
`safeLower()` / `safeFirstNameLower()` from
`src/lib/motion-studio/strings.ts` before `.toLowerCase()`. Direct
`.toLowerCase()` calls on those values are a regression.

---

## Code annotation contract

The literal string `FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md`
appears at every load-bearing site. Editors must:

1. Read this file before changing the surrounding code.
2. If the change is intentional, update the corresponding section here
   in the same commit.
3. If the change is unintentional, revert.

## Runtime guards (soft-log)

Three soft assertions exist in production. They never block a render —
they only emit a single greppable warning so a regression shows up in
edge-function logs immediately:

- `INVARIANT_VIOLATION_v59_state_carryover` — compose-dialog-segments
- `INVARIANT_VIOLATION_v57_multispeaker_asd` — sync-so-webhook
- `INVARIANT_VIOLATION_locked_camera_prompt` — compose-video-clips

If you see any of these in logs, you regressed an invariant in this file.
