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
import { isRealizedScene } from '@/lib/composer/isRealizedScene';
import { isLipSyncIntentionalRow } from '@/lib/video-composer/lipSyncIntent';

// v94: 8s → 2.5s. Saves up to ~5.5s per stage transition (×3-4 transitions
// per scene). DB select is filtered by project_id + indexed, load negligible.
const POLL_INTERVAL_MS = 2_500;

/**
 * Engines that share the dialog/lip-sync auto-trigger pipeline.
 *
 * v70: legacy `cinematic-sync-legacy` opt-in removed. All dialog scenes
 * route through the v69 unified single-face preclip pipeline via
 * `compose-dialog-segments`. The per-turn v4 chain (`compose-dialog-scene`
 * forwarder, `poll-dialog-shots`, `render-dialog-turn`, `render-dialog-stitch`)
 * is deleted.
 */
const DIALOG_ENGINES = new Set(['cinematic-sync', 'sync-segments']);
const isDialogEngine = (eo: any) => DIALOG_ENGINES.has(String(eo ?? ''));

/**
 * v-clean-1: Zusätzlicher Filter neben `isDialogEngine`. Selbst wenn eine
 * Alt-Zeile noch mit `engine_override='cinematic-sync'` in der DB steht,
 * feuern wir Sync.so nur wenn der User explizit opt-in gemacht hat.
 * Verhindert dass HeyGen-Migration-Reste oder ein zukünftiger UI-Bug
 * ungewollt Sync.so-Kosten auslösen.
 */
