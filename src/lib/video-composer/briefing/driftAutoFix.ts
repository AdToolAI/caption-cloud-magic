/**
 * driftAutoFix — pure builder that turns a DriftReport into a minimal,
 * SAFE patch set for ComposerScenes. Never touches lip-sync, cast, or
 * scene-count; only fills demonstrably safe fields.
 *
 * Safe-list (whitelist — anything else is excluded by design):
 *  - `durationSeconds`   (when plan duration differs and scene is not lip-sync)
 *  - `aiPrompt`          (only when scene aiPrompt is empty or < 8 chars)
 *
 * Explicitly EXCLUDED (Lipsync-Bridge / Identity-Bridge protection):
 *  - cast / characterShots / character anchors
 *  - voiceover.* (nested config coupled to take-system)
 *  - dialogMode / engineOverride / dialog_shots / syncso_*
 *  - scene add/remove
 */

import type { TProductionPlan, TPlanScene } from './productionPlan';
import type { ComposerScene } from '@/types/video-composer';
import type { DriftFinding } from './driftDetector';

export interface ScenePatch {
  sceneId: string;
  sceneIndex: number;
  patch: Partial<ComposerScene>;
  fieldsFixed: string[];
  /** Human-readable before/after for the diff preview. */
  diff: Array<{ field: string; before: string; after: string }>;
}

export interface AutoFixPlan {
  patches: ScenePatch[];
  skipped: DriftFinding[];
  fixableCount: number;
}

const SAFE_FIELDS = new Set(['durationSec', 'aiPrompt']);

function isLipsyncScene(s: ComposerScene): boolean {
  if ((s as any).dialogMode === true) return true;
  const eo = (s as any).engineOverride;
  return eo === 'cinematic-sync' || eo === 'sync-segments' || eo === 'native-dialogue' || eo === 'sync-polish';
}

export function buildAutoFixPlan(
  plan: TProductionPlan,
  scenes: ComposerScene[],
  findings: DriftFinding[],
): AutoFixPlan {
  const planScenes = [...(plan.scenes ?? [])].sort((a, b) => a.index - b.index);
  const sortedScenes = [...scenes].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  // Map scene-index (1-based) → patch accumulator
  const patchMap = new Map<number, ScenePatch>();
  const skipped: DriftFinding[] = [];

  const getOrCreate = (idx: number): ScenePatch | null => {
    const ps = planScenes[idx - 1];
    const ss = sortedScenes[idx - 1];
    if (!ps || !ss) return null;
    let entry = patchMap.get(idx);
    if (!entry) {
      entry = { sceneId: ss.id, sceneIndex: idx, patch: {}, fieldsFixed: [], diff: [] };
      patchMap.set(idx, entry);
    }
    return entry;
  };

  for (const f of findings) {
    // Plan-level finding (scene count) → never auto-fixable
    if (f.sceneIndex == null) {
      skipped.push(f);
      continue;
    }
    if (!SAFE_FIELDS.has(f.field)) {
      skipped.push(f);
      continue;
    }

    const ps: TPlanScene | undefined = planScenes[f.sceneIndex - 1];
    const ss: ComposerScene | undefined = sortedScenes[f.sceneIndex - 1];
    if (!ps || !ss) {
      skipped.push(f);
      continue;
    }

    // Hard skip: lip-sync scenes — touching duration/prompt risks the sync window.
    if (isLipsyncScene(ss)) {
      skipped.push({ ...f, message: f.message + ' (übersprungen: Lip-Sync-Szene)' });
      continue;
    }

    const entry = getOrCreate(f.sceneIndex);
    if (!entry) {
      skipped.push(f);
      continue;
    }

    if (f.field === 'durationSec') {
      const target = Number(ps.durationSec) || 0;
      const current = Number(ss.durationSeconds) || 0;
      if (target > 0 && Math.abs(target - current) > 0.5) {
        entry.patch.durationSeconds = target;
        entry.fieldsFixed.push('durationSeconds');
        entry.diff.push({ field: 'Dauer', before: `${current}s`, after: `${target}s` });
      } else {
        skipped.push(f);
      }
      continue;
    }

    if (f.field === 'aiPrompt') {
      const target = (ps.anchorPromptEN ?? '').trim();
      const current = String(ss.aiPrompt ?? '').trim();
      // Only fill when empty/near-empty — NEVER overwrite a real prompt.
      if (target && current.length < 8) {
        entry.patch.aiPrompt = target;
        entry.fieldsFixed.push('aiPrompt');
        entry.diff.push({
          field: 'AI-Prompt',
          before: current || '(leer)',
          after: target.length > 80 ? target.slice(0, 80) + '…' : target,
        });
      } else {
        skipped.push({ ...f, message: f.message + ' (übersprungen: vorhandener Prompt bleibt erhalten)' });
      }
      continue;
    }
  }

  const patches = Array.from(patchMap.values()).filter((p) => p.fieldsFixed.length > 0);
  return { patches, skipped, fixableCount: patches.reduce((n, p) => n + p.fieldsFixed.length, 0) };
}
