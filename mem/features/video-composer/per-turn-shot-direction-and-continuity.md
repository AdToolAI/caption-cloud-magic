---
name: Per-Turn Shot Direction, Continuity Engine & Auto-Coverage (Phase 3)
description: Composer dialog scenes carry per-speaker Shot Director overrides (`scene.directorModifiers.dialogShots[lineKey]` + `AudioPlanSpeaker.shotDirector`) that compose into a `[6 DIALOG SHOTS]` prompt block in composeFinalPrompt. ContinuityGuardianStrip surfaces heuristic continuity warnings (180° line, eyeline-mismatch, jump-cut, reverse-shot-ok) on top of the existing visual-drift score via `runCinematicContinuityRules`. A new "Auto-Coverage" action spawns Master + per-speaker OTS/close-up sibling scenes via `insertScenesAfter(scene.id, partials, { removeParent: false })`, tagged `cinematicPresetSlug = "coverage:<parentSceneId>"` for idempotent cleanup. Pure additive — no DB migrations, no edge function changes.
type: feature
---

# Phase 3 — Shot Director: Dialog & Continuity (June 2026)

## 3.1 Per-Turn Shot Direction

**Storage** (no migration):
- Pre-lock overlay: `scene.directorModifiers.dialogShots[lineKey] = Partial<ShotSelection>`
- Post-lock authoritative: `AudioPlanSpeaker.shotDirector` (typed addition to existing JSONB)

**Prompt injection** — `composeFinalPrompt` (`src/lib/motion-studio/composeFinalPrompt.ts`)
appends a `[6 DIALOG SHOTS]` block via `buildPerTurnShotBlock(plan, overlay)`:

```
[6 DIALOG SHOTS]
@0.00s (Sarah): medium close-up from chest up, shot from a low angle looking up, static locked-down camera
@2.40s (Samuel): over-the-shoulder shot, eye level, static locked-down camera
```

Always English (core rule). Single-clip native-dialogue models (Hailuo,
Kling Omni, Veo, HappyHorse) treat it as soft hints; SRS / cinematic-sync
spawned sub-scenes use it as authoritative per-clip Shot Direction.

**UI** — `PerTurnShotChip` (`src/components/video-composer/PerTurnShotChip.tsx`)
renders next to `DialogTakeStrip` per parsed `DialogBlock` in
`SceneDialogStudio`. 4 axes: framing / angle / movement / lighting.

## 3.2 Multi-Shot Continuity Engine

`src/lib/shotDirector/cinematicContinuityRules.ts` — pure heuristics on
consecutive `ComposerScene` pairs:

- `reverse-shot-ok` (info) — OTS-A → OTS-B on different primary subjects
- `line-cross-likely` (warn) — consecutive OTS on **same** subject
- `eyeline-mismatch` (warn) — close-up with low↔high angle flip on same subject
- `jump-cut` (warn) — identical framing + angle + subject

Each rule returns `{ severity, message, suggestedPatch }`. `ContinuityGuardianStrip` renders the warnings as small chips on each `CutChip` next to the existing drift score. The `suggestedPatch` powers a one-click "Apply" that mutates `next.shotDirector`.

**Hard 180° rule enforcement is deferred** — would need a `screenDirection`
enum on `ShotSelection`. Phase 3 ships heuristic warnings only.

## 3.3 Auto-Coverage

`src/lib/shotDirector/spawnCoverageScenes.ts` — `buildCoveragePartials(scene)`:

- N=1 cast → Master (wide) + 1× Close-up
- N=2 cast → Master (two-shot) + OTS-A + OTS-B
- N≥3 cast → Master (wide) + 1× Close-up per speaker (cap 4)

All partials tagged `cinematicPresetSlug = coverage:<parentSceneId>`.
Inserted via existing `insertScenesAfter(parentSceneId, partials,
{ removeParent: false })` RPC — keeps the dialog parent intact.

**Cleanup** — re-running Auto-Coverage deletes prior coverage children
matching the slug filter, then re-spawns (same pattern as the existing
`dialog-srs:*` cleanup in `SceneDialogStudio.handleGenerate`).

## What didn't change

- No DB migrations.
- No edge function changes (`compose-dialog-segments` only sees the final
  rolled-up prompt + audio_plan).
- No credit-cost changes — prompt-suffix work is free; auto-coverage spawns
  charge at normal Composer per-scene rates.
- Scenes without per-turn overrides render byte-for-byte identical to v82.

## Files

Created:
- `src/lib/shotDirector/buildPerTurnShotBlock.ts`
- `src/lib/shotDirector/cinematicContinuityRules.ts`
- `src/lib/shotDirector/spawnCoverageScenes.ts`
- `src/components/video-composer/PerTurnShotChip.tsx`

Edited:
- `src/types/video-composer.ts` (added `shotDirector?` to `AudioPlanSpeaker`)
- `src/lib/motion-studio/composeFinalPrompt.ts` (per-turn block injection)
- `src/components/video-composer/SceneDialogStudio.tsx` (chip + Auto-Coverage button)
- `src/components/video-composer/ContinuityGuardianStrip.tsx` (cinematic rule chips)
