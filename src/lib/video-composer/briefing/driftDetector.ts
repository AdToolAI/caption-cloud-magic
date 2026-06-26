/**
 * driftDetector — pure comparator between a saved ProductionPlan and the
 * current Composer storyboard (`ComposerScene[]`). Surfaces findings that
 * tell the user "this part of your briefing-plan did NOT make it into the
 * storyboard verbatim".
 *
 * Lipsync-safety: read-only. Never mutates plan or scenes; never touches
 * dialog_shots / syncso_* / composer_scenes.dialog_*. Output is metadata
 * the UI renders next to the storyboard.
 */

import type { TProductionPlan, TPlanScene } from './productionPlan';
import type { ComposerScene } from '@/types/video-composer';

export type DriftSeverity = 'info' | 'warn' | 'error';

export interface DriftFinding {
  sceneIndex: number | null; // 1-based, null for plan-level findings
  field: string;
  severity: DriftSeverity;
  message: string;
  expected?: string;
  actual?: string;
}

export interface DriftReport {
  severity: DriftSeverity | 'none';
  findings: DriftFinding[];
  planSceneCount: number;
  storyboardSceneCount: number;
  generatedAt: string;
}

function planEngineNeedsLipsync(s: TPlanScene): boolean {
  return s.lipSync === true || s.engine === 'cinematic-sync' || s.engine === 'sync-segments' || s.engine === 'native-dialogue';
}

function sceneHasLipsync(s: ComposerScene): boolean {
  if ((s as any).dialogMode === true) return true;
  const eo = s.engineOverride;
  return eo === 'cinematic-sync' || eo === 'sync-segments' || eo === 'native-dialogue' || eo === 'sync-polish';
}

function castIdsOfPlan(s: TPlanScene): string[] {
  return (s.cast ?? [])
    .map((c) => (c.characterId ? String(c.characterId).toLowerCase() : null))
    .filter((x): x is string => !!x)
    .sort();
}

function castIdsOfScene(s: ComposerScene): string[] {
  const shots = (s as any).characterShots as Array<{ characterId?: string; shotType?: string }> | undefined;
  const ids = (shots ?? [])
    .filter((sh) => sh && sh.shotType !== 'absent' && sh.characterId)
    .map((sh) => String(sh.characterId).toLowerCase());
  if (
    ids.length === 0 &&
    (s as any).characterShot?.characterId &&
    (s as any).characterShot?.shotType !== 'absent'
  ) {
    ids.push(String((s as any).characterShot.characterId).toLowerCase());
  }
  return Array.from(new Set(ids)).sort();
}

const escalate = (cur: DriftSeverity | 'none', next: DriftSeverity): DriftSeverity => {
  const rank: Record<string, number> = { none: 0, info: 1, warn: 2, error: 3 };
  return rank[next] > rank[cur] ? next : (cur as DriftSeverity);
};

