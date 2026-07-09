/**
 * Fire-and-forget Telemetrie für `finalizePlanCanonical` Reparaturen.
 *
 * Wird beim Apply eines Production-Plans aufgerufen und schreibt in
 * `plan_repair_events` — nur wenn tatsächlich etwas repariert wurde oder
 * der Plan strukturell inkonsistent bleibt. Fehler werden bewusst
 * geschluckt, Telemetrie darf den Apply niemals blockieren.
 */
import { supabase } from '@/integrations/supabase/client';
import type { TProductionPlan } from './productionPlan';
import type { PlanNormalization } from './finalizePlanCanonical';

export async function logPlanRepairEvent(
  plan: TProductionPlan,
  normalization: PlanNormalization,
  projectId: string | null,
): Promise<void> {
  try {
    // Nur loggen, wenn es etwas Interessantes gibt.
    if ((normalization.repairLog?.length ?? 0) === 0 && normalization.consistent) return;

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;

    const meta = (plan as any)?._meta ?? {};
    const fidelityMode =
      typeof meta?.fidelity?.mode === 'string' ? String(meta.fidelity.mode) : null;
    const scriptTimingMode =
      typeof meta?.script_timing?.mode === 'string' ? String(meta.script_timing.mode) : null;

    await (supabase as any)
      .from('plan_repair_events')
      .insert({
        user_id: uid,
        project_id: projectId ?? null,
        duration_source: normalization.durationSource,
        scene_count: normalization.sceneCount,
        total_duration_sec: normalization.totalDurationSec,
        previous_total: normalization.previousTotal ?? null,
        previous_sum: normalization.previousSum ?? null,
        consistent: normalization.consistent,
        repair_kinds: (normalization.repairLog ?? []).map((r) => r.kind),
        repair_log: normalization.repairLog ?? [],
        actions: normalization.actions ?? [],
        fidelity_mode: fidelityMode,
        script_timing_mode: scriptTimingMode,
      });
  } catch (err) {
    // Telemetrie ist optional — niemals den Flow brechen.
    console.warn('[logPlanRepairEvent] skipped', err);
  }
}
