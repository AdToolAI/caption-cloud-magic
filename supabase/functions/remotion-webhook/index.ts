import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, X-Remotion-Status, X-Remotion-Signature, X-Remotion-Mode',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
    const renderJobId = customData?.render_job_id;

    console.log('📋 Webhook details:', { type, renderId, pendingRenderId, outName, userId, isDirectorsCut, progressIdFromWebhook });

    if (type === 'success') {
      console.log(`✅ Render ${renderId} completed`);

      if (isDirectorsCut && renderJobId) {
        const { data: renderJob } = await supabaseAdmin.from('director_cut_renders').select('user_id, credits_used').eq('id', renderJobId).single();
        await supabaseAdmin.from('director_cut_renders').update({
          status: 'completed', output_url: outputFile, error_message: null,
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', renderJobId);
        console.log("✅ Director's Cut render completed");

        if (userId) {
          const { data: existing } = await supabaseAdmin.from('video_creations').select('id').eq('output_url', outputFile).maybeSingle();
          if (!existing) {
            await supabaseAdmin.from('video_creations').insert({
              user_id: userId, output_url: outputFile, status: 'completed',
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
            video_url: outputFile,
            error_message: null,
            completed_at: new Date().toISOString(),
            content_config: {
              ...existingConfig,
              real_remotion_render_id: renderId,
              webhook_matched_via: matchedVia,
              webhook_received_at: new Date().toISOString(),
              // ✅ Preserve forensic fields for post-mortem
              diagnosticProfile: existingConfig?.diagnosticProfile || null,
              diag_flags_effective: existingConfig?.diag_flags_effective || null,
              payload_hash: existingConfig?.payload_hash || null,
              bundle_probe: existingConfig?.bundle_probe || null,
            },
          }).eq('render_id', matchedRender.render_id);

          // Media Library
          if (matchedRender.user_id) {
            const { data: ev } = await supabaseAdmin.from('video_creations').select('id').eq('output_url', outputFile).maybeSingle();
            if (!ev) {
              await supabaseAdmin.from('video_creations').insert({
                user_id: matchedRender.user_id, output_url: outputFile, status: 'completed',
                metadata: { source: 'universal-creator', render_id: renderId, matched_via: matchedVia },
              });
            }
          }

          // Project status
          if (matchedRender.project_id) {
            await supabaseAdmin.from('content_projects').update({ status: 'completed' }).eq('id', matchedRender.project_id);
          }

          // Update universal_video_progress — PRIMARY via progressId, fallback via renderId scan
          try {
            let progressUpdated = false;
            
            // Primary: direct progressId match
            if (progressIdFromWebhook) {
              const { error: pErr } = await supabaseAdmin.from('universal_video_progress').update({
                status: 'completed', progress_percent: 100, current_step: 'completed',
                result_data: { renderId: matchedRender.render_id, outputUrl: outputFile },
              }).eq('id', progressIdFromWebhook);
              if (!pErr) {
                console.log('✅ universal_video_progress completed via progressId:', progressIdFromWebhook);
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
                      result_data: { ...rd, outputUrl: outputFile },
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

      const errorMessage = Array.isArray(errors)
        ? errors.map(e => typeof e === 'object' ? (e.message || JSON.stringify(e)) : String(e)).join(', ')
        : (typeof errors === 'object' ? (errors?.message || JSON.stringify(errors)) : (errors?.toString() || 'Unknown error'));

      // ✅ Build full error forensics for DB persistence
      const lambdaErrorFull = JSON.stringify(errors, null, 2)?.substring(0, 4000) || null;
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

      if (isDirectorsCut && renderJobId) {
        const { data: renderJob } = await supabaseAdmin.from('director_cut_renders').select('user_id, credits_used').eq('id', renderJobId).single();
        await supabaseAdmin.from('director_cut_renders').update({
          status: 'failed', error_message: errorMessage, completed_at: new Date().toISOString(),
        }).eq('id', renderJobId);
        if (renderJob?.credits_used > 0) {
          await supabaseAdmin.rpc('increment_balance', { p_user_id: renderJob.user_id, p_amount: renderJob.credits_used });
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
          .select('content_config').eq('render_id', matchedId).maybeSingle();
        const existingCfg = (existingRow?.content_config as any) || {};

        await supabaseAdmin.from('video_renders').update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
          content_config: {
            ...existingCfg,
            lambda_error_full: lambdaErrorFull,
            error_fingerprint: errorFingerprint,
            webhook_error_type: type,
            webhook_received_at: new Date().toISOString(),
            webhook_render_id: renderId,
          },
        }).eq('render_id', matchedId);

        if (creditsUsed && userId) {
          await supabaseAdmin.rpc('increment_balance', { p_user_id: userId, p_amount: creditsUsed });
        }

        // Update universal_video_progress — PRIMARY via progressId, fallback via renderId scan
        try {
          let progressUpdated = false;
          
          if (progressIdFromWebhook) {
            const { error: pErr } = await supabaseAdmin.from('universal_video_progress').update({
              status: 'failed', progress_percent: 0, current_step: 'failed',
              status_message: `Rendering fehlgeschlagen: ${errorMessage.substring(0, 200)}`,
            }).eq('id', progressIdFromWebhook);
            if (!pErr) {
              console.log('✅ universal_video_progress failed via progressId:', progressIdFromWebhook);
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
                  }).eq('id', entry.id);
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