export function detectPlanDrift(plan: TProductionPlan, scenes: ComposerScene[]): DriftReport {
  const findings: DriftFinding[] = [];
  let severity: DriftSeverity | 'none' = 'none';

  const planScenes = [...(plan.scenes ?? [])].sort((a, b) => a.index - b.index);
  const sortedScenes = [...scenes].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  // 1) Scene count
  if (planScenes.length !== sortedScenes.length) {
    findings.push({
      sceneIndex: null,
      field: 'scenes.count',
      severity: 'warn',
      message: 'Anzahl der Szenen weicht vom Plan ab.',
      expected: `${planScenes.length}`,
      actual: `${sortedScenes.length}`,
    });
    severity = escalate(severity, 'warn');
  }

  const pairs = Math.min(planScenes.length, sortedScenes.length);
  for (let i = 0; i < pairs; i++) {
    const ps = planScenes[i];
    const ss = sortedScenes[i];
    const idx = ps.index ?? i + 1;

    // Duration
    const planDur = Number(ps.durationSec) || 0;
    const sceneDur = Number((ss as any).durationSeconds) || 0;
    if (planDur && Math.abs(planDur - sceneDur) > 0.5) {
      findings.push({
        sceneIndex: idx,
        field: 'durationSec',
        severity: 'info',
        message: 'Dauer weicht vom Plan ab.',
        expected: `${planDur}s`,
        actual: `${sceneDur}s`,
      });
      severity = escalate(severity, 'info');
    }

    // Cast
    const planCast = castIdsOfPlan(ps);
    const sceneCast = castIdsOfScene(ss);
    const missing = planCast.filter((id) => !sceneCast.includes(id));
    const extra = sceneCast.filter((id) => !planCast.includes(id));
    if (missing.length || extra.length) {
      findings.push({
        sceneIndex: idx,
        field: 'cast',
        severity: 'warn',
        message:
          missing.length && extra.length
            ? `Cast weicht ab — fehlend: ${missing.length}, zusätzlich: ${extra.length}.`
            : missing.length
              ? `Cast unvollständig — ${missing.length} Charakter(e) aus dem Plan fehlen.`
              : `Cast erweitert — ${extra.length} zusätzliche(r) Charakter(e) im Storyboard.`,
        expected: planCast.join(', ') || '—',
        actual: sceneCast.join(', ') || '—',
      });
      severity = escalate(severity, 'warn');
    }

    // Lip-sync intent
    const planLs = planEngineNeedsLipsync(ps);
    const sceneLs = sceneHasLipsync(ss);
    if (planLs !== sceneLs) {
      findings.push({
        sceneIndex: idx,
        field: 'lipSync',
        severity: 'warn',
        message: planLs
          ? 'Plan verlangt Lip-Sync, Szene ist aber B-Roll/HeyGen.'
          : 'Plan ist B-Roll, Szene rendert aber mit Lip-Sync.',
        expected: planLs ? 'lipsync' : 'broll',
        actual: sceneLs ? 'lipsync' : 'broll',
      });
      severity = escalate(severity, 'warn');
    }

    // Voiceover / dialog-script text presence.
    // useApplyProductionPlan writes plan voiceover.text → scene.dialogScript
    // (for lipsync) or → scene.voiceoverText (for B-Roll), so check both.
    const planVo = (ps.voiceover?.text ?? '').trim();
    const sceneVo = String(
      (ss as any).dialogScript ??
      (ss as any).voiceoverText ??
      (ss as any).vo?.text ??
      ''
    ).trim();
    if (planVo && !sceneVo) {
      findings.push({
        sceneIndex: idx,
        field: 'voiceover.text',
        severity: 'error',
        message: 'Skript aus dem Plan wurde NICHT in die Szene übernommen.',
        expected: planVo.slice(0, 80) + (planVo.length > 80 ? '…' : ''),
        actual: '—',
      });
      severity = escalate(severity, 'error');
    }

    // Shot-Director (Framing / Movement / Lighting) — must propagate.
    const planSD = ps.shotDirector ?? {};
    const sceneSD = ((ss as any).shotDirector ?? {}) as Record<string, unknown>;
    const sdFields: Array<keyof typeof planSD> = ['framing', 'angle', 'movement', 'lighting'];
    const sdMissing = sdFields.filter((f) => planSD[f] && !sceneSD[f as string]);
    if (sdMissing.length) {
      findings.push({
        sceneIndex: idx,
        field: 'shotDirector',
        severity: 'warn',
        message: `Shot-Director-Felder fehlen in der Szene: ${sdMissing.join(', ')}.`,
        expected: sdMissing.map((f) => `${f}=${planSD[f]}`).join(' · '),
        actual: sdMissing.map((f) => `${f}=${sceneSD[f as string] ?? '—'}`).join(' · '),
      });
      severity = escalate(severity, 'warn');
    }

    // Anchor prompt presence
    const planAnchor = (ps.anchorPromptEN ?? '').trim();
    const scenePrompt = String((ss as any).aiPrompt ?? '').trim();
    if (planAnchor && scenePrompt.length < 8) {
      findings.push({
        sceneIndex: idx,
        field: 'aiPrompt',
        severity: 'info',
        message: 'Kein AI-Prompt in der Szene, obwohl der Plan einen Anchor-Prompt hat.',
        expected: planAnchor.slice(0, 80) + (planAnchor.length > 80 ? '…' : ''),
      });
      severity = escalate(severity, 'info');
    }
  }

  return {
    severity,
    findings,
    planSceneCount: planScenes.length,
    storyboardSceneCount: sortedScenes.length,
    generatedAt: new Date().toISOString(),
  };
}

export function severityBadgeClass(sev: DriftReport['severity']): string {
  switch (sev) {
    case 'error': return 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'warn':  return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'info':  return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    default:      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  }
}
