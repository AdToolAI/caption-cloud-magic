// compose-clip-webhook v1.1.0 — v81 shared CLIP_COSTS + dialog-speakers
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { verifyWebhookRequest, appendWebhookToken } from "../_shared/webhook-auth.ts";
import { CLIP_COSTS } from "../_shared/clip-costs.ts";
import { countDialogSpeakers as detectSpeakerCount } from "../_shared/dialog-speakers.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token, x-qa-mock',
};

// v81: CLIP_COSTS now imported from _shared/clip-costs.ts (canonical table
// shared with compose-video-clips dispatcher). Refunds and charges always
// stay in lockstep when new providers are added.

/**
 * Detect Replicate-side transient failures that are safe to retry without any
 * user-visible change (no prompt edit, no input change). These are exclusively
 * infrastructure timeouts — Replicate failing to fetch our input image within
 * its 10s read-timeout, or short upstream provider blips. We do NOT retry on
 * content-policy / invalid-input / NSFW / quota errors because those would
 * just fail identically a second time and waste another minute.
 */
function isRetryableTransientError(predError: unknown): boolean {
  const s = String(predError ?? '').toLowerCase();
  if (!s) return false;
  return (
    s.includes('read timed out') ||
    s.includes('read timeout') ||
    s.includes('connection reset') ||
    s.includes('connection aborted') ||
    s.includes('failed to fetch') ||
    s.includes('httpsconnectionpool') ||
    s.includes('upstream connect error') ||
    s.includes('504 gateway') ||
    s.includes('502 bad gateway') ||
    s.includes('temporarily unavailable') ||
    // Hailuo / generic upstream model blip — one silent retry before refunding.
    s.includes('internal model error') ||
    s.includes('generation failed') ||
    s.includes('prediction failed') ||
    s.includes('unknown error') ||
    s === 'failed' ||
    s === 'null'
  );
}

/**
 * Some Replicate model failures arrive at the webhook with an EMPTY error
 * property (status:"failed", error:null). To give the user actionable text
 * and to let the retry classifier see a real string, re-fetch the prediction
 * detail from Replicate and pull `error` or the tail of `logs`.
 */
async function enrichEmptyPredError(
  predictionId: string | undefined,
  current: unknown,
): Promise<string> {
  const initial = String(current ?? '').trim();
  if (initial && initial !== 'null') return initial;
  if (!predictionId) return initial;
  try {
    const key = Deno.env.get('REPLICATE_API_KEY');
    if (!key) return initial;
    const r = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return initial;
    const detail = await r.json();
    const fromErr = String(detail?.error ?? '').trim();
    if (fromErr) return fromErr.slice(0, 500);
    const logs = String(detail?.logs ?? '');
    if (logs) {
      // Last non-empty line of logs is usually the actual model exception.
      const lines = logs.split('\n').map((l) => l.trim()).filter(Boolean);
      const tail = lines.slice(-3).join(' | ');
      if (tail) return `model_failed: ${tail}`.slice(0, 500);
    }
    return 'model_failed_silently';
  } catch (_e) {
    return initial || 'model_failed_silently';
  }
}

