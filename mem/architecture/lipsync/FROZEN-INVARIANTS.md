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

## I.1 — Chained per-speaker multipass is the only stable path for every N≥2

The Sync.so `segments[]` payload (model `sync-3` or `lipsync-2-pro`) returns
`provider_unknown_error` on most real plates regardless of speaker count.
The per-speaker chained v5 fan-out (one Sync.so call per speaker, audio of
the others muted, output of pass N feeds pass N+1) is the only path that
holds. **v60 (June 2026) extends this rule from N≥3 to N≥2** — there is no
longer a v56 first attempt and no parallel fan-out for 2-speaker scenes.

- Enforced: `supabase/functions/compose-dialog-segments/index.ts` `useV41Official` gate (~L820–840) is hard-pinned `false` for every multi-speaker dispatch; `fanOutAllowed = false` (~L2418) for every passes.length.
- Background: `mem://architecture/lipsync/v60-unified-multispeaker-pipeline`, `mem://architecture/lipsync/v58-multispeaker-multipass-fallback`

## I.2 — `useV41Official` gate stays disabled for multi-speaker

```
useV41Official = debugForceV56 && (isV41Retry || !isAdvance)
// debugForceV56 = body?.force_v56 === true && speakers.length === 1
```

`useV41Official` MUST never be true for `speakers.length >= 2`. The
`force_v56` body flag is a single-speaker debug hook only — no production
codepath sets it. Re-enabling the v56 `segments[]` dispatch for multi-
speaker scenes resurrects the `provider_unknown_error` loop v60 removed.

- Enforced: `supabase/functions/compose-dialog-segments/index.ts` ~L832
- Background: `mem://architecture/lipsync/v59-multipass-state-carryover`, `mem://architecture/lipsync/v60-unified-multispeaker-pipeline`

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

## I.9 — No parallel fan-out for any speaker count (v60)

`fanOutAllowed` in `compose-dialog-segments` MUST stay `false`. Pass 1..N-1
are chained serially by `sync-so-webhook` on each COMPLETE event via
`pendingIdxs[0]`. The historical 2-speaker parallel fan-out caused the same
dispatch race v33 already removed for N≥3 (two pass-0 jobs within ms, the
later one logged as `job ... not in passes[]`). v60 unified the rule:
**one Sync.so job per scene at any moment, regardless of N**.

- Enforced: `supabase/functions/compose-dialog-segments/index.ts` ~L2418
- Background: `mem://architecture/lipsync/v60-unified-multispeaker-pipeline`

## I.10 — sync-3 is the default model for N≥2 chained passes (v61)

The chained per-speaker pipeline feeds Sync.so a LOCKED Hailuo plate where
the mouth never moves until lip-sync paints it. `lipsync-2-pro` requires
natural speaking motion ("Still Frame Limitation" per
https://sync.so/docs/models/lipsync) and silently returns
`provider_unknown_error` on such plates. `sync-3` has built-in obstruction
detection and can open closed lips — it is Sync.so's recommended model
for static / multi-person / occluded inputs.

Rules:
- `speakers.length >= 2` AND `retryVariant in {coords-pro, coords-pro-box}`
  → model MUST be `sync-3`.
- `speakers.length === 1` AND `retryVariant === coords-pro` → model MUST
  stay `lipsync-2-pro` (single-speaker plates carry natural motion).
- `coords-pro-lp2pro` is the dedicated retry variant that forces
  `lipsync-2-pro` on the proven point-coord ASD shape. It MUST stay in
  the webhook ladder as the final fallback before refunding for N≥2,
  preserving the historically successful chained-lipsync-2-pro path.
- `syncOptions` MUST NOT add `temperature` or `occlusion_detection_enabled`
  (sync-3 ignores both — see `mem://architecture/lipsync/v54-sync3-official-segments`).

- Enforced: `supabase/functions/compose-dialog-segments/index.ts` ~L1993-2020
  (`payloadModel` picker), ~L1922 (ASD branch); `supabase/functions/sync-so-webhook/index.ts` ~L67 (`V5_RETRY_VARIANTS`), ~L1057-1083 (multi-speaker escalation ladder).
- Background: `mem://architecture/lipsync/v61-sync3-default-multispeaker`

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
