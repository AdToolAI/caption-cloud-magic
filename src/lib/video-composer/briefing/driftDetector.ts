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
import { tx } from '@/lib/i18nText';

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
      message: tx({ de: 'Anzahl der Szenen weicht vom Plan ab.', en: 'Scene count differs from the plan.', es: 'El número de escenas difiere del plan.' }),
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
        message: tx({ de: 'Dauer weicht vom Plan ab.', en: 'Duration differs from the plan.', es: 'La duración difiere del plan.' }),
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
            ? tx({ de: `Cast weicht ab — fehlend: ${missing.length}, zusätzlich: ${extra.length}.`, en: `Cast differs — missing: ${missing.length}, extra: ${extra.length}.`, es: `El reparto difiere — faltan: ${missing.length}, adicionales: ${extra.length}.` })
            : missing.length
              ? tx({ de: `Cast unvollständig — ${missing.length} Charakter(e) aus dem Plan fehlen.`, en: `Cast incomplete — ${missing.length} character(s) from the plan are missing.`, es: `Reparto incompleto — faltan ${missing.length} personaje(s) del plan.` })
              : tx({ de: `Cast erweitert — ${extra.length} zusätzliche(r) Charakter(e) im Storyboard.`, en: `Cast extended — ${extra.length} additional character(s) in the storyboard.`, es: `Reparto ampliado — ${extra.length} personaje(s) adicionales en el storyboard.` }),
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
          ? tx({ de: 'Plan verlangt Lip-Sync, Szene ist aber B-Roll/HeyGen.', en: 'Plan requires lip-sync, but the scene is B-roll/HeyGen.', es: 'El plan requiere sincronización labial, pero la escena es B-roll/HeyGen.' })
          : tx({ de: 'Plan ist B-Roll, Szene rendert aber mit Lip-Sync.', en: 'Plan is B-roll, but the scene renders with lip-sync.', es: 'El plan es B-roll, pero la escena se renderiza con sincronización labial.' }),
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
        message: tx({ de: 'Skript aus dem Plan wurde NICHT in die Szene übernommen.', en: 'Script from the plan was NOT applied to the scene.', es: 'El guion del plan NO se aplicó a la escena.' }),
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
        message: tx({ de: `Shot-Director-Felder fehlen in der Szene: ${sdMissing.join(', ')}.`, en: `Shot-director fields are missing in the scene: ${sdMissing.join(', ')}.`, es: `Faltan campos de shot-director en la escena: ${sdMissing.join(', ')}.` }),
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
        message: tx({ de: 'Kein AI-Prompt in der Szene, obwohl der Plan einen Anchor-Prompt hat.', en: 'No AI prompt in the scene, even though the plan has an anchor prompt.', es: 'No hay prompt de IA en la escena, aunque el plan tiene un prompt ancla.' }),
        expected: planAnchor.slice(0, 80) + (planAnchor.length > 80 ? '…' : ''),
      });
      severity = escalate(severity, 'info');
    }

    // Stage-3: AI-fill aware severity. When the plan value came from
    // AI inference (listed in scene._meta.aiFilled) drop *_not_applied
    // findings to 'info' — the composer default is acceptable.
    const aiFilled = new Set<string>(
      (((ps as any)._meta?.aiFilled ?? []) as string[]),
    );
    const sevFor = (path: string, hard: 'warn' | 'error'): 'info' | 'warn' | 'error' =>
      aiFilled.has(path) ? 'info' : hard;

    // Stage-3: Transition propagation
    const planTrans = ps.transition?.type;
    const sceneTrans = (ss as any).cutStyle as string | undefined;
    if (planTrans && sceneTrans && planTrans !== sceneTrans) {
      const sev = sevFor('transition.type', 'warn');
      findings.push({
        sceneIndex: idx,
        field: 'transition.type',
        severity: sev,
        message: aiFilled.has('transition.type')
          ? tx({ de: 'Übergangstyp war KI-Vorschlag — Composer-Default greift, OK.', en: 'Transition type was an AI suggestion — composer default applies, OK.', es: 'El tipo de transición era una sugerencia de la IA — se aplica el valor predeterminado, OK.' })
          : tx({ de: 'Übergangstyp aus dem Plan wurde nicht 1:1 übernommen.', en: 'Transition type from the plan was not applied 1:1.', es: 'El tipo de transición del plan no se aplicó tal cual.' }),
        expected: planTrans,
        actual: sceneTrans,
      });
      severity = escalate(severity, sev);
    }

    // Stage-3: Text-overlay propagation
    const planOverlay = (ps.textOverlay?.text ?? '').trim();
    const sceneOverlay = String((ss as any).textOverlay?.text ?? '').trim();
    if (planOverlay && !sceneOverlay) {
      const sev = sevFor('textOverlay.text', 'warn');
      findings.push({
        sceneIndex: idx,
        field: 'textOverlay.text',
        severity: sev,
        message: aiFilled.has('textOverlay.text')
          ? tx({ de: 'Overlay war KI-Vorschlag und kam nicht durch — Composer rendert ohne, OK.', en: 'Overlay was an AI suggestion and did not come through — composer renders without it, OK.', es: 'La superposición era una sugerencia de la IA y no se aplicó — el composer renderiza sin ella, OK.' })
          : tx({ de: 'Burnt-in Text-Overlay aus dem Plan fehlt in der Szene.', en: 'Burnt-in text overlay from the plan is missing in the scene.', es: 'Falta la superposición de texto incrustada del plan en la escena.' }),
        expected: planOverlay.slice(0, 80) + (planOverlay.length > 80 ? '…' : ''),
        actual: '—',
      });
      severity = escalate(severity, sev);
    }

    // Stage-3: Seed propagation (never AI-inferred — always hard).
    const planSeed = ps.seed;
    const sceneSeed = (ss as any).seed;
    if (typeof planSeed === 'number' && sceneSeed != null && Number(sceneSeed) !== planSeed) {
      findings.push({
        sceneIndex: idx,
        field: 'seed',
        severity: 'warn',
        message: tx({ de: 'Plan-Seed weicht vom Storyboard-Seed ab — Render wäre nicht reproduzierbar.', en: 'Plan seed differs from the storyboard seed — the render would not be reproducible.', es: 'La semilla del plan difiere de la del storyboard — el render no sería reproducible.' }),
        expected: String(planSeed),
        actual: String(sceneSeed),
      });
      severity = escalate(severity, 'warn');
    }

    // Stage-3: Per-cast shotType override
    const planCastShots = (ps.cast ?? [])
      .filter((c) => c.characterId && c.shotType)
      .map((c) => ({ id: String(c.characterId).toLowerCase(), shotType: c.shotType }));
    if (planCastShots.length) {
      const sceneShots = ((ss as any).characterShots ?? []) as Array<{ characterId?: string; shotType?: string }>;
      const missing = planCastShots.filter((p) => {
        const match = sceneShots.find((sh) => String(sh.characterId ?? '').toLowerCase() === p.id);
        return !match || match.shotType !== p.shotType;
      });
      if (missing.length) {
        findings.push({
          sceneIndex: idx,
          field: 'cast.shotType',
          severity: 'info',
          message: tx({ de: 'Per-Cast Shot-Typ aus dem Plan wurde nicht übernommen.', en: 'Per-cast shot type from the plan was not applied.', es: 'El tipo de plano por personaje del plan no se aplicó.' }),
          expected: missing.map((m) => `${m.id.slice(0, 8)}=${m.shotType}`).join(' · '),
        });
        severity = escalate(severity, 'info');
      }
    }

    // Stage-3: Tone → realismPreset
    const planTone = (ps.tone ?? '').toLowerCase();
    const scenePreset = String((ss as any).realismPreset ?? '');
    if (planTone && !scenePreset) {
      findings.push({
        sceneIndex: idx,
        field: 'tone',
        severity: 'info',
        message: aiFilled.has('tone')
          ? tx({ de: 'Tone war KI-Vorschlag — kein Realism-Preset gemappt, Composer-Default greift.', en: 'Tone was an AI suggestion — no realism preset mapped, composer default applies.', es: 'El tono era una sugerencia de la IA — no se asignó un preset de realismo, se aplica el valor predeterminado.' })
          : tx({ de: 'Szene-Tone aus dem Plan ergab keinen Realism-Preset.', en: 'Scene tone from the plan did not yield a realism preset.', es: 'El tono de la escena del plan no generó un preset de realismo.' }),
        expected: planTone,
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
