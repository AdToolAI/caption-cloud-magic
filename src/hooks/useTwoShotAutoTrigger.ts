/**
 * Tab-unabhängiger Auto-Trigger für die Two-Shot/Cinematic-Sync Lip-Sync-Pipeline.
 *
 * Findet alle Szenen im Projekt mit:
 *   engine_override = 'cinematic-sync'
 *   clip_url        != null
 *   lip_sync_status IN (NULL, 'pending')
 *   lip_sync_applied_at IS NULL
 *
 * und feuert pro Szene `compose-twoshot-lipsync` (>=2 Sprecher) bzw.
 * `compose-lipsync-scene` (1 Sprecher). Vorher wird `lip_sync_status='running'`
 * gesetzt, damit derselbe Polling-Tick und parallele Tabs den Trigger nicht
 * doppelt auslösen.
 *
 * Pollt alle 8s, solange das Hook gemountet ist (Composer-Dashboard).
 * Identisch zur alten Logik in ClipsTab.tsx (Zeilen 276–335), aber jetzt
 * Tab-übergreifend — also auch im Voiceover-/Musik-/Export-Tab aktiv.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { emitPipelineEvent } from '@/lib/pipelineEvents';
import { extractFunctionsError } from '@/lib/functionsError';

const POLL_INTERVAL_MS = 8_000;

/**
 * Engines that share the dialog/lip-sync auto-trigger pipeline.
 *
 * `cinematic-sync-legacy` = explicit opt-in to the old v4 per-turn chain
 * (kept for backwards-compat / debugging). Everything else (`cinematic-sync`,
 * `sync-segments`) now routes to the v5 1-call Sync.so Segments dispatcher
 * — Artlist pattern: ONE API call with all segments[] processed in parallel
 * inside Sync.so, instead of 3 sequential per-turn calls.
 */
const DIALOG_ENGINES = new Set(['cinematic-sync', 'sync-segments', 'cinematic-sync-legacy']);
const isDialogEngine = (eo: any) => DIALOG_ENGINES.has(String(eo ?? ''));

function detectSpeakerCount(dialogScript: string): number {
  const set = new Set<string>();
  for (const line of String(dialogScript ?? '').split('\n')) {
    const m = line.match(/^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/);
    if (m) set.add(m[1].trim().toLowerCase());
  }
  return set.size;
}

function resolveSpeakerCount(scene: any): number {
  const scriptCount = detectSpeakerCount(scene.dialog_script ?? '');
  const planSpeakers = Array.isArray(scene.audio_plan?.speakers)
    ? scene.audio_plan.speakers.length
    : 0;
  const twoshotSpeakers = Array.isArray(scene.audio_plan?.twoshot?.speakers)
    ? scene.audio_plan.twoshot.speakers.length
    : 0;
  return Math.max(scriptCount, planSpeakers, twoshotSpeakers);
}

