import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { verifyWebhookRequest } from "../_shared/webhook-auth.ts";
import { withDialogLock } from "../_shared/dialog-lock.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, X-Remotion-Status, X-Remotion-Signature, X-Remotion-Mode, X-Webhook-Token, x-qa-mock',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "remotion-webhook" });


  const unauth = verifyWebhookRequest(req);
  if (unauth) return unauth;

  try {
    console.log('🔔 Remotion webhook received');
    const payload = await req.json();
    console.log('📦 Webhook payload:', JSON.stringify(payload, null, 2));

    const { type, renderId, outputFile, errors, bucketName, customData } = payload;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const pendingRenderId = customData?.pending_render_id;
    const outName = customData?.out_name;
    const userId = customData?.user_id;
    const projectId = customData?.project_id;
    const creditsUsed = customData?.credits_used;
    const source = customData?.source;
    const progressIdFromWebhook = customData?.progressId; // ← NEW: direct progressId
    const isDirectorsCut = source === 'directors-cut';
    const isComposer = source === 'composer';
    const isLongForm = source === 'sora-long-form';
    const isDialogStitch = source === 'dialog-stitch';
    const isDialogTurnPreclip = source === 'dialog-turn-preclip';
    const composerProjectId = customData?.composer_project_id;
    const renderJobId = customData?.render_job_id;
    const longFormProjectId = customData?.sora_long_form_project_id;
    const composerSceneId = customData?.composer_scene_id;

    console.log('📋 Webhook details:', { type, renderId, pendingRenderId, outName, userId, isDirectorsCut, isLongForm, progressIdFromWebhook });

    if (type === 'success') {
      console.log(`✅ Render ${renderId} completed`);

      // r67: Audio is now rendered directly in Lambda template (voiceover + music)
      // Post-render muxing only needed for silentRender fallback (voiceover recovery)
      const isSilentRender = customData?.silentRender === true;
      const audioTracks = customData?.audioTracks;
      const hasVoiceoverForMux = isSilentRender && !!audioTracks?.voiceoverUrl;
      // r67: Only mux if silentRender with voiceover — background music is now in Lambda directly
      const hasAudioToMux = isSilentRender && hasVoiceoverForMux;

      console.log(`🔊 r67 Audio diagnostics:`, {
        isSilentRender,
        hasAudioTracks: !!audioTracks,
        voiceoverUrl: audioTracks?.voiceoverUrl ? audioTracks.voiceoverUrl.substring(0, 80) + '...' : 'NONE',
        backgroundMusicUrl: audioTracks?.backgroundMusicUrl ? audioTracks.backgroundMusicUrl.substring(0, 80) + '...' : 'NONE',
        willMux: hasAudioToMux,
        reason: hasVoiceoverForMux ? 'silent-render-voiceover-recovery' : 'none (r67: music rendered in Lambda)',
      });

      let finalOutputUrl = outputFile;

      if (hasAudioToMux) {
        const muxReason = hasBackgroundMusic ? 'r64 post-render background music' : 'r41 silent render audio';
        console.log(`🔊 ${muxReason} — triggering audio mux...`);
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
          
          const muxResponse = await fetch(`${supabaseUrl}/functions/v1/mux-audio-to-video`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              videoUrl: outputFile,
              // r64: For post-render music muxing when video already has voiceover baked in,
              // only pass the backgroundMusic to mux (voiceover is already in the video)
              audioTracks: isSilentRender ? audioTracks : {
                backgroundMusicUrl: audioTracks.backgroundMusicUrl,
                backgroundMusicVolume: audioTracks.backgroundMusicVolume ?? 0.3,
              },
              userId,
              renderId: pendingRenderId || renderId,
              progressId: progressIdFromWebhook,
            }),
          });

          if (muxResponse.ok) {
            const muxResult = await muxResponse.json();
            if (muxResult.ok && muxResult.outputUrl) {
              finalOutputUrl = muxResult.outputUrl;
              console.log(`🔊 r41: Audio mux successful! Final URL: ${finalOutputUrl}`);
            } else {
              console.warn(`🔊 r41: Mux returned ok=${muxResult.ok}, using silent video as fallback`);
            }
          } else {
            const errText = await muxResponse.text();
            console.error(`🔊 r41: Mux failed (${muxResponse.status}): ${errText.substring(0, 300)}, using silent video`);
          }
        } catch (muxErr) {
          console.error(`🔊 r41: Mux error:`, muxErr, '— using silent video as fallback');
        }
      }

      // Composer Phase 2: post-render mux for SFX/ambient scene clips
      // (only for composer renders that ship sceneAudioClips). The video
      // already contains voiceover + music from Lambda; we layer the SFX on top.
      const sceneAudioClips = Array.isArray(audioTracks?.sceneAudioClips)
        ? audioTracks.sceneAudioClips
        : [];
      if (isComposer && sceneAudioClips.length > 0) {
        console.log(`🔊 [composer] Post-mux ${sceneAudioClips.length} scene SFX/ambient clips...`);
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
          const muxResp = await fetch(`${supabaseUrl}/functions/v1/mux-audio-to-video`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoUrl: finalOutputUrl,
              audioTracks: { sceneAudioClips, loudnorm: true },
              userId,
              renderId: pendingRenderId || renderId,
            }),
          });
          if (muxResp.ok) {
            const muxResult = await muxResp.json();
            if (muxResult.ok && muxResult.outputUrl) {
              finalOutputUrl = muxResult.outputUrl;
              console.log(`🔊 [composer] SFX mux ok → ${finalOutputUrl}`);
            }
          } else {
            console.warn(`🔊 [composer] SFX mux failed ${muxResp.status}`);
          }
        } catch (e) {
          console.error('🔊 [composer] SFX mux error:', e);
        }
      }

      // Composer Phase 2: optional global lip-sync pass against project voiceover.
      if (isComposer && customData?.lipSyncEnabled === true && audioTracks?.voiceoverUrl) {
        console.log('💋 [composer] Running lip-sync pass against project voiceover...');
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
          const lsResp = await fetch(`${supabaseUrl}/functions/v1/lip-sync-video`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              video_url: finalOutputUrl,
              audio_url: audioTracks.voiceoverUrl,
              project_id: composerProjectId,
            }),
          });
          if (lsResp.ok) {
            const ls = await lsResp.json();
            if (ls.success && ls.video_url) {
              finalOutputUrl = ls.video_url;
              console.log(`💋 [composer] Lip-sync ok → ${finalOutputUrl}`);
            }
          } else {
            console.warn(`💋 [composer] Lip-sync skipped (${lsResp.status})`);
          }
        } catch (e) {
          console.error('💋 [composer] Lip-sync error:', e);
        }
      }

      if (isDialogTurnPreclip) {
        // ── Per-Turn Preclip success (Artlist-Style Pipeline) ──
        // Schreibt preclip_url auf den jeweiligen Shot, setzt preclip_status='ready'
        // und stupst poll-dialog-shots an, damit Sync.so direkt mit dem
        // kurzen Clip ab t=0 weiterlaufen kann (ohne segments_secs).
        if (pendingRenderId) {
          await supabaseAdmin.from('video_renders').update({
            status: 'completed',
            video_url: finalOutputUrl,
            error_message: null,
            completed_at: new Date().toISOString(),
          }).eq('render_id', pendingRenderId);
        }
        const shotIdx = Number(customData?.shot_idx);
        if (composerSceneId && Number.isFinite(shotIdx)) {
          // v16: race-fix — acquire per-scene dispatch lock so a parallel
          // poll-dialog-shots tick cannot clobber our preclip_url write
          // (the bug that left turn 2 stuck on master fallback even though
          // the preclip Lambda render had completed successfully).
          await withDialogLock(supabaseAdmin, composerSceneId, 'webhook-preclip', async () => {
            const { data: sceneRow } = await supabaseAdmin
              .from('composer_scenes')
              .select('dialog_shots, lip_sync_status, lip_sync_applied_at')
              .eq('id', composerSceneId)
              .maybeSingle();
            const prevState = (sceneRow?.dialog_shots as any) || {};
            // v18 Cancel-Guard: do not revive a user-cancelled scene with a
            // late preclip render — just log the render and exit.
            if (
              (sceneRow as any)?.lip_sync_applied_at ||
              (sceneRow as any)?.lip_sync_status === 'canceled' ||
              prevState?.status === 'canceled'
            ) {
              console.log(`🎬 [dialog-turn-preclip] scene ${composerSceneId} shot ${shotIdx} ignored — scene canceled/applied`);
              return;
            }
            const shots = Array.isArray(prevState.shots) ? [...prevState.shots] : [];
            if (shots[shotIdx]) {
              shots[shotIdx] = {
                ...shots[shotIdx],
                preclip_url: finalOutputUrl,
                preclip_status: 'ready',
                preclip_error: undefined,
                preclip_completed_at: new Date().toISOString(),
                // v16: if a previous race had flipped this turn to master
                // fallback, the freshly arrived preclip is still the better
                // path. Unstick it so the next poll-tick dispatches Sync.so
                // on the isolated single-face preclip instead of the wide
                // multi-face master plate (which fails opaquely for edge
                // faces in 3+ speaker scenes).
                sync_source_kind: 'preclip',
              };
              await supabaseAdmin.from('composer_scenes').update({
                dialog_shots: { ...prevState, shots },
                updated_at: new Date().toISOString(),
              }).eq('id', composerSceneId);
            }
          }, { ttlSeconds: 30 });
          // v70: poll-dialog-shots removed (legacy per-turn pipeline). v69
          // single-face preclip is dispatched directly inside
          // compose-dialog-segments and tracked via sync-so-webhook.
          console.log(`🎬 [dialog-turn-preclip] scene ${composerSceneId} shot ${shotIdx} ready → ${finalOutputUrl}`);
        }
      } else if (isDialogStitch) {
        // ── Dialog-stitch render (cinematic-sync N-speaker pipeline) ──
        // Lambda-side replacement for the forbidden Edge-Runtime ffmpeg.
        // Writes the stitched clip back onto composer_scenes and marks
        // lip_sync_applied_at so the composer treats the scene as done.
        if (pendingRenderId) {
          await supabaseAdmin.from('video_renders').update({
            status: 'completed',
            video_url: finalOutputUrl,
            error_message: null,
            completed_at: new Date().toISOString(),
          }).eq('render_id', pendingRenderId);
        }
        if (composerSceneId) {
          await withDialogLock(supabaseAdmin, composerSceneId, 'webhook-stitch', async () => {
            const { data: sceneRow } = await supabaseAdmin
              .from('composer_scenes')
              .select('dialog_shots, lip_sync_status, lip_sync_applied_at')
              .eq('id', composerSceneId)
              .maybeSingle();
            const prevState = (sceneRow?.dialog_shots as any) || {};
            // v18 Cancel-Guard: do not overwrite clip_url for a cancelled scene.
            if (
              (sceneRow as any)?.lip_sync_status === 'canceled' ||
              prevState?.status === 'canceled'
            ) {
              console.log(`💋 [dialog-stitch] scene ${composerSceneId} ignored — scene canceled`);
              return;
            }
            const nowIso = new Date().toISOString();
            await supabaseAdmin.from('composer_scenes').update({
              clip_url: finalOutputUrl,
              lip_sync_source_clip_url: prevState?.source_clip_url ?? null,
              lip_sync_applied_at: nowIso,
              lip_sync_status: 'done',
              twoshot_stage: 'done',
              clip_error: null,
              dialog_shots: {
                ...prevState,
                status: 'done',
                final_url: finalOutputUrl,
                finished_at: nowIso,
              },
              updated_at: nowIso,
            }).eq('id', composerSceneId);
          }, { ttlSeconds: 30 });
          console.log(`💋 [dialog-stitch] scene ${composerSceneId} done → ${finalOutputUrl}`);
        } else {
          console.warn('💋 [dialog-stitch] success webhook without composer_scene_id');
        }
      } else if (isDirectorsCut && renderJobId) {
        const { data: renderJob } = await supabaseAdmin.from('director_cut_renders').select('user_id, credits_used').eq('id', renderJobId).single();
        await supabaseAdmin.from('director_cut_renders').update({
          status: 'completed', output_url: finalOutputUrl, error_message: null,
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', renderJobId);
        console.log("✅ Director's Cut render completed");

        if (userId) {
          const { data: existing } = await supabaseAdmin.from('video_creations').select('id').eq('output_url', finalOutputUrl).maybeSingle();
          if (!existing) {
            await supabaseAdmin.from('video_creations').insert({
              user_id: userId, output_url: finalOutputUrl, status: 'completed',
              metadata: { source: 'directors-cut', render_id: renderId, render_job_id: renderJobId },
            });
          }
        }
      } else {
        // ============================================
        // UNIVERSAL CREATOR: 3-way matching
        // 1. pending_render_id from customData
        // 2. real_remotion_render_id in content_config
        // 3. out_name suffix match
        // ============================================

        let matchedRender: any = null;
        let matchedVia = 'none';

        // Match 1: pendingRenderId
        if (pendingRenderId) {
          const { data } = await supabaseAdmin.from('video_renders').select('*').eq('render_id', pendingRenderId).maybeSingle();
          if (data) { matchedRender = data; matchedVia = 'pending_render_id'; }
        }

        // Match 2: real_remotion_render_id
        if (!matchedRender && renderId) {
          const { data } = await supabaseAdmin
            .from('video_renders')
            .select('*')
            .filter('content_config->>real_remotion_render_id', 'eq', renderId)
            .in('status', ['rendering', 'pending'])
            .maybeSingle();
          if (data) { matchedRender = data; matchedVia = 'real_remotion_render_id'; }
        }

        // Match 3: out_name
        if (!matchedRender && outName) {
          const { data } = await supabaseAdmin
            .from('video_renders')
            .select('*')
            .filter('content_config->>out_name', 'eq', outName)
            .in('status', ['rendering', 'pending'])
            .maybeSingle();
          if (data) { matchedRender = data; matchedVia = 'out_name'; }
        }

        // Match 4: outputFile suffix match (last resort)
        if (!matchedRender && outputFile) {
          const fileName = outputFile.split('/').pop();
          if (fileName) {
            const { data } = await supabaseAdmin
              .from('video_renders')
              .select('*')
              .filter('content_config->>out_name', 'eq', fileName)
              .in('status', ['rendering', 'pending'])
              .maybeSingle();
            if (data) { matchedRender = data; matchedVia = 'outputFile_suffix'; }
          }
        }

        if (matchedRender) {
          console.log(`✅ Matched via ${matchedVia}, render_id=${matchedRender.render_id}`);

          const existingConfig = (matchedRender.content_config as any) || {};

          await supabaseAdmin.from('video_renders').update({
            status: 'completed',
            video_url: finalOutputUrl,
            error_message: null,
            completed_at: new Date().toISOString(),
            content_config: {
              ...existingConfig,
              real_remotion_render_id: renderId,
              webhook_matched_via: matchedVia,
              webhook_received_at: new Date().toISOString(),
              r41_silentRender: isSilentRender || false,
              r41_audioMuxed: hasAudioToMux && finalOutputUrl !== outputFile,
              // ✅ Preserve forensic fields for post-mortem
              diagnosticProfile: existingConfig?.diagnosticProfile || null,
              diag_flags_effective: existingConfig?.diag_flags_effective || null,
              payload_hash: existingConfig?.payload_hash || null,
              bundle_probe: existingConfig?.bundle_probe || null,
            },
          }).eq('render_id', matchedRender.render_id);

          // Media Library
          if (matchedRender.user_id) {
            const { data: ev } = await supabaseAdmin.from('video_creations').select('id').eq('output_url', finalOutputUrl).maybeSingle();
            if (!ev) {
              await supabaseAdmin.from('video_creations').insert({
                user_id: matchedRender.user_id, output_url: finalOutputUrl, status: 'completed',
                metadata: { source: 'universal-creator', render_id: renderId, matched_via: matchedVia, r41_muxed: hasAudioToMux && finalOutputUrl !== outputFile },
              });
            }
          }

          // Project status
          if (matchedRender.project_id) {
            await supabaseAdmin.from('content_projects').update({ status: 'completed' }).eq('id', matchedRender.project_id);
          }

          // Composer project completion + Media Library auto-save
          if (isComposer && composerProjectId) {
            await supabaseAdmin.from('composer_projects').update({
              status: 'completed',
              output_url: finalOutputUrl,
              updated_at: new Date().toISOString(),
            }).eq('id', composerProjectId);
            console.log('✅ composer_projects marked completed:', composerProjectId);

            // Auto-save composer render into Media Library (idempotent via output_url)
            const composerUserId = matchedRender.user_id || userId;
            if (composerUserId) {
              const { data: existingComposer } = await supabaseAdmin
                .from('video_creations')
                .select('id')
                .eq('output_url', finalOutputUrl)
                .maybeSingle();
              if (!existingComposer) {
                // Pull scene metadata for richer entry
                const { data: composerProj } = await supabaseAdmin
                  .from('composer_projects')
                  .select('title, storyboard, briefing')
                  .eq('id', composerProjectId)
                  .maybeSingle();
                const storyboard = (composerProj?.storyboard as any[]) || [];
                const totalDuration = storyboard.reduce((s, sc) => s + (sc?.durationSeconds || 0), 0);

                await supabaseAdmin.from('video_creations').insert({
                  user_id: composerUserId,
                  output_url: finalOutputUrl,
                  status: 'completed',
                  metadata: {
                    source: 'composer',
                    composer_project_id: composerProjectId,
                    render_id: renderId,
                    title: composerProj?.title || 'Motion Studio Video',
                    scenes_count: storyboard.length,
                    total_duration: totalDuration,
                  },
                });
                console.log('✅ Composer video saved to Media Library');
              }
            }

            // ── Preset export sync: if this render belongs to a composer_exports row, mark it completed
            const exportId = customData?.export_id;
            if (exportId) {
              await supabaseAdmin.from('composer_exports').update({
                status: 'completed',
                video_url: finalOutputUrl,
                actual_cost_euros: 0.10,
                completed_at: new Date().toISOString(),
              }).eq('id', exportId);
              console.log('✅ composer_exports marked completed:', exportId);
            }
          }

          // Long-Form (sora_long_form) project completion sync
          if (isLongForm && longFormProjectId) {
            await supabaseAdmin.from('sora_long_form_projects').update({
              status: 'completed',
              final_video_url: finalOutputUrl,
              updated_at: new Date().toISOString(),
            }).eq('id', longFormProjectId);
            console.log('✅ sora_long_form_projects marked completed:', longFormProjectId);
          }

          // Update universal_video_progress — PRIMARY via progressId, fallback via renderId scan
          try {
            let progressUpdated = false;
            
            // Primary: direct progressId match — ✅ Phase 12: MERGE result_data to preserve buildTag etc.
            if (progressIdFromWebhook) {
              const { data: existingProg } = await supabaseAdmin.from('universal_video_progress')
                .select('result_data').eq('id', progressIdFromWebhook).maybeSingle();
              const existingRd = (existingProg?.result_data as any) || {};
              
              const { error: pErr } = await supabaseAdmin.from('universal_video_progress').update({
                status: 'completed', progress_percent: 100, current_step: 'completed',
                result_data: { ...existingRd, renderId: matchedRender.render_id, outputUrl: finalOutputUrl, r41_muxed: hasAudioToMux && finalOutputUrl !== outputFile, completedAt: new Date().toISOString() },
              }).eq('id', progressIdFromWebhook);
              if (!pErr) {
                console.log('✅ universal_video_progress completed via progressId (merged):', progressIdFromWebhook);
                progressUpdated = true;
              }
            }
            
            // Fallback: scan by renderId in result_data
            if (!progressUpdated) {
              const { data: progressEntries } = await supabaseAdmin
                .from('universal_video_progress')
                .select('id, result_data, status')
                .in('status', ['rendering', 'processing', 'pending'])
                .limit(20);
              if (progressEntries) {
                for (const entry of progressEntries) {
                  const rd = entry.result_data as any;
                  if (rd?.renderId === matchedRender.render_id) {
                    await supabaseAdmin.from('universal_video_progress').update({
                      status: 'completed', progress_percent: 100, current_step: 'completed',
                      result_data: { ...rd, outputUrl: finalOutputUrl, r41_muxed: hasAudioToMux && finalOutputUrl !== outputFile },
                    }).eq('id', entry.id);
                    console.log('✅ universal_video_progress completed via renderId scan:', entry.id);
                    break;
                  }
                }
              }
            }
          } catch (e) { console.error('⚠️ Progress update error:', e); }
        } else {
          // No match found — try direct renderId update as last resort
          console.log('⚠️ No match found, trying direct renderId:', renderId);
          await supabaseAdmin.from('video_renders').update({
            status: 'completed', video_url: outputFile, error_message: null,
            completed_at: new Date().toISOString(),
          }).eq('render_id', renderId);
        }
      }

    } else if (type === 'error' || type === 'timeout') {
      console.error(`❌ Render ${renderId} failed:`, errors);
      console.error(`❌ Full errors object:`, JSON.stringify(errors, null, 2));

      // ✅ r23: Handle undefined errors for timeout webhooks
      const rawErrorMessage = Array.isArray(errors)
        ? errors.map(e => typeof e === 'object' ? (e.message || JSON.stringify(e)) : String(e)).join(', ')
        : (typeof errors === 'object' && errors != null ? (errors?.message || JSON.stringify(errors)) : (errors?.toString() || ''));
      
      // If errors is undefined/null (common for timeout webhooks), provide a meaningful message
      const errorMessage = rawErrorMessage && rawErrorMessage !== 'undefined' && rawErrorMessage !== 'null'
        ? rawErrorMessage
        : (type === 'timeout' 
          ? 'Lambda-Timeout: Rendering hat das Zeitlimit von 600s überschritten. Zu viele Frames pro Lambda.'
          : 'Unbekannter Rendering-Fehler');

      // ✅ Build full error forensics for DB persistence
      const lambdaErrorFull = JSON.stringify(errors, null, 2)?.substring(0, 4000) || null;

      // ✅ STRUCTURED ERROR CATEGORY — replaces fragile frontend string-matching
      const classifyError = (msg: string): 'rate_limit' | 'lambda_crash' | 'validation' | 'timeout' | 'audio_corruption' | 'access_denied' | 'unknown' => {
        const lower = msg.toLowerCase();
        if (/access denied|accessdenied|forbidden|\b403\b/i.test(lower)) return 'access_denied';
        if (/rate exceeded|concurrency limit|throttl/i.test(lower)) return 'rate_limit';
        if (/ffprobe.*failed|ffprobe.*exit code|invalid data found.*processing input|failed to find.*mpeg audio|not a valid audio/i.test(lower)) return 'audio_corruption';
        if (/waiting for lottie|delayrender.*lottie|lottie.*animation.*load/i.test(lower)) return 'lambda_crash';
        if (/reading '(length|0)'|reading "(length|0)"|getrealframerange/i.test(lower)) return 'lambda_crash';
        if (/codec|preset|framerange|invalid|schema|zod/i.test(lower)) return 'validation';
        // Remote-media abort / streaming abort during Lambda runtime
        if (/the operation was aborted|aborterror|createasynciterator|node:internal\/streams/i.test(lower)) return 'lambda_crash';
        if (type === 'timeout') return 'timeout';
        return 'unknown';
      };
      const errorCategory = classifyError(errorMessage);
      console.log(`🏷️ Error category: ${errorCategory}`);

      const errorFingerprint = (() => {
        try {
          if (Array.isArray(errors) && errors.length > 0) {
            const first = errors[0];
            const stack = first?.stack || first?.stackTrace || '';
            const firstLine = typeof stack === 'string' ? stack.split('\n')[0]?.trim() : '';
            return `${first?.name || first?.errorType || 'unknown'}::${firstLine}`.substring(0, 200);
          }
          if (typeof errors === 'object' && errors) {
            const stack = (errors as any)?.stack || (errors as any)?.stackTrace || '';
            const firstLine = typeof stack === 'string' ? stack.split('\n')[0]?.trim() : '';
            return `${(errors as any)?.name || (errors as any)?.errorType || 'unknown'}::${firstLine}`.substring(0, 200);
          }
          return 'unknown';
        } catch { return 'parse-error'; }
      })();

      console.log(`🔍 Error fingerprint: ${errorFingerprint}`);

      if (isDialogTurnPreclip) {
        // ── Per-Turn Preclip failure: shot retrybar markieren, NICHT die ──
        // ── ganze Szene refunden — poll-dialog-shots redispatcht den       ──
        // ── Preclip oder fällt zurück auf den Master+segments_secs-Pfad.   ──
        if (pendingRenderId) {
          await supabaseAdmin.from('video_renders').update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          }).eq('render_id', pendingRenderId);
        }
        const shotIdx = Number(customData?.shot_idx);
        if (composerSceneId && Number.isFinite(shotIdx)) {
          await withDialogLock(supabaseAdmin, composerSceneId, 'webhook-preclip-fail', async () => {
            const { data: sceneRow } = await supabaseAdmin
              .from('composer_scenes')
              .select('dialog_shots')
              .eq('id', composerSceneId)
              .maybeSingle();
            const prevState = (sceneRow?.dialog_shots as any) || {};
            const shots = Array.isArray(prevState.shots) ? [...prevState.shots] : [];
            if (shots[shotIdx]) {
              shots[shotIdx] = {
                ...shots[shotIdx],
                preclip_status: 'failed',
                preclip_render_id: undefined,
                preclip_error: errorMessage.slice(0, 240),
                preclip_retry_count: (Number(shots[shotIdx].preclip_retry_count) || 0) + 1,
              };
              await supabaseAdmin.from('composer_scenes').update({
                dialog_shots: { ...prevState, shots },
                updated_at: new Date().toISOString(),
              }).eq('id', composerSceneId);
            }
          }, { ttlSeconds: 30 });
          // v70: poll-dialog-shots removed; failure path is owned by
          // sync-so-webhook + lipsync-watchdog.
          console.log(`🎬 [dialog-turn-preclip] scene ${composerSceneId} shot ${shotIdx} failed: ${errorMessage.slice(0, 120)}`);
        }
      } else if (isDialogStitch) {
        // ── Dialog-stitch failure path: mark scene failed + refund credits
        //    idempotently via dialog_shots.refunded. Sync.so per-turn costs
        //    were charged up-front by compose-dialog-scene.
        if (pendingRenderId) {
          await supabaseAdmin.from('video_renders').update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          }).eq('render_id', pendingRenderId);
        }
        if (composerSceneId) {
          await withDialogLock(supabaseAdmin, composerSceneId, 'webhook-stitch-fail', async () => {
            const { data: sceneRow } = await supabaseAdmin
              .from('composer_scenes')
              .select('dialog_shots, project_id')
              .eq('id', composerSceneId)
              .maybeSingle();
            const prevState = (sceneRow?.dialog_shots as any) || {};
            let refundedFlag = !!prevState.refunded;
            const refundCredits = Number(prevState.cost_credits) || 0;
            if (!refundedFlag && refundCredits > 0 && userId) {
              try {
                await supabaseAdmin.rpc('increment_balance', { p_user_id: userId, p_amount: refundCredits });
                refundedFlag = true;
              } catch (e) {
                console.warn('💋 [dialog-stitch] refund failed', (e as Error).message);
              }
            }
            await supabaseAdmin.from('composer_scenes').update({
              lip_sync_status: 'failed',
              twoshot_stage: 'failed',
              clip_error: `dialog_stitch_lambda_failed: ${errorMessage}`.slice(0, 300),
              dialog_shots: {
                ...prevState,
                status: 'failed',
                error: errorMessage.slice(0, 500),
                refunded: refundedFlag,
              },
              updated_at: new Date().toISOString(),
            }).eq('id', composerSceneId);
          }, { ttlSeconds: 30 });
          console.log(`💋 [dialog-stitch] scene ${composerSceneId} failed: ${errorMessage.slice(0, 120)}`);
        }
      } else if (isDirectorsCut && renderJobId) {
        const { data: renderJob } = await supabaseAdmin
          .from('director_cut_renders')
          .select('user_id, credits_used, render_config, status')
          .eq('id', renderJobId)
          .single();
        const existingCfg = (renderJob?.render_config as any) || {};
        const alreadyRefunded = existingCfg.credit_refund_done === true;
        const alreadyCompleted = renderJob?.status === 'completed';
        const shouldRefund = !alreadyCompleted && !alreadyRefunded && Number(renderJob?.credits_used || 0) > 0 && renderJob?.user_id;

        const directorCutFailureUpdate: any = {
          status: alreadyCompleted ? 'completed' : 'failed',
          error_message: alreadyCompleted ? null : errorMessage,
          remotion_render_id: renderId || null,
          bucket_name: bucketName || null,
          render_config: {
            ...existingCfg,
            lambda_error_full: lambdaErrorFull,
            error_fingerprint: errorFingerprint,
            error_category: errorCategory,
            webhook_error_type: type,
            webhook_received_at: new Date().toISOString(),
            webhook_render_id: renderId,
            bucket_name: bucketName,
            failure_stage: 'lambda-runtime',
            credit_refund_done: shouldRefund ? true : alreadyRefunded,
            credit_refunded_at: shouldRefund ? new Date().toISOString() : existingCfg.credit_refunded_at,
            credit_refund_reason: shouldRefund ? 'director_cut_lambda_failed' : existingCfg.credit_refund_reason,
          },
        };
        if (!alreadyCompleted) {
          directorCutFailureUpdate.completed_at = new Date().toISOString();
        }

        await supabaseAdmin.from('director_cut_renders').update(directorCutFailureUpdate).eq('id', renderJobId);

        if (shouldRefund) {
          await supabaseAdmin.rpc('increment_balance', { p_user_id: renderJob.user_id, p_amount: renderJob.credits_used });
          console.log(`💰 Refunded ${renderJob.credits_used} credits for failed Director's Cut render ${renderJobId}`);
        } else if (alreadyRefunded) {
          console.log(`💰 Skip Director's Cut refund — already refunded for ${renderJobId}`);
        }
      } else {
        // Use same 3-way matching for failure
        let matchedId = pendingRenderId;
        if (!matchedId && renderId) {
          const { data } = await supabaseAdmin.from('video_renders').select('render_id')
            .filter('content_config->>real_remotion_render_id', 'eq', renderId).maybeSingle();
          if (data) matchedId = data.render_id;
        }
        if (!matchedId && outName) {
          const { data } = await supabaseAdmin.from('video_renders').select('render_id')
            .filter('content_config->>out_name', 'eq', outName).maybeSingle();
          if (data) matchedId = data.render_id;
        }
        matchedId = matchedId || renderId;

        // ✅ FORENSICS: Read existing content_config to preserve + augment
        const { data: existingRow } = await supabaseAdmin.from('video_renders')
          .select('content_config, status').eq('render_id', matchedId).maybeSingle();
        const existingCfg = (existingRow?.content_config as any) || {};
        const alreadyRefunded = existingCfg.credit_refund_done === true;
        const alreadyCompleted = existingRow?.status === 'completed';

        if (!alreadyCompleted) {
          await supabaseAdmin.from('video_renders').update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
            content_config: {
              ...existingCfg,
              lambda_error_full: lambdaErrorFull,
              error_fingerprint: errorFingerprint,
              error_category: errorCategory,
              webhook_error_type: type,
              webhook_received_at: new Date().toISOString(),
              webhook_render_id: renderId,
              failure_stage: 'lambda-runtime',
              credit_refund_done: alreadyRefunded || (creditsUsed && userId ? true : alreadyRefunded),
            },
          }).eq('render_id', matchedId);
        }

        if (creditsUsed && userId && !alreadyRefunded && !alreadyCompleted) {
          await supabaseAdmin.rpc('increment_balance', { p_user_id: userId, p_amount: creditsUsed });
          console.log(`💰 Refunded ${creditsUsed} credits for failed render ${matchedId}`);
        } else if (alreadyRefunded) {
          console.log(`💰 Skip refund — already refunded for ${matchedId}`);
        }

        // Composer project failure
        if (isComposer && composerProjectId) {
          await supabaseAdmin.from('composer_projects').update({
            status: 'failed',
            updated_at: new Date().toISOString(),
          }).eq('id', composerProjectId);
          console.log('✅ composer_projects marked failed:', composerProjectId);

          // Preset export failure sync
          const exportId = customData?.export_id;
          if (exportId) {
            await supabaseAdmin.from('composer_exports').update({
              status: 'failed',
              error_message: errorMessage.substring(0, 500),
            }).eq('id', exportId);
          }
        }

        // Long-Form failure sync
        if (isLongForm && longFormProjectId) {
          await supabaseAdmin.from('sora_long_form_projects').update({
            status: 'failed',
            updated_at: new Date().toISOString(),
          }).eq('id', longFormProjectId);
          console.log('✅ sora_long_form_projects marked failed:', longFormProjectId);
        }

        // r28: Update universal_video_progress — MERGE errorCategory into result_data
        try {
          let progressUpdated = false;
          
          const errorResultData = {
            errorCategory,
            errorMessage: errorMessage.substring(0, 500),
            errorFingerprint,
            webhookType: type,
            failedAt: new Date().toISOString(),
            webhookRenderId: renderId,
            // r42: failure stage for isolation diagnostics
            failureStage: 'lambda-runtime',
          };
          
          if (progressIdFromWebhook) {
            // Read existing result_data to merge (preserve lambdaPayload etc.)
            const { data: existingProg } = await supabaseAdmin.from('universal_video_progress')
              .select('result_data').eq('id', progressIdFromWebhook).maybeSingle();
            const existingRd = (existingProg?.result_data as any) || {};
            
            const { error: pErr } = await supabaseAdmin.from('universal_video_progress').update({
              status: 'failed', progress_percent: 0, current_step: 'failed',
              status_message: `Rendering fehlgeschlagen: ${errorMessage.substring(0, 200)}`,
              result_data: { ...existingRd, ...errorResultData },
            }).eq('id', progressIdFromWebhook);
            if (!pErr) {
              console.log('✅ universal_video_progress failed via progressId:', progressIdFromWebhook, 'errorCategory:', errorCategory);
              progressUpdated = true;
            }
          }
          
          if (!progressUpdated) {
            const { data: entries } = await supabaseAdmin.from('universal_video_progress')
              .select('id, result_data').in('status', ['rendering', 'processing', 'pending']).limit(20);
            if (entries) {
              for (const entry of entries) {
                const rd = entry.result_data as any;
                if (rd?.renderId === matchedId) {
                  await supabaseAdmin.from('universal_video_progress').update({
                    status: 'failed', progress_percent: 0, current_step: 'failed',
                    status_message: `Rendering fehlgeschlagen: ${errorMessage.substring(0, 200)}`,
                    result_data: { ...rd, ...errorResultData },
                  }).eq('id', entry.id);
                  console.log('✅ universal_video_progress failed via renderId scan, errorCategory:', errorCategory);
                  break;
                }
              }
            }
          }
        } catch (e) { console.error('⚠️ Progress update error:', e); }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Webhook processed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
