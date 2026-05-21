/**
 * twoshot diagnostics helper — appends a small ring-buffer of state-change
 * events to `composer_scenes.audio_plan.twoshot.diagnostics[]` so we can
 * reconstruct what happened to a scene without scraping edge-function logs.
 *
 * Used by compose-twoshot-lipsync, poll-twoshot-lipsync and
 * twoshot-lipsync-watchdog. Keep the payload tiny — at most 20 entries.
 */

export type TwoshotDiagSource = "compose" | "poll" | "watchdog" | "client";

export interface TwoshotDiagEvent {
  at: string;
  source: TwoshotDiagSource;
  event: string;
  stage?: string | null;
  status?: string | null;
  jobId?: string | null;
  reason?: string | null;
}

const MAX_ENTRIES = 20;

export async function appendTwoshotDiag(
  supabase: any,
  sceneId: string,
  evt: Omit<TwoshotDiagEvent, "at"> & { at?: string },
): Promise<void> {
  try {
    const { data: row } = await supabase
      .from("composer_scenes")
      .select("audio_plan")
      .eq("id", sceneId)
      .single();
    const plan = (row?.audio_plan ?? {}) as Record<string, any>;
    const twoshot = (plan.twoshot ?? {}) as Record<string, any>;
    const prev = Array.isArray(twoshot.diagnostics) ? twoshot.diagnostics : [];
    const next = [
      ...prev,
      {
        at: evt.at ?? new Date().toISOString(),
        source: evt.source,
        event: evt.event,
        stage: evt.stage ?? null,
        status: evt.status ?? null,
        jobId: evt.jobId ?? null,
        reason: evt.reason ? String(evt.reason).slice(0, 300) : null,
      },
    ].slice(-MAX_ENTRIES);

    await supabase
      .from("composer_scenes")
      .update({
        audio_plan: { ...plan, twoshot: { ...twoshot, diagnostics: next } },
      })
      .eq("id", sceneId);
  } catch (e) {
    // Diagnostics must never break the pipeline.
    console.warn(
      `[twoshot-diag ${sceneId}] append failed (non-fatal):`,
      (e as Error).message,
    );
  }
}
