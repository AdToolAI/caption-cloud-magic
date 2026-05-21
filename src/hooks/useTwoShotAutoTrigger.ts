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

const POLL_INTERVAL_MS = 8_000;

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
          .select('id, clip_url, clip_status, engine_override, lip_sync_status, lip_sync_applied_at, dialog_script, audio_plan, updated_at, clip_error, twoshot_stage, replicate_prediction_id')
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
          return hasSyncSoJob(d) || !!plan?.twoshot?.heartbeat?.syncJobId || (Array.isArray(jobs) && jobs.length > 0);
        };

        const staleSyncJobs = (data as any[]).filter(
          (d) =>
            d.engine_override === 'cinematic-sync' &&
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
            d.engine_override === 'cinematic-sync' &&
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
            d.engine_override === 'cinematic-sync' &&
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
            d.engine_override === 'cinematic-sync' &&
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
          if (d.engine_override !== 'cinematic-sync') return false;
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
        const RETRYABLE_REGEX = /^(lipsync_pass_\d+_failed|syncso_(failed|rejected|canceled)|twoshot_presync_timeout|syncso_poll_timeout|dialog_shots_failed|dialog_stitch_failed|dialog_all_hailuo_dispatches_failed)/i;
        const HARD_FAIL_REGEX = /^(source_clip_unusable|source_clip_missing_speakers|no_voiceover|tts_failed|INSUFFICIENT_CREDITS|dialog_pipeline_missing_audio_plan|dialog_pipeline_no_turns)/i;

        const candidates = (data as any[]).filter((d) => {
          if (d.engine_override !== 'cinematic-sync') return false;
          if (typeof d.clip_url !== 'string' || d.clip_url.length === 0) return false;
          if (d.lip_sync_applied_at) return false;
          if (inflight.current.has(d.id)) return false;
          if (autoRetried.current.has(d.id)) return false;
          if (d.twoshot_stage && d.twoshot_stage !== 'master_clip' && d.twoshot_stage !== 'failed') return false;
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
              d.engine_override === 'cinematic-sync' &&
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
          // NEW dialog-based shot pipeline (1, 2, 3+ speakers) — replaces the
          // legacy compose-twoshot-lipsync / compose-lipsync-scene split.
          const fnName = 'compose-dialog-scene';

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
            .then(({ data: lsData, error: lsErr }) => {
              const errBody = (lsErr as any)?.context;
              const reason = lsData?.error ?? errBody?.error;
              const message = lsData?.message ?? errBody?.message;
              if (reason === 'tts_failed' || reason === 'no_voiceover') {
                emitPipelineEvent({ type: 'lipsync:end' });
                toast({
                  title: 'Cinematic-Sync braucht ein Voiceover',
                  description:
                    message || 'Bitte im Voiceover-Tab eine Stimme prüfen, dann erneut versuchen.',
                  variant: 'destructive',
                });
              } else if (lsErr) {
                emitPipelineEvent({ type: 'lipsync:end' });
                toast({
                  title: 'Lip-Sync fehlgeschlagen',
                  description:
                    message || (lsErr as Error).message || 'Unbekannter Fehler beim Lip-Sync.',
                  variant: 'destructive',
                });
                console.warn(
                  `[useTwoShotAutoTrigger] invoke failed for ${d.id}`,
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
