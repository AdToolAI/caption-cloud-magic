# Phase 3 — Shot Director: Dialog & Continuity

Build on existing infrastructure (`shotDirector.ts`, `AudioPlanSpeaker`, `replace_composer_scene_with_children` RPC, `ContinuityGuardianStrip`). No DB schema changes, no edge-function changes.

## 3.1 — Per-Dialog-Turn Shot Direction

**Data model** — extend `AudioPlanSpeaker` (`src/types/video-composer.ts:554`) with optional `shotDirector?: Partial<ShotSelection>`. Stored inside the existing `composer_scenes.audio_plan` JSONB — no migration.

**UI** — in `SceneDialogStudio.tsx`, render a compact `<ShotDirectorChip>` per dialog line (next to existing `DialogTakeStrip`). Opens a popover with the 4 main axes (framing / angle / movement / lighting). Empty = inherit scene defaults.

**Prompt injection** — in `composeFinalPrompt.ts:168`, after the scene-level `[3 SHOT]` block, when `audioPlan?.speakers?.some(s => s.shotDirector)`, append a per-turn block:
```
[6 DIALOG SHOTS]
@0.00s (Sarah): medium close-up, low angle
@2.40s (Samuel): over-the-shoulder, eye level
```
Wrapped via new helper `src/lib/shotDirector/buildPerTurnShotBlock.ts`. Pure additive — falls through to existing behavior when no per-turn overrides exist.

**Scope guardrail** — only affects SRS / cinematic-sync pipelines that spawn per-turn sub-scenes. Single-clip native-dialogue models (HappyHorse/Veo/Kling Omni) get the block as soft hints. Documented in code comments.

## 3.2 — Multi-Shot Continuity Engine

**New util** — `src/lib/shotDirector/cinematicContinuityRules.ts`:
- `check180Rule(prev, next)` — flags when two consecutive close-ups both use `over-the-shoulder` from the same `angle` family (likely line-crossing)
- `checkEyelineMatch(prev, next)` — warns when angle jumps low → high or vice versa between two close-ups of the same character set
- `checkReverseShotPair(prev, next)` — confirms valid OTS-A → OTS-B reverse pattern, returns a positive `ok` signal
- `checkJumpCut(prev, next)` — flags identical framing+angle on same subject (jump cut)

Returns `{ severity: 'info' | 'warn' | 'error', rule, message }[]`.

**Wiring** — in `ContinuityGuardianStrip.tsx`, where `pairs` is already iterated (line ~65), add a parallel `cinematicWarnings = pairs.map(p => runCinematicRules(p.prev, p.next))`. Render small icon chips next to the existing visual drift indicator; click opens a tooltip with the rule explanation and a "Swap angle" quick-fix that updates `next.shotDirector`.

**No new columns** — warnings are derived at render time from `composer_scenes.shot_director`.

## 3.3 — Auto-Coverage

**New util** — `src/lib/shotDirector/spawnCoverageScenes.ts`:
```
buildCoveragePartials(scene): Partial<ComposerScene>[]
```
Given a dialog scene with N speakers (from `audioPlan.speakers` or `dialogScript` parse), returns:
1. **Master** — `framing: 'wide'`, `movement: 'static'`, inherits scene aiPrompt + `MASTER SHOT`
2. **OTS-A** — `framing: 'medium-close'`, `angle: 'over-shoulder'`, `character_shots: [speaker1]`
3. **OTS-B** — same for speaker2
4. **Insert** — single-character close-up per additional speaker

All tagged `cinematic_preset_slug = 'coverage:<parentSceneId>'` for idempotent re-spawn / cleanup (mirroring existing SRS pattern).

**UI** — add a "✨ Auto-Coverage" button to `SceneShotDirectorPanel` (visible only on scenes with ≥1 speaker). Calls `insertScenesAfter(scene.id, partials, { removeParent: false })`. Toast confirms N scenes added.

**Idempotency** — before insert, check existing sibling scenes for `cinematic_preset_slug LIKE 'coverage:${parentId}'`; if present, prompt user to "Replace existing coverage" (passes `removeParent: false` + deletes prior coverage children first).

## 3.4 — Memory + Localization

- `mem://features/video-composer/per-turn-shot-direction-and-continuity` — new entry describing per-turn override, continuity rule set, coverage spawning.
- Localized strings (EN/DE/ES) for new chips, buttons, rule messages.

---

## Files to create

```text
src/lib/shotDirector/buildPerTurnShotBlock.ts
src/lib/shotDirector/cinematicContinuityRules.ts
src/lib/shotDirector/spawnCoverageScenes.ts
src/components/video-composer/PerTurnShotChip.tsx
mem/features/video-composer/per-turn-shot-direction-and-continuity.md
```

## Files to edit

```text
src/types/video-composer.ts                     (add shotDirector to AudioPlanSpeaker)
src/lib/motion-studio/composeFinalPrompt.ts     (inject per-turn shot block)
src/components/video-composer/SceneDialogStudio.tsx  (PerTurnShotChip per line)
src/components/video-composer/ContinuityGuardianStrip.tsx  (cinematic rule chips)
src/components/video-composer/SceneShotDirectorPanel.tsx   (Auto-Coverage button)
mem/index.md                                    (register new memory)
```

## Out of scope (deferred)

- `screenDirection` enum on `ShotSelection` for hard 180°-line enforcement → would need migration + UI rework. Phase 3 uses heuristic warnings only.
- Updating `replace_composer_scene_with_children` RPC to carry `dialog_takes` / `audio_plan` → coverage scenes get fresh dialog state, which is the desired behavior anyway.
- Edge-function changes — none. All work is client-side prompt assembly + scene CRUD.

## Risk / impact

- **Additive only** — every existing scene without per-turn overrides renders identically.
- **No credit-cost changes** — prompt-suffix work is free; auto-coverage charges per spawned scene at normal Composer rates.
- **Reversible** — auto-coverage scenes are tagged + can be bulk-deleted by `cinematic_preset_slug` LIKE filter.