// v81: detectSpeakerCount is now the shared countDialogSpeakers (aliased on import
// above) so the regex stays identical across dispatcher and refund webhook.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const unauth = verifyWebhookRequest(req);
  if (unauth) return unauth;

  try {
    const url = new URL(req.url);
    const sceneId = url.searchParams.get('scene_id');
    const projectId = url.searchParams.get('project_id');

    if (!sceneId || !projectId) {
      throw new Error('Missing scene_id or project_id query params');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const payload = await req.json();
    // v2 — archive every AI clip to Media Library (KI tab)
    console.log(`[compose-clip-webhook v2] Scene: ${sceneId}, Status: ${payload.status}`);

    const { id: predictionId, status, output, error: predError } = payload;

    if (status === 'succeeded' && output) {
      const videoUrl = Array.isArray(output) ? output[0] : output;
      console.log(`[compose-clip-webhook] Clip ready: ${videoUrl}`);

      // Download and store permanently
      let permanentUrl = videoUrl;
      try {
        const videoResponse = await fetch(videoUrl);
        if (videoResponse.ok) {
          const videoBuffer = await videoResponse.arrayBuffer();
          const fileName = `composer/${projectId}/${sceneId}.mp4`;

          const { error: uploadError } = await supabase.storage
            .from('ai-videos')
            .upload(fileName, videoBuffer, { contentType: 'video/mp4', upsert: true });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('ai-videos').getPublicUrl(fileName);
            permanentUrl = urlData.publicUrl;
            console.log(`[compose-clip-webhook] Stored at: ${permanentUrl}`);
          }
        }
      } catch (storageErr) {
        console.error('[compose-clip-webhook] Storage failed, using temporary URL:', storageErr);
      }

      // Update scene — also clear any stale clip_error from a previous failed
      // engine (e.g. HeyGen "Talking Photo deleted") so the UI doesn't show a
      // misleading error next to a freshly rendered Hailuo clip.
      //
      // Atomic Cinematic-Sync handoff: if this scene is cinematic-sync and the
      // previous clip_source label is still ai-happyhorse (legacy / stale from
      // before the Stage 2 hotfix), normalize it to ai-hailuo here. Otherwise
      // the auto-trigger below would call compose-dialog-scene which would
      // re-invalidate the freshly finished master and the user is stuck in
      // an endless "Clip wird erstellt" loop.
      const { data: preUpdateScene } = await supabase
        .from('composer_scenes')
        .select('engine_override, clip_source, lip_sync_status, twoshot_stage')
        .eq('id', sceneId)
        .maybeSingle();
      const isCinematicSync =
        String((preUpdateScene as any)?.engine_override ?? '') === 'cinematic-sync';
      const staleHappyHorseLabel =
        String((preUpdateScene as any)?.clip_source ?? '') === 'ai-happyhorse';
      const sceneUpdate: Record<string, unknown> = {
        clip_url: permanentUrl,
        clip_status: 'ready',
        clip_error: null,
        updated_at: new Date().toISOString(),
      };
      if (isCinematicSync) {
        if (staleHappyHorseLabel) sceneUpdate.clip_source = 'ai-hailuo';
        sceneUpdate.lip_sync_status = 'pending';
        sceneUpdate.twoshot_stage = 'master_clip';
      }
      await supabase
        .from('composer_scenes')
        .update(sceneUpdate)
        .eq('id', sceneId);

      // 📚 Auto-archive every generated AI clip into the Media Library (KI tab).
      // Even if the full project never finishes, or the user later regenerates the
      // scene, the user keeps access to every clip they paid credits for.
      try {
        const { data: sceneFull } = await supabase
          .from('composer_scenes')
          .select('order_index, duration_seconds, ai_prompt, clip_source, reference_image_url, project_id')
          .eq('id', sceneId)
          .single();

        const { data: projectMeta } = await supabase
          .from('composer_projects')
          .select('user_id, title')
          .eq('id', projectId)
          .single();

        const isRealAiClip =
          sceneFull?.clip_source &&
          typeof sceneFull.clip_source === 'string' &&
          sceneFull.clip_source.startsWith('ai-');

        if (sceneFull && projectMeta?.user_id && isRealAiClip) {
          // Mark previous active library entries for this scene as superseded
          // so that regenerations keep the older versions visible.
          const { data: previousEntries } = await supabase
            .from('video_creations')
            .select('id, metadata')
            .eq('user_id', projectMeta.user_id)
            .contains('metadata', { source: 'motion-studio-clip', scene_id: sceneId });

          if (previousEntries && previousEntries.length > 0) {
            const supersededAt = new Date().toISOString();
            for (const prev of previousEntries) {
              const prevMeta = (prev.metadata || {}) as Record<string, unknown>;
              if (prevMeta.superseded === true) continue;
              await supabase
                .from('video_creations')
                .update({
                  metadata: { ...prevMeta, superseded: true, superseded_at: supersededAt },
                  updated_at: new Date().toISOString(),
                })
                .eq('id', prev.id);
            }
          }

          const newMetadata = {
            source: 'motion-studio-clip',
            project_id: projectId,
            project_name: projectMeta.title ?? null,
            scene_id: sceneId,
            scene_order: sceneFull.order_index ?? 0,
            prompt: sceneFull.ai_prompt ?? '',
            model: sceneFull.clip_source,
            duration_seconds: sceneFull.duration_seconds ?? null,
            reference_image_url: sceneFull.reference_image_url ?? null,
            superseded: false,
          };

          const { error: archiveError } = await supabase
            .from('video_creations')
            .insert({
              user_id: projectMeta.user_id,
              output_url: permanentUrl,
              status: 'completed',
              credits_used: 0,
              metadata: newMetadata,
            });

          if (archiveError) {
            console.error('[compose-clip-webhook] Library archive failed:', archiveError);
          } else {
            console.log(`[compose-clip-webhook] 📚 Archived scene ${sceneId} to Media Library (KI)`);
          }
        }
      } catch (archiveErr) {
        // Never fail the webhook because of archive issues
        console.error('[compose-clip-webhook] archive error:', archiveErr);
      }

      // 🎬 BLOCK F — Continuity Auto-Trigger
      // Fire-and-forget: extract last frame so the NEXT scene can chain off it.
      // We do this only if the next scene exists and has no reference image yet.
      try {
        const { data: currentScene } = await supabase
          .from('composer_scenes')
          .select('order_index, duration_seconds')
          .eq('id', sceneId)
          .single();

        if (currentScene) {
          const { data: nextScene } = await supabase
            .from('composer_scenes')
            .select('id, reference_image_url')
            .eq('project_id', projectId)
            .eq('order_index', (currentScene.order_index ?? 0) + 1)
            .maybeSingle();

          // Always extract the last frame for the current scene (so it's cached
          // for later "use as ref" actions). Skip auto-chain if the next scene
          // already has its own reference image.
          const shouldChain = nextScene && !nextScene.reference_image_url;

          // Don't await — let it run in background so the webhook responds fast.
          const extractPromise = supabase.functions.invoke('extract-video-last-frame', {
            body: {
              videoUrl: permanentUrl,
              durationSeconds: currentScene.duration_seconds ?? 5,
              sceneId,
              projectId,
            },
          }).then(async ({ data, error }) => {
            if (error) {
              console.error('[compose-clip-webhook] extract-frame failed:', error);
              return;
            }
            const frameUrl = (data as any)?.lastFrameUrl;
            if (frameUrl && shouldChain && nextScene) {
              await supabase
                .from('composer_scenes')
                .update({
                  reference_image_url: frameUrl,
                  continuity_source_scene_id: sceneId,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', nextScene.id);
              console.log(
                `[compose-clip-webhook] 🔗 Continuity chained: scene ${sceneId} → ${nextScene.id}`
              );
            } else if (frameUrl) {
              console.log(
                `[compose-clip-webhook] 📸 Last frame cached for scene ${sceneId} (no chain)`
              );
            }
          }).catch((e) => {
            console.error('[compose-clip-webhook] extract-frame threw:', e);
          });

          // EdgeRuntime keeps the background task alive after the response.
          // @ts-ignore — Deno Deploy / Supabase edge runtime API
          if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
            // @ts-ignore
            EdgeRuntime.waitUntil(extractPromise);
          }
        }
      } catch (chainErr) {
        // Never fail the webhook because of continuity issues
        console.error('[compose-clip-webhook] continuity chain error:', chainErr);
      }

      // 🎤 Auto Lip-Sync fallback — server-side, but ownership-safe.
      // The Lip-Sync functions now accept service-role calls and derive the
      // owner from composer_projects, so the webhook can rescue the pipeline
      // even if the user leaves the tab before the client poller fires.
      try {
        const { data: lipScene } = await supabase
          .from('composer_scenes')
          .select('id, engine_override, clip_url, lip_sync_status, lip_sync_applied_at, twoshot_stage, replicate_prediction_id, dialog_script, audio_plan')
          .eq('id', sceneId)
          .single();

        const alreadyFinal =
          lipScene?.lip_sync_applied_at ||
          lipScene?.lip_sync_status === 'done' ||
          lipScene?.twoshot_stage === 'done' ||
          lipScene?.twoshot_stage === 'complete';
        const alreadyRunning =
          lipScene?.lip_sync_status === 'running' ||
          lipScene?.lip_sync_status === 'queued' ||
          lipScene?.twoshot_stage === 'composing_dialog' ||
          lipScene?.twoshot_stage === 'dialog_chain' ||
          (typeof lipScene?.replicate_prediction_id === 'string' && lipScene.replicate_prediction_id.startsWith('sync:'));
        const wasCanceled =
          (lipScene?.lip_sync_status as any) === 'canceled' ||
          (lipScene?.lip_sync_status as any) === 'cancelled';
        // v22: do NOT auto-replay a previously-failed dialog setup. Webhook
        // retries from Replicate would otherwise nuke the failed state via
        // compose-dialog-scene's reset paths and loop forever. User must
        // manually re-trigger "Clip + Lip-Sync neu rendern" to retry.
        const alreadyFailed =
          (lipScene?.lip_sync_status as any) === 'failed' ||
          (lipScene?.twoshot_stage as any) === 'failed' ||
          (lipScene?.twoshot_stage as any) === 'needs_clip_rerender';

        const isTalkingHeadClip =
          typeof lipScene?.clip_url === "string" &&
          lipScene.clip_url.includes("/talking-head-renders/");

        if (
          lipScene?.engine_override === 'cinematic-sync' &&
          lipScene.clip_url &&
          !isTalkingHeadClip &&
          !alreadyFinal &&
          !alreadyRunning &&
          !alreadyFailed &&
          !wasCanceled
        ) {
          // v70: All dialog scenes (1–4 speakers) route to v69 unified
          // pipeline (`compose-dialog-segments`). Legacy `compose-dialog-scene`
          // forwarder and per-turn v4 chain removed.
          const fnName = 'compose-dialog-segments';
          console.log(
            `[compose-clip-webhook] auto lipsync route: scene=${sceneId} fn=${fnName}`,
          );
          const lipPromise = fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ scene_id: sceneId }),
          }).then(async (r) => {
            if (!r.ok) {
              const txt = await r.text().catch(() => '');
              console.error(`[compose-clip-webhook] ${fnName} fallback failed`, r.status, txt.slice(0, 500));
            }
          });

          // @ts-ignore — Deno Deploy / Supabase edge runtime API
          if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
            // @ts-ignore
            EdgeRuntime.waitUntil(lipPromise);
          }
        } else if (
          lipScene?.engine_override === 'cinematic-sync' &&
          isTalkingHeadClip
        ) {
          console.warn(
            `[compose-clip-webhook] scene ${sceneId}: cinematic-sync clip_url is talking-head — skipping auto-lipsync fallback`,
          );
        }
      } catch (lipErr) {
        console.error('[compose-clip-webhook] auto-lipsync fallback error:', lipErr);
      }


    } else if (status === 'failed') {
      // Enrich silent Hailuo / generic model fails by re-fetching the prediction.
      const enrichedError = await enrichEmptyPredError(predictionId, predError);
      console.error(`[compose-clip-webhook] Clip failed:`, enrichedError);

      // Get current retry count
      const { data: scene } = await supabase
        .from('composer_scenes')
        .select('retry_count, clip_source, clip_quality, engine_override')
        .eq('id', sceneId)
        .single();

      const currentRetry = scene?.retry_count || 0;
      const MAX_AUTO_RETRY = 2;

      // ── Auto-retry on transient Replicate-side failures ────────────────────
      // Re-dispatch the SAME Replicate prediction (same model, same input) so
      // the user doesn't need to manually click "Generate" again. Only fires
      // for known infrastructure errors (read-timeout fetching input image,
      // upstream blip) and only while retry_count < MAX_AUTO_RETRY. Real
      // content/policy errors fall through to the normal failed+refund path.
      const canAutoRetry =
        currentRetry < MAX_AUTO_RETRY &&
        isRetryableTransientError(enrichedError) &&
        (payload.model || payload.version) &&
        payload.input &&
        typeof payload.input === 'object';

      if (canAutoRetry) {
        try {
          const replicateKey = Deno.env.get('REPLICATE_API_KEY');
          if (!replicateKey) throw new Error('REPLICATE_API_KEY missing');
          const replicate = new Replicate({ auth: replicateKey });

          const webhookBase = appendWebhookToken(
            `${supabaseUrl}/functions/v1/compose-clip-webhook`,
          );
          const newWebhook = `${webhookBase}&scene_id=${sceneId}&project_id=${projectId}`;

          const createArgs: Record<string, unknown> = {
            input: payload.input,
            webhook: newWebhook,
            webhook_events_filter: ['completed'],
          };
          if (payload.model) createArgs.model = payload.model;
          else createArgs.version = payload.version;

          const retried = await replicate.predictions.create(
            createArgs as Parameters<typeof replicate.predictions.create>[0],
          );

          await supabase
            .from('composer_scenes')
            .update({
              clip_status: 'generating',
              retry_count: currentRetry + 1,
              replicate_prediction_id: retried.id,
              clip_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sceneId);

          console.log(
            `[compose-clip-webhook] auto-retry ${currentRetry + 1}/${MAX_AUTO_RETRY} for scene ${sceneId} → new pred ${retried.id} (transient: "${String(enrichedError).slice(0, 80)}")`,
          );

          return new Response(JSON.stringify({ ok: true, retried: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (retryErr) {
          console.error(
            '[compose-clip-webhook] auto-retry dispatch failed, falling through to refund:',
            retryErr,
          );
          // Fall through to the normal failed+refund path below.
        }
      }

      // ── Final failure → mark failed + refund ───────────────────────────────
      await supabase
        .from('composer_scenes')
        .update({
          clip_status: 'failed',
          retry_count: currentRetry + 1,
          clip_error: String(predError ?? '').slice(0, 500) || null,
          ...(String((scene as any)?.engine_override ?? '') === 'cinematic-sync'
            ? {
                lip_sync_status: null,
                twoshot_stage: null,
                lip_sync_source_clip_url: null,
                dialog_shots: null,
              }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sceneId);

      // Refund credits for failed clip
      const { data: sceneData } = await supabase
        .from('composer_scenes')
        .select('duration_seconds, clip_source, clip_quality, project_id')
        .eq('id', sceneId)
        .single();

      if (sceneData) {
        const { data: project } = await supabase
          .from('composer_projects')
          .select('user_id')
          .eq('id', sceneData.project_id)
          .single();

        if (project) {
          const tier: 'standard' | 'pro' =
            sceneData.clip_quality === 'pro' ? 'pro' : 'standard';
          const costPerSec = CLIP_COSTS[sceneData.clip_source]?.[tier] ?? 0.15;
          const refundAmount = sceneData.duration_seconds * costPerSec;
          try {
            await supabase.rpc('refund_ai_video_credits', {
              p_user_id: project.user_id,
              p_amount_euros: refundAmount,
              p_generation_id: sceneId,
            });
            console.log(
              `[compose-clip-webhook] Refunded €${refundAmount.toFixed(2)} (${sceneData.clip_source}/${tier})`,
            );
          } catch (refundErr) {
            console.error('[compose-clip-webhook] Refund failed:', refundErr);
          }
        }
      }

    } else {
      console.log(`[compose-clip-webhook] Intermediate status: ${status}, ignoring`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if ALL scenes in this project are now done
    const { data: allScenes } = await supabase
      .from('composer_scenes')
      .select('clip_status, clip_source')
      .eq('project_id', projectId);

    if (allScenes) {
      const allDone = allScenes.every(
        s => s.clip_status === 'ready' || s.clip_status === 'failed' || s.clip_source === 'upload'
      );

      if (allDone) {
        const allReady = allScenes.every(
          s => s.clip_status === 'ready' || s.clip_source === 'upload'
        );

        await supabase
          .from('composer_projects')
          .update({
            status: allReady ? 'preview' : 'storyboard',
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId);

        console.log(`[compose-clip-webhook] Project ${projectId} all clips done. Status: ${allReady ? 'preview' : 'storyboard'}`);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[compose-clip-webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
