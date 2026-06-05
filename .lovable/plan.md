## Goal

Lock the working ≤4-speaker Lip-Sync / Cinematic-Sync pipeline so future Motion Studio refactors cannot silently break it. No behavior changes — only guardrails.

## Why now

We just went through v54 → v59 to make 3 and 4 speakers stable. The fix surface touched: `compose-dialog-segments`, `sync-so-webhook`, `compose-video-clips` (locked-plate prompt), `StoryboardTab`, `CastConsistencyMap`, `TalkingHeadDialog`, plus the v58 multipass + v59 state-carryover invariants. Any of these can be regressed by an unrelated edit.

## Protection layers

### 1. Frozen-Invariants document (single source of truth)
New file `mem/architecture/lipsync/FROZEN-INVARIANTS.md` listing the non-negotiable rules:
- v58 multipass = only stable path for ≥3 speakers
- `useV41Official` gate must stay `(speakers < 3 || isAdvance) && !stateMultipassAttempted`
- `force_multipass` + `multipass_fallback_attempted` markers are sticky
- Locked-camera negative prompt block must stay in `neutralTwoShotPrompt`
- Multi-speaker auto-ASD fallback in webhook stays disabled (`speaker_refs.length >= 2`)
- N-slot face map hard-capped at `MAX_SPEAKERS = 4`
- Portrait composition hard-capped at 4 faces
- Storyboard must filter cast via `safeCharacters` before render
- All string fields from DB/LLM lowercased via `safeLower()` only

Each rule references the memory file that explains it.

### 2. Code-level pinning
Add `// FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md` markers at the exact call sites that must not drift:
- `compose-dialog-segments/index.ts` → `useV41Official` decision + state-carryover block
- `sync-so-webhook/index.ts` → multi-speaker ASD guard + v5 retry re-dispatch body
- `compose-video-clips/index.ts` → `neutralTwoShotPrompt` locked-camera sentence + `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE`
- `StoryboardTab.tsx` → `safeCharacters` useMemo
- `twoshot-face-map.ts` → `MAX_SPEAKERS = 4`

### 3. Runtime regression guards (assertions, not behavior change)
- `compose-dialog-segments`: throw early if a state write would drop `force_multipass`/`multipass_fallback_attempted` while previous state had them. Logs `INVARIANT_VIOLATION_v59_state_carryover` and refunds.
- `sync-so-webhook`: throw early if `wantV56NoAsdRetry` is computed `true` while `speaker_refs.length >= 2`. Logs `INVARIANT_VIOLATION_v57_multispeaker_asd`.
- `compose-video-clips`: assert `neutralTwoShotPrompt` contains the literal `LOCKED static camera` token before dispatch.
- Frontend: `StoryboardTab` `console.error` (dev only) if it receives any character without `name?.trim()`.

These are cheap — they only fire on real regressions and produce a single greppable string.

### 4. Test harness pin
Add `tests/lipsync/pipeline-invariants.spec.ts` (unit-level, no Sync.so calls):
- Snapshot the `useV41Official` truth table for N=1..4 × {advance, !advance} × {multipass attempted, not}.
- Snapshot the v5 retry body shape (must include `force_multipass` when markers present).
- Snapshot the locked-camera prompt suffix and negative-list keywords.
- Snapshot `MAX_SPEAKERS` constant = 4.

CI fails on any drift; intentional changes require updating the snapshot AND the FROZEN-INVARIANTS doc in the same commit.

### 5. Memory index update
- Promote one new Core rule: *"Lip-Sync pipeline (≤4 speakers) is frozen — see FROZEN-INVARIANTS before touching compose-dialog-segments, sync-so-webhook, compose-video-clips, twoshot-face-map, or StoryboardTab cast handling."*
- Add `[Frozen Invariants](mem://architecture/lipsync/FROZEN-INVARIANTS)` to the Memories section.

## What is explicitly NOT in scope

- No code-path changes, no provider swaps, no prompt rewording.
- No N≥5 work — hard cap stays at 4.
- No migration off v58 multipass.
- No Sync.so segments[] retry experiments.

## Open questions

1. Runtime assertions in production: **hard-throw + refund** (safest, what I'd recommend) or **soft-log only** (zero risk of new failure modes)?
2. Add the test harness now, or only the doc + code markers + runtime guards (test file deferred until CI has spare budget)?