export function useTwoShotAutoTrigger(projectId: string | undefined) {
  const inflight = useRef<Set<string>>(new Set());
  const autoRetried = useRef<Set<string>>(new Set());
  const progressActive = useRef(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const { data, error } = await supabase
          .from('composer_scenes')
          .select('id, clip_url, clip_status, engine_override, lip_sync_status, lip_sync_applied_at, lip_sync_source_clip_url, dialog_script, audio_plan, dialog_shots, updated_at, clip_error, twoshot_stage, replicate_prediction_id')
          .eq('project_id', projectId);
        if (error || !data) return;

        const now = Date.now();
        const STALE_MS = 6 * 60 * 1000; // 6min: pipeline takes ~3min, double for safety
        const STALE_PREFLIGHT_MS = 2 * 60 * 1000; // CPU/preflight abort before a Sync.so job exists
        const STALE_SYNC_MS = 12 * 60 * 1000; // Sync.so should settle well before this; avoid endless spinner

        const hasSyncSoJob = (d: any) =>
          typeof d.replicate_prediction_id === 'string' &&
          d.replicate_prediction_id.startsWith('sync:');
        const hasRecordedProviderJob = (d: any) => {
          const plan = d.audio_plan as any;
          const jobs = plan?.twoshot?.syncJobs?.jobs;
          const dialogJobs = d.dialog_shots?.version === 4 && Array.isArray(d.dialog_shots?.shots)
            ? d.dialog_shots.shots.some((s: any) => s?.sync_job_id || s?.status === 'ready' || s?.status === 'lipsyncing')
            : false;
          return hasSyncSoJob(d) || dialogJobs || !!plan?.twoshot?.heartbeat?.syncJobId || (Array.isArray(jobs) && jobs.length > 0);
        };

        const dialogShotRows = (data as any[]).filter(
          (d) =>
            isDialogEngine(d.engine_override) &&
            d.dialog_shots?.version === 4 &&
            !d.lip_sync_applied_at &&
            (d.lip_sync_status === 'running' || d.lip_sync_status === 'stitching') &&
            ['queued', 'lipsyncing', 'stitching'].includes(String(d.dialog_shots?.status)) &&
            !inflight.current.has(`poll-dialog:${d.id}`),
        );
        for (const d of dialogShotRows) {
          inflight.current.add(`poll-dialog:${d.id}`);
          supabase.functions
            .invoke('poll-dialog-shots', { body: { scene_id: d.id } })
            .finally(() => setTimeout(() => inflight.current.delete(`poll-dialog:${d.id}`), 30_000));
        }

        // ── v5 (Sync.so Segments) stale-watchdog ──────────────────────
        // v5 has no per-turn shots and relies entirely on the webhook.
        // If updated_at is older than STALE_SYNC_MS without a final_url,
        // mark failed so the auto-retry below can re-dispatch (refund is
        // handled inside compose-dialog-segments + sync-so-webhook).
        const staleV5 = (data as any[]).filter(
          (d) =>
            d.engine_override !== 'cinematic-sync-legacy' &&
            isDialogEngine(d.engine_override) &&
            d.dialog_shots?.version === 5 &&
            d.lip_sync_status === 'running' &&
            !d.lip_sync_applied_at &&
            !d.dialog_shots?.final_url &&
            d.updated_at &&
            now - new Date(d.updated_at).getTime() > STALE_SYNC_MS,
        );
        if (staleV5.length > 0) {
          await Promise.all(
            staleV5.map((d) =>
              supabase
                .from('composer_scenes')
                .update({
                  lip_sync_status: 'failed',
                  twoshot_stage: 'failed',
                  clip_error: 'syncso_segments_poll_timeout',
                })
                .eq('id', d.id),
            ),
          );
        }

        const staleSyncJobs = (data as any[]).filter(
          (d) =>
            isDialogEngine(d.engine_override) &&
            d.dialog_shots?.version !== 4 &&
            d.dialog_shots?.version !== 5 &&
            d.lip_sync_status === 'running' &&
            !d.lip_sync_applied_at &&
            hasSyncSoJob(d) &&
            d.updated_at &&
            now - new Date(d.updated_at).getTime() > STALE_SYNC_MS,
        );
        if (staleSyncJobs.length > 0) {
          await Promise.all(
            staleSyncJobs.map((d) =>
              supabase
                .from('composer_scenes')
                .update({ lip_sync_status: 'failed', twoshot_stage: 'failed', clip_error: 'syncso_poll_timeout' })
                .eq('id', d.id),
            ),
          );
        }

        const runningSyncJobs = (data as any[]).filter(
          (d) =>
            isDialogEngine(d.engine_override) &&
            d.dialog_shots?.version !== 4 &&
            d.lip_sync_status === 'running' &&
            !d.lip_sync_applied_at &&
            hasSyncSoJob(d) &&
            !staleSyncJobs.some((s) => s.id === d.id) &&
            !inflight.current.has(`poll:${d.id}`),
        );
        if (runningSyncJobs.length > 0 && !progressActive.current) {
          progressActive.current = true;
          emitPipelineEvent({ type: 'lipsync:start' });
        }
        // Note: poll-dialog-shots runs server-side via pg_cron every minute
        // AND as a Replicate webhook receiver — no client-side polling needed.

        // Preflight/CPU-abort recovery: running but no provider job was ever
        // recorded. Clear the stage too so the candidate filter can re-invoke.
        const preflightAborts = (data as any[]).filter(
          (d) =>
            isDialogEngine(d.engine_override) &&
            d.lip_sync_status === 'running' &&
            !d.lip_sync_applied_at &&
            !hasRecordedProviderJob(d) &&
            (d.twoshot_stage === 'preflight' || /^lipsync_/i.test(String(d.twoshot_stage ?? ''))) &&
            d.updated_at &&
            now - new Date(d.updated_at).getTime() > STALE_PREFLIGHT_MS,
        );
        if (preflightAborts.length > 0) {
          await Promise.all(
            preflightAborts.map((d) => {
              inflight.current.delete(d.id);
              d.lip_sync_status = 'pending';
              d.twoshot_stage = null;
              d.replicate_prediction_id = null;
              return supabase
                .from('composer_scenes')
                .update({
                  lip_sync_status: 'pending',
                  twoshot_stage: null,
                  replicate_prediction_id: null,
                  clip_error: 'auto-retry: preflight_cpu_abort_recovered',
                })
                .eq('id', d.id);
            }),
          );
        }

        // Stale-recovery: 'running' >6min ohne lip_sync_applied_at → reset
        const stale = (data as any[]).filter(
          (d) =>
            isDialogEngine(d.engine_override) &&
            d.lip_sync_status === 'running' &&
            !d.lip_sync_applied_at &&
            !hasRecordedProviderJob(d) &&
            d.updated_at &&
            now - new Date(d.updated_at).getTime() > STALE_MS,
        );
        if (stale.length > 0) {
          console.warn(
            `[useTwoShotAutoTrigger] resetting ${stale.length} stale 'running' scenes`,
          );
          await Promise.all(
            stale.map((d) => {
              inflight.current.delete(d.id);
              return supabase
                .from('composer_scenes')
                .update({ lip_sync_status: 'pending', twoshot_stage: null, replicate_prediction_id: null, clip_error: 'auto-reset: stale running' })
                .eq('id', d.id);
            }),
          );
        }

        // ── Zombie state: lipsync_* stage but no real Sync.so job. Caused
        // by stale-reset clearing status while leaving the stage marker.
        // Both client and watchdog previously skipped this; UI hung at 95%.
        // Reset stage AND status atomically so the candidate-filter below
        // picks it up in the same tick.
        const zombies = (data as any[]).filter((d) => {
          if (!isDialogEngine(d.engine_override)) return false;
          if (d.lip_sync_applied_at) return false;
          if (d.lip_sync_status !== 'pending') return false;
          if (typeof d.twoshot_stage !== 'string' || !/^lipsync_/i.test(d.twoshot_stage)) return false;
          if (hasSyncSoJob(d)) return false;
          const plan = d.audio_plan as any;
          const jobs = plan?.twoshot?.syncJobs?.jobs;
          const heartbeatJob = plan?.twoshot?.heartbeat?.syncJobId;
          if (heartbeatJob) return false;
          if (Array.isArray(jobs) && jobs.length > 0) return false;
          return true;
        });
        if (zombies.length > 0) {
          console.warn(
            `[useTwoShotAutoTrigger] clearing ${zombies.length} zombie lipsync_* stage(s)`,
          );
          await Promise.all(
            zombies.map((d) => {
              inflight.current.delete(d.id);
              // Mutate in-place so the candidate filter below sees the
              // cleared stage immediately without waiting for a re-tick.
              d.twoshot_stage = null;
              d.replicate_prediction_id = null;
              return supabase
                .from('composer_scenes')
                .update({
                  twoshot_stage: null,
                  replicate_prediction_id: null,
                  clip_error: 'auto-retry: zombie_lipsync_stage_without_sync_job',
                })
                .eq('id', d.id);
            }),
          );
        }


        // Recoverable failure reasons we auto-retry exactly once per mount.
        // (Hard refusals like 'no_voiceover' or 'source_clip_unusable' need
        // user action — never auto-retry those.)
        const RETRYABLE_ERRORS = new Set([
          'multi_speaker_scene_routed_to_single_lipsync',
          'watchdog_stuck_lipsync_refunded',
        ]);
        const RETRYABLE_REGEX = /^(lipsync_pass_\d+_failed|syncso_(failed|rejected|canceled)|syncso_segments_(dispatch_\d+|FAILED|REJECTED|CANCELED|poll_timeout)|twoshot_presync_timeout|syncso_poll_timeout|dialog_shots_failed|dialog_stitch_failed|dialog_all_hailuo_dispatches_failed|dialog_missing_face_coords)/i;
        const HARD_FAIL_REGEX = /^(source_clip_unusable|source_clip_missing_speakers|no_voiceover|tts_failed|INSUFFICIENT_CREDITS|dialog_pipeline_missing_audio_plan|dialog_pipeline_no_turns)/i;

        const candidates = (data as any[]).filter((d) => {
          if (!isDialogEngine(d.engine_override)) return false;
          if (typeof d.clip_url !== 'string' || d.clip_url.length === 0) return false;
          // Master clip must be READY — never try lip-sync on a failed/generating master.
          if (d.clip_status && d.clip_status !== 'ready') return false;
          if (d.lip_sync_applied_at) return false;
          if (inflight.current.has(d.id)) return false;
          if (autoRetried.current.has(d.id)) return false;
          // Treat ALL early stages as "not ready" — only 'master_clip' (Hailuo
          // master rendered, audio plan written) and 'failed' (retry) qualify.
          // Previously 'audio'/'preflight'/'anchor' could slip through if
          // twoshot_stage was momentarily null, causing 422 missing_audio_plan.
          if (d.twoshot_stage && d.twoshot_stage !== 'master_clip' && d.twoshot_stage !== 'failed') return false;
          // ── Pre-flight gate ──────────────────────────────────────────
          // v5 (compose-dialog-segments) hard-requires audio_plan.twoshot.url
          // (merged VO from compose-twoshot-audio) AND a master plate clip.
          // Without them it returns 422 missing_audio_plan / missing_source_clip,
          // the in-flight lock expires after 30s, and the user sees a
          // "Lip-Sync fehlgeschlagen" toast even though the pipeline was
          // simply still warming up. Skip silently until both are present.
          const planUrl = d.audio_plan?.twoshot?.url;
          const sourceClip = d.lip_sync_source_clip_url ?? d.clip_url;
          if (d.engine_override !== 'cinematic-sync-legacy') {
            if (!planUrl || typeof planUrl !== 'string' || planUrl.length === 0) return false;
            if (!sourceClip || typeof sourceClip !== 'string' || sourceClip.length === 0) return false;
          }
          if (d.lip_sync_status === 'pending' || d.lip_sync_status == null) return true;
          if (
            d.lip_sync_status === 'failed' &&
            typeof d.clip_error === 'string' &&
            !HARD_FAIL_REGEX.test(d.clip_error) &&
            (RETRYABLE_ERRORS.has(d.clip_error) || RETRYABLE_REGEX.test(d.clip_error))
          ) {
            return true;
          }
          return false;
        });
        if (candidates.length === 0) {
          const anyVisibleLipsyncWork = (data as any[]).some(
            (d) =>
              isDialogEngine(d.engine_override) &&
              !d.lip_sync_applied_at &&
              (d.lip_sync_status === 'running' ||
                (d.twoshot_stage && !['done', 'complete', 'failed'].includes(String(d.twoshot_stage)))),
          );
          if (!anyVisibleLipsyncWork && progressActive.current) {
            progressActive.current = false;
            emitPipelineEvent({ type: 'lipsync:end' });
          }
          return;
        }


        // Optimistischer Client-Lock — verhindert Doppel-Trigger im selben Tick.
        // Wichtig: den DB-Status NICHT hier auf 'running' setzen. Die Edge-
        // Function reserviert Credits und setzt den Status atomar selbst;
        // sonst blockiert ihre Duplicate-Run-Sperre den frisch gestarteten Job.
        candidates.forEach((d) => inflight.current.add(d.id));
        if (!progressActive.current) {
          progressActive.current = true;
          emitPipelineEvent({ type: 'lipsync:start' });
        }

        for (const d of candidates) {
          const speakers = resolveSpeakerCount(d);
          // Route by engine. Default = v5 1-call Sync.so Segments (Artlist
          // pattern): one POST with segments[], Sync.so parallelizes internally,
          // single webhook, single refund — ~3–5 min vs. ~10–15 min for v4.
          // Only `cinematic-sync-legacy` keeps the old per-turn chain.
          const fnName =
            d.engine_override === 'cinematic-sync-legacy'
              ? 'compose-dialog-scene'
              : 'compose-dialog-segments';

          // For retry-candidates (previously 'failed'), clear the failure
          // markers first so the edge function's running-takeover guard sees a
          // clean slate instead of stale 'failed'/twoshot_stage='failed'.
          if (d.lip_sync_status === 'failed') {
            autoRetried.current.add(d.id); // ensures only one auto-recovery per mount
            await supabase
              .from('composer_scenes')
              .update({
                lip_sync_status: 'pending',
                twoshot_stage: null,
                clip_error: `auto-retry: ${d.clip_error ?? 'failed'}`,
                replicate_prediction_id: null,
                dialog_shots: null,
              })
              .eq('id', d.id);
          }

          console.info(
            `[useTwoShotAutoTrigger] invoking ${fnName} for scene ${d.id} (speakers=${speakers})`,
          );
          supabase.functions
            .invoke(fnName, { body: { scene_id: d.id } })
            .then(async ({ data: lsData, error: lsErr }) => {
              const errBody = (lsErr as any)?.context;
              const reason = lsData?.error ?? errBody?.error;
              const message = lsData?.message ?? errBody?.message;
              // Pre-flight races: edge function said the audio plan or the
              // master plate isn't ready yet. The pre-flight gate above
              // normally prevents this, but DB read-your-writes lag can
              // still slip one through. Treat as silent retry — the next
              // poll tick will pick it up once the row is consistent.
              const SILENT_RACE = new Set([
                'missing_audio_plan',
                'missing_source_clip',
                'dialog_pipeline_missing_audio_plan',
                'master_clip_not_ready',
              ]);
              if (reason && SILENT_RACE.has(String(reason))) {
                console.info(
                  `[useTwoShotAutoTrigger] silent retry for ${d.id}: ${reason}`,
                );
              } else if (reason === 'tts_failed' || reason === 'no_voiceover') {
                emitPipelineEvent({ type: 'lipsync:end' });
                toast({
                  title: 'Cinematic-Sync braucht ein Voiceover',
                  description:
                    message || 'Bitte im Voiceover-Tab eine Stimme prüfen, dann erneut versuchen.',
                  variant: 'destructive',
                });
              } else if (lsErr) {
                emitPipelineEvent({ type: 'lipsync:end' });
                const realMsg = await extractFunctionsError(lsErr);
                toast({
                  title: 'Lip-Sync fehlgeschlagen',
                  description: realMsg || message || 'Unbekannter Fehler beim Lip-Sync.',
                  variant: 'destructive',
                });
                console.warn(
                  `[useTwoShotAutoTrigger] invoke failed for ${d.id}: ${realMsg}`,
                  lsErr,
                );
              }
            })
            .finally(() => {
              // Lock wird nicht sofort freigegeben — der nächste Poll-Tick
              // sieht entweder lip_sync_applied_at gesetzt oder lip_sync_status
              // weiterhin 'running'. Bei Failure setzt die Edge-Function selbst
              // den Status zurück.
              setTimeout(() => inflight.current.delete(d.id), 30_000);
            });
        }
      } catch (err) {
        console.warn('[useTwoShotAutoTrigger] tick error', err);
      }
    };

    // Sofort ausführen + dann im Intervall
    tick();
    const handle = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [projectId]);
}