const isLipSyncCandidate = (d: any) =>
  isDialogEngine(d.engine_override) && isLipSyncIntentionalRow(d);

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
          .select('id, clip_url, clip_status, engine_override, lip_sync_status, lip_sync_applied_at, lip_sync_source_clip_url, lip_sync_with_voiceover, dialog_mode, dialog_script, audio_plan, dialog_shots, updated_at, clip_error, twoshot_stage, replicate_prediction_id')
          .eq('project_id', projectId);
        if (error || !data) return;

        // ── Talking-Head Master Self-Heal ───────────────────────────────
        // Cinematic-Sync scenes whose `clip_url` is a raw `/talking-head-renders/`
        // file are invalid masters for v5 lip-sync. compose-dialog-segments
        // blocks them with `raw_talking_head_source_blocked`; here we reset
        // BEFORE audio-prep / candidate selection so the next "Alle generieren"
        // produces a real Hailuo/HappyHorse scene plate instead of looping.
        const isTalkingHeadUrl = (u: any) =>
          typeof u === 'string' && u.includes('/talking-head-renders/');
        const talkingHeadMasters = (data as any[]).filter(
          (d) =>
            isDialogEngine(d.engine_override) &&
            !d.lip_sync_applied_at &&
            isTalkingHeadUrl(d.clip_url),
        );
        if (talkingHeadMasters.length > 0) {
          console.warn(
            `[useTwoShotAutoTrigger] self-heal: clearing ${talkingHeadMasters.length} talking-head master(s) for cinematic-sync`,
          );
          await Promise.all(
            talkingHeadMasters.map((d) => {
              inflight.current.delete(d.id);
              inflight.current.delete(`audio-prep:${d.id}`);
              // Mutate in place so this tick's downstream filters see the reset.
              d.clip_url = null;
              d.clip_status = 'pending';
              d.lip_sync_status = 'pending';
              d.lip_sync_source_clip_url = null;
              d.lip_sync_applied_at = null;
              d.twoshot_stage = null;
              d.dialog_shots = null;
              d.replicate_prediction_id = null;
              return supabase
                .from('composer_scenes')
                .update({
                  clip_url: null,
                  clip_status: 'pending',
                  lip_sync_status: 'pending',
                  lip_sync_source_clip_url: null,
                  lip_sync_applied_at: null,
                  twoshot_stage: null,
                  dialog_shots: null,
                  replicate_prediction_id: null,
                  clip_error:
                    'auto-reset: talking_head_master_invalid_for_cinematic_sync — bitte Clip neu generieren',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', d.id);
            }),
          );
        }


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
          const ds = d.dialog_shots as any;
          // v4 OR v5+shots[] (per-turn) — any shot with a sync_job_id or
          // non-terminal status counts as an active provider job.
          const shotsArr = Array.isArray(ds?.shots) ? ds.shots : [];
          const dialogJobs = shotsArr.some(
            (s: any) =>
              s?.sync_job_id ||
              ['lipsyncing', 'ready', 'pending', 'generated'].includes(String(s?.status ?? '')),
          );
          // v5 sync-segments multi-pass passes[]
          const passesArr = Array.isArray(ds?.passes) ? ds.passes : [];
          const passJobs = passesArr.some((p: any) => p?.job_id || p?.status === 'rendering');
          const v5SegmentsJob =
            ds?.version === 5 && ds?.engine === 'sync-segments' && !!ds?.sync_job_id;
          return (
            hasSyncSoJob(d) ||
            dialogJobs ||
            passJobs ||
            v5SegmentsJob ||
            !!plan?.twoshot?.heartbeat?.syncJobId ||
            (Array.isArray(jobs) && jobs.length > 0)
          );
        };

        // v70: legacy per-turn v4 / v5+shots[] dispatcher (poll-dialog-shots)
        // removed. v69 multi-pass writes `dialog_shots.passes[]`, advanced
        // entirely via sync-so-webhook → render-sync-segments-audio-mux.

        // v23 ARCHITECTURE: client NEVER resets running/failed scenes.
        // All stale-detection / refund / reset is owned by the server
        // (`lipsync-watchdog` cron + `reset-lipsync-scene` user action).
        // The previous client-side stale resets caused the infinite loop:
        // a real provider job was misclassified as "stale" → set to pending
        // → re-dispatched → old Sync.so jobs orphaned, new ones queued.
        const runningSyncJobs = (data as any[]).filter(
          (d) =>
            isDialogEngine(d.engine_override) &&
            d.lip_sync_status === 'running' &&
            !d.lip_sync_applied_at &&
            hasRecordedProviderJob(d),
        );
        if (runningSyncJobs.length > 0 && !progressActive.current) {
          progressActive.current = true;
          emitPipelineEvent({ type: 'lipsync:start' });
        }

        // ── AUDIO-PLATE SELF-HEAL ────────────────────────────────────────
        // Cinematic-Sync braucht zwingend `audio_plan.twoshot.url` (gemerged
        // VO aus compose-twoshot-audio). Bei manchen Flows (Engine nach
        // Master-Render umgestellt, Dialog-Toggle nachträglich aktiviert,
        // oder stiller Exception-Abbruch in compose-video-clips' Prep-Block)
        // existiert die Audio-Plate nie → Pre-Flight-Gate unten überspringt
        // die Szene endlos → UI hängt bei „Lip-Sync startet…". Wir bauen
        // sie hier deterministisch nach, BEVOR der eigentliche v5-Dispatch
        // läuft.
        const AUDIO_PREP_STALE_MS = 3 * 60 * 1000; // 3min: TTS+Mux dauert ~10–30s
        // v172: erlaube Em-Dash / En-Dash / Klammern / Mood-Suffixe im
        // Sprecher-Label (z.B. "SAMUEL DUSATKO — CASUAL:" oder
        // "ANNA (verzweifelt):"). Vorher fielen solche Skripte aus dem
        // Audio-Prep raus und die Szene blieb für immer in
        // `twoshot_stage='master_clip'` ohne `audio_plan.twoshot.url` stecken.
        const hasDialogScript = (d: any) =>
          typeof d.dialog_script === 'string' &&
          /^\s*\[?[A-Za-zÀ-ÿ][\p{L}\p{N}\s.,'’\-–—()[\]/&]{0,80}?\]?\s*[:：]/mu.test(
            d.dialog_script,
          );

        // Re-Run Self-Heal: Szene ist auf pending zurückgesetzt, aber
        // lip_sync_applied_at vom vorigen Erfolgs-Lauf steht noch — der
        // Kandidatenfilter weiter unten würde sie sonst stumm verwerfen.
        // Klarer Re-Run-Marker = pending + applied_at gesetzt + Master-Clip da.
        const orphanReruns = (data as any[]).filter(
          (d) =>
            isDialogEngine(d.engine_override) &&
            d.lip_sync_status === 'pending' &&
            d.lip_sync_applied_at &&
            typeof d.clip_url === 'string' &&
            d.clip_url.length > 0,
        );
        if (orphanReruns.length > 0) {
          console.warn(
            `[useTwoShotAutoTrigger] self-heal: clearing stale applied_at on ${orphanReruns.length} re-run scene(s)`,
          );
          await Promise.all(
            orphanReruns.map((d) => {
              d.lip_sync_applied_at = null;
              d.dialog_shots = null;
              d.lip_sync_source_clip_url = null;
              return supabase
                .from('composer_scenes')
                .update({
                  lip_sync_applied_at: null,
                  dialog_shots: null,
                  lip_sync_source_clip_url: null,
                })
                .eq('id', d.id);
            }),
          );
        }

        // Stale-Watchdog: stage='audio' >3min ohne audio_plan → clear stage
        // damit nächster Tick einen frischen Versuch startet.
        const stalePrep = (data as any[]).filter(
          (d) =>
            isDialogEngine(d.engine_override) &&
            d.twoshot_stage === 'audio' &&
            !d.audio_plan?.twoshot?.url &&
            d.updated_at &&
            now - new Date(d.updated_at).getTime() > AUDIO_PREP_STALE_MS,
        );
        if (stalePrep.length > 0) {
          console.warn(
            `[useTwoShotAutoTrigger] resetting ${stalePrep.length} stale audio-prep stage(s)`,
          );
          await Promise.all(
            stalePrep.map((d) => {
              inflight.current.delete(`audio-prep:${d.id}`);
              d.twoshot_stage = null;
              return supabase
                .from('composer_scenes')
                .update({ twoshot_stage: null, clip_error: 'auto-reset: stale audio prep' })
                .eq('id', d.id);
            }),
          );
        }

        // ── Audio-Done → master_clip transition ─────────────────────────────
        // Wenn compose-twoshot-audio fertig ist (audio_plan.twoshot.url
        // existiert), Master-Clip da ist, aber twoshot_stage immer noch auf
        // 'audio' steht (oder null), schalten wir auf 'master_clip'. Erst
        // damit greift der v5-Kandidatenfilter unten und ruft
        // compose-dialog-segments auf. Ohne diese Brücke bleibt die Szene
        // permanent in 'audio' hängen, der globale Balken verschwindet,
        // und der Nutzer sieht nur „Audio wird vorbereitet…" auf Dauer.
        const audioReadyButNotAdvanced = (data as any[]).filter((d) => {
          if (!isRealizedScene(d)) return false;
          if (!isLipSyncCandidate(d)) return false;
          // v70: cinematic-sync-legacy removed.
          if (d.lip_sync_applied_at) return false;
          if (typeof d.clip_url !== 'string' || d.clip_url.length === 0) return false;
          if (d.clip_status && d.clip_status !== 'ready') return false;
          if (!d.audio_plan?.twoshot?.url) return false;
          if (d.lip_sync_status === 'running' || d.lip_sync_status === 'stitching' || d.lip_sync_status === 'applied' || d.lip_sync_status === 'done') return false;
          if (d.twoshot_stage && d.twoshot_stage !== 'audio') return false;
          return true;
        });
        if (audioReadyButNotAdvanced.length > 0) {
          await Promise.all(
            audioReadyButNotAdvanced.map((d) => {
              d.twoshot_stage = 'master_clip';
              return supabase
                .from('composer_scenes')
                .update({ twoshot_stage: 'master_clip', updated_at: new Date().toISOString() })
                .eq('id', d.id);
            }),
          );
        }

        const needsAudioPrep = (data as any[]).filter((d) => {
          if (!isRealizedScene(d)) return false;
          if (!isLipSyncCandidate(d)) return false;
          // v70: cinematic-sync-legacy removed.
          if (d.lip_sync_applied_at) return false;
          if (typeof d.clip_url !== 'string' || d.clip_url.length === 0) return false;
          if (d.clip_status && d.clip_status !== 'ready') return false;
          if (d.audio_plan?.twoshot?.url) return false; // schon da
          if (d.twoshot_stage === 'audio') return false; // läuft gerade
          if (inflight.current.has(`audio-prep:${d.id}`)) return false;
          if (!hasDialogScript(d)) return false;
          return true;
        });
        for (const d of needsAudioPrep) {
          inflight.current.add(`audio-prep:${d.id}`);
          d.twoshot_stage = 'audio'; // optimistisch — UI zeigt sofort den Stage
          await supabase
            .from('composer_scenes')
            .update({ twoshot_stage: 'audio', updated_at: new Date().toISOString() })
            .eq('id', d.id);
          console.info(
            `[useTwoShotAutoTrigger] self-heal: invoking compose-twoshot-audio for ${d.id}`,
          );
          supabase.functions
            .invoke('compose-twoshot-audio', { body: { scene_id: d.id } })
            .then(async ({ data: aData, error: aErr }) => {
              if (aErr || !aData?.success) {
                const realMsg = aErr ? await extractFunctionsError(aErr) : (aData?.error ?? 'unknown');
                console.warn(
                  `[useTwoShotAutoTrigger] audio-prep failed for ${d.id}:`,
                  realMsg,
                );
                await supabase
                  .from('composer_scenes')
                  .update({
                    twoshot_stage: 'failed',
                    lip_sync_status: 'failed',
                    clip_error: `twoshot_audio_prep_failed: ${String(realMsg).slice(0, 200)}`,
                  })
                  .eq('id', d.id);
              } else {
                // Direkt nach Erfolg: stage auf 'master_clip' setzen, damit der
                // nächste Tick v5 startet (statt erst auf den DB-Refresh zu
                // warten, der die optimistische 'audio'-Markierung überschreibt).
                console.info(
                  `[useTwoShotAutoTrigger] audio-prep OK for ${d.id} — advancing to master_clip`,
                );
                await supabase
                  .from('composer_scenes')
                  .update({ twoshot_stage: 'master_clip', updated_at: new Date().toISOString() })
                  .eq('id', d.id);
              }
            })
            .finally(() => {
              setTimeout(() => inflight.current.delete(`audio-prep:${d.id}`), 30_000);
            });
        }




        // Recoverable failure reasons we auto-retry exactly once per mount.
        // (Hard refusals like 'no_voiceover' or 'source_clip_unusable' need
        // user action — never auto-retry those.)
        // Auto-retry is intentionally NARROW: only truly transient classes
        // (Sync.so concurrency, circuit-open, audio-mux dispatch glitch).
        // Every other `failed` waits for an explicit "Lip-Sync neu rendern"
        // user click — otherwise the bar loops forever and burns credits.
        const RETRYABLE_ERRORS = new Set([
          'watchdog_stuck_lipsync_refunded',
        ]);
        // v32: `syncso_circuit_open` removed — circuit-open is a backend wait
        // state owned by the server-side watchdog. Auto-retrying from the
        // client just hits the open circuit again and creates a pending/
        // circuit_open loop. The watchdog finalises the scene after TTL.
        const RETRYABLE_REGEX = /^(syncso_concurrency|http_429|audio_mux_dispatch)/i;
        // Reasons that must NEVER auto-retry — surfaced to the user as terminal.
        const HARD_FAIL_REGEX = /^(cast_invalid_|source_clip_unusable|source_clip_missing_speakers|no_voiceover|tts_failed|INSUFFICIENT_CREDITS|dialog_pipeline_missing_audio_plan|dialog_pipeline_no_turns|dialog_pipeline_no_per_speaker_tracks|cinematic_sync_anchor_missing|anchor_missing_speakers|anchor_extra_person_detected|anchor_identity_|dialog_missing_face_coords|raw_talking_head_source_blocked|dialog_shots_failed|syncso_segments_FAILED|sync_FAILED|multi_speaker_|syncso_provider_unknown_no_code_after_retries|syncso_circuit_open)/i;
        

        const candidates = (data as any[]).filter((d) => {
          if (!isRealizedScene(d)) return false;
          if (!isLipSyncCandidate(d)) return false;
          if (typeof d.clip_url !== 'string' || d.clip_url.length === 0) return false;
          // Master clip must be READY — never try lip-sync on a failed/generating master.
          if (d.clip_status && d.clip_status !== 'ready') return false;
          if (d.lip_sync_applied_at) return false;
          // v18: never auto-revive a user-cancelled scene. The Cancel button
          // explicitly opts the user out — only an explicit "Lip-Sync neu rendern"
          // click should re-enter the pipeline.
          if (d.lip_sync_status === 'canceled') return false;
          if (inflight.current.has(d.id)) return false;
          if (autoRetried.current.has(d.id)) return false;
          // Treat ALL early stages as "not ready" — only 'master_clip' (Hailuo
          // master rendered, audio plan written) and 'failed' (retry) qualify.
          // v32: `circuit_open` and `deferred` are server-owned wait states
          // — DO NOT auto-advance them from the client, otherwise we re-enter
          // the dispatch loop that flipped the breaker open in the first place.
          const ADVANCEABLE_STAGES = new Set(['master_clip', 'failed']);
          if (d.twoshot_stage && !ADVANCEABLE_STAGES.has(d.twoshot_stage)) return false;
          // ── Pre-flight gate ──────────────────────────────────────────
          // v5 (compose-dialog-segments) hard-requires audio_plan.twoshot.url
          // (merged VO from compose-twoshot-audio) AND a master plate clip.
          // Without them it returns 422 missing_audio_plan / missing_source_clip,
          // the in-flight lock expires after 30s, and the user sees a
          // "Lip-Sync fehlgeschlagen" toast even though the pipeline was
          // simply still warming up. Skip silently until both are present.
          const planUrl = d.audio_plan?.twoshot?.url;
          const sourceClip = d.lip_sync_source_clip_url ?? d.clip_url;
          if (!planUrl || typeof planUrl !== 'string' || planUrl.length === 0) return false;
          if (!sourceClip || typeof sourceClip !== 'string' || sourceClip.length === 0) return false;
          // v23: ONLY `pending` (or null) is a valid start state on the client.
          // `failed` requires explicit user reset via `reset-lipsync-scene`.
          if (d.lip_sync_status === 'pending' || d.lip_sync_status == null) return true;
          return false;
        });
        if (candidates.length === 0) {
          const anyVisibleLipsyncWork = (data as any[]).some(
            (d) =>
              isLipSyncCandidate(d) &&
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
          // v70: ALL 1–4 speaker scenes route to `compose-dialog-segments`
          // (v69 unified single-face preclip pipeline). Legacy per-turn
          // forwarder and `cinematic-sync-legacy` escape hatch removed.
          const fnName = 'compose-dialog-segments';

          // v23: `failed` candidates are no longer accepted by the candidate
          // filter — the only way back into the pipeline is a user-triggered
          // `reset-lipsync-scene` call. So we never clear failure markers here.

          console.info(
            `[useTwoShotAutoTrigger] invoking ${fnName} for scene ${d.id} (speakers=${speakers})`,
          );
          supabase.functions
            .invoke(fnName, { body: { scene_id: d.id, auto: true } })
            .then(async ({ data: lsData, error: lsErr }) => {
              if (cancelled) return;
              // Parse FunctionsHttpError body FIRST. `lsErr.context` is a raw
              // Response object — reading `.error` on it returns undefined, so
              // the previous silent-race check never matched and benign races
              // (e.g. scene_not_found after "Neues Projekt") surfaced as toasts.
              let reason: string | undefined = lsData?.error;
              let message: string | undefined = lsData?.message;
              let realMsg = '';
              if (lsErr) {
                realMsg = await extractFunctionsError(lsErr);
                const code = realMsg.split(/\s[\(\[]/)[0]?.trim();
                if (code) reason = reason ?? code;
                message = message ?? realMsg;
              }
              const SILENT_RACE = new Set([
                'missing_audio_plan',
                'missing_source_clip',
                'dialog_pipeline_missing_audio_plan',
                'master_clip_not_ready',
                // Scene was deleted (new project / scene removed) between
                // the poll snapshot and the invoke. Not a real failure.
                'scene_not_found',
                // Plan v71: benign 202s from compose-dialog-segments mean
                // the server is already working on it / waiting for a slot.
                // The lipsync-watchdog owns recovery — don't surface as error.
                'already_running',
                'scene_lock_busy',
                'preflight_transient_retry_later',
                'deferred',
                'circuit_open',
              ]);
              if (reason && SILENT_RACE.has(String(reason))) {
                console.info(
                  `[useTwoShotAutoTrigger] silent retry for ${d.id}: ${reason}`,
                );
                inflight.current.delete(d.id);
                return;
              }
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
