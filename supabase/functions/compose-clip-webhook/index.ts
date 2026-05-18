import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyWebhookRequest } from "../_shared/webhook-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token, x-qa-mock',
};

function detectSpeakerCount(dialogScript: string): number {
  const set = new Set<string>();
  for (const line of String(dialogScript ?? '').split('\n')) {
    const m = line.match(/^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/);
    if (m) set.add(m[1].trim().toLowerCase());
  }
  return set.size;
}

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

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
      await supabase
        .from('composer_scenes')
        .update({
          clip_url: permanentUrl,
          clip_status: 'ready',
          clip_error: null,
          updated_at: new Date().toISOString(),
        })
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

      // 🎤 Auto Lip-Sync — if the scene has dialog (script OR rendered VO) and
      // wasn't already lip-synced, fire the correct background task. Cinematic-
      // Sync multi-speaker scenes MUST use compose-twoshot-lipsync; sending
      // them to compose-lipsync-scene pre-sets running and blocks the real
      // two-shot pipeline.
      try {
        const { data: lsScene } = await supabase
          .from('composer_scenes')
          .select('clip_source, engine_override, dialog_script, audio_plan, character_audio_url, lip_sync_status')
          .eq('id', sceneId)
          .maybeSingle();

        const engine = (lsScene as any)?.engine_override ?? 'auto';
        const src = String((lsScene as any)?.clip_source ?? '');
        const isI2V = src.startsWith('ai-') && src !== 'ai-vidu';
        const isHeygen = engine === 'heygen';
        const alreadyDone = ['done', 'running'].includes(String((lsScene as any)?.lip_sync_status ?? ''));
        const optedOut = false; // future: per-scene auto_lipsync toggle

        // Check if there's any voiceover signal worth syncing against.
        let hasVoSignal = !!(lsScene as any)?.character_audio_url || !!(lsScene as any)?.dialog_script;
        if (!hasVoSignal) {
          const { count } = await supabase
            .from('scene_audio_clips')
            .select('id', { count: 'exact', head: true })
            .eq('scene_id', sceneId)
            .eq('kind', 'voiceover');
          hasVoSignal = (count ?? 0) > 0;
        }

        if (isI2V && !isHeygen && !alreadyDone && !optedOut && hasVoSignal) {
          const planSpeakers = Array.isArray((lsScene as any)?.audio_plan?.speakers)
            ? (lsScene as any).audio_plan.speakers.length
            : 0;
          const twoshotSpeakers = Array.isArray((lsScene as any)?.audio_plan?.twoshot?.speakers)
            ? (lsScene as any).audio_plan.twoshot.speakers.length
            : 0;
          const dialogSpeakers = detectSpeakerCount((lsScene as any)?.dialog_script ?? '');
          const speakerCount = Math.max(planSpeakers, twoshotSpeakers, dialogSpeakers);
          const fnName = engine === 'cinematic-sync' && speakerCount >= 2
            ? 'compose-twoshot-lipsync'
            : 'compose-lipsync-scene';

          console.log(`[compose-clip-webhook] 🎤 Auto-triggering ${fnName} for scene ${sceneId} (speakers=${speakerCount})`);
          const lsPromise = supabase.functions.invoke(fnName, {
            body: { scene_id: sceneId },
          }).then(({ error }) => {
            if (error) console.error(`[compose-clip-webhook] auto ${fnName} failed for ${sceneId}:`, error);
            else console.log(`[compose-clip-webhook] auto ${fnName} invoked for ${sceneId}`);
          }).catch((e) => {
            console.error(`[compose-clip-webhook] auto ${fnName} threw for ${sceneId}:`, e);
          });
          // @ts-ignore — Deno Deploy / Supabase edge runtime API
          if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
            // @ts-ignore
            EdgeRuntime.waitUntil(lsPromise);
          }
        }
      } catch (lsErr) {
        console.error('[compose-clip-webhook] auto lip-sync outer error:', lsErr);
      }

    } else if (status === 'failed') {
      console.error(`[compose-clip-webhook] Clip failed:`, predError);

      // Get current retry count
      const { data: scene } = await supabase
        .from('composer_scenes')
        .select('retry_count')
        .eq('id', sceneId)
        .single();

      const retryCount = (scene?.retry_count || 0) + 1;

      await supabase
        .from('composer_scenes')
        .update({
          clip_status: 'failed',
          retry_count: retryCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sceneId);

      // Refund credits for failed clip
      const { data: sceneData } = await supabase
        .from('composer_scenes')
        .select('duration_seconds, clip_source, project_id')
        .eq('id', sceneId)
        .single();

      if (sceneData) {
        const { data: project } = await supabase
          .from('composer_projects')
          .select('user_id')
          .eq('id', sceneData.project_id)
          .single();

        if (project) {
          // Cost-per-second by source × quality tier — synced with compose-video-clips.
          const CLIP_COSTS: Record<string, { standard: number; pro: number }> = {
            'ai-hailuo':   { standard: 0.15, pro: 0.20 },
            'ai-kling':    { standard: 0.15, pro: 0.21 },
            'ai-sora':     { standard: 0.25, pro: 0.53 },
            'ai-wan':      { standard: 0.10, pro: 0.18 },
            'ai-seedance': { standard: 0.12, pro: 0.20 },
            'ai-luma':     { standard: 0.20, pro: 0.32 },
            'ai-veo':      { standard: 0.20, pro: 1.40 },
            'ai-image':    { standard: 0.01, pro: 0.015 },
          };
          // Re-fetch quality tier for accurate refund
          const { data: sceneFull } = await supabase
            .from('composer_scenes')
            .select('clip_quality')
            .eq('id', sceneId)
            .single();
          const tier: 'standard' | 'pro' = sceneFull?.clip_quality === 'pro' ? 'pro' : 'standard';
          const costPerSec = CLIP_COSTS[sceneData.clip_source]?.[tier] ?? 0.15;
          const refundAmount = sceneData.duration_seconds * costPerSec;
          try {
            await supabase.rpc('refund_ai_video_credits', {
              p_user_id: project.user_id,
              p_amount_euros: refundAmount,
              p_generation_id: sceneId,
            });
            console.log(`[compose-clip-webhook] Refunded €${refundAmount.toFixed(2)} (${sceneData.clip_source}/${tier})`);
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
