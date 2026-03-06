import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AWS_REGION = 'eu-central-1';
const DEFAULT_BUCKET_NAME = 'remotionlambda-eucentral1-13gm4o6s90';
const RENDER_TIMEOUT_SECONDS = 720; // 12 min
const MAX_RECONCILIATION_PAGES = 20; // max 20 pages × 200 keys = 4000 keys

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { render_id, renderId, source } = await req.json();
    const effectiveRenderId = render_id || renderId;
    if (!effectiveRenderId) throw new Error('render_id is required');

    console.log('📊 Checking progress for:', effectiveRenderId, 'source:', source);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region: AWS_REGION,
    });

    const isDirectorsCut = source === 'directors-cut';
    const tableName = isDirectorsCut ? 'director_cut_renders' : 'video_renders';
    const renderIdColumn = isDirectorsCut ? 'remotion_render_id' : 'render_id';
    const outputColumn = isDirectorsCut ? 'output_url' : 'video_url';

    const { data: renderData, error: renderError } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq(renderIdColumn, effectiveRenderId)
      .maybeSingle();

    if (renderError) console.error('DB query error:', renderError);

    // Already completed
    if (renderData?.status === 'completed' && renderData[outputColumn]) {
      return jsonResponse({ render_id: effectiveRenderId, progress: { done: true, outputFile: renderData[outputColumn], overallProgress: 1 }, status: 'completed' });
    }

    // Extract tracking data from content_config
    const cc = (renderData?.content_config as any) || {};
    const realRenderId = cc.real_remotion_render_id || null;
    const outName = cc.out_name || null;
    const trackingMode = cc.tracking_mode || 'unknown';
    const bucketName = renderData?.bucket_name || cc.bucket_name || DEFAULT_BUCKET_NAME;

    console.log(`🔧 Tracking: real_id=${realRenderId}, outName=${outName}, mode=${trackingMode}`);

    // ============================================
    // FAILED STATUS — still try S3 recovery
    // ============================================
    if (renderData?.status === 'failed') {
      console.log('⚠️ Render marked failed, attempting S3 recovery...');
      const recoveredUrl = await findVideoOnS3(aws, bucketName, realRenderId, outName, effectiveRenderId, supabaseAdmin, tableName, renderIdColumn, outputColumn, renderData);
      if (recoveredUrl) {
        return jsonResponse({ render_id: effectiveRenderId, progress: { done: true, outputFile: recoveredUrl, overallProgress: 1 }, status: 'completed' });
      }
      // ✅ Pass errorCategory from content_config
      const storedCategory = cc.error_category || 'unknown';
      return jsonResponse({
        render_id: effectiveRenderId,
        progress: { done: false, fatalErrorEncountered: true, errors: [renderData.error_message || 'Render failed'], overallProgress: 0, errorCategory: storedCategory },
        status: 'failed',
      });
    }

    // ============================================
    // TIMEOUT CHECK
    // ============================================
    const lambdaInvokedAt = cc.lambda_invoked_at ? new Date(cc.lambda_invoked_at).getTime() : null;
    const createdAt = renderData?.created_at ? new Date(renderData.created_at).getTime() : Date.now();
    const timeoutAnchor = lambdaInvokedAt || createdAt;
    const elapsedSeconds = (Date.now() - timeoutAnchor) / 1000;

    if (elapsedSeconds > RENDER_TIMEOUT_SECONDS) {
      console.log(`⏰ TIMEOUT after ${Math.round(elapsedSeconds)}s, last-resort S3 search...`);
      const recoveredUrl = await findVideoOnS3(aws, bucketName, realRenderId, outName, effectiveRenderId, supabaseAdmin, tableName, renderIdColumn, outputColumn, renderData);
      if (recoveredUrl) {
        return jsonResponse({ render_id: effectiveRenderId, progress: { done: true, outputFile: recoveredUrl, overallProgress: 1 }, status: 'completed' });
      }

      // Truly timed out — r28: persist errorCategory in both tables
      const existingCfgTimeout = (renderData?.content_config as any) || {};
      await supabaseAdmin.from(tableName).update({
        status: 'failed',
        error_message: `Render-Timeout nach ${Math.round(RENDER_TIMEOUT_SECONDS / 60)} Minuten. tracking_mode=${trackingMode}, real_id=${realRenderId || 'none'}`,
        content_config: { ...existingCfgTimeout, error_category: 'timeout' },
      }).eq(renderIdColumn, effectiveRenderId);

      if (renderData?.user_id) {
        const { data: progressRows } = await supabaseAdmin
          .from('universal_video_progress')
          .select('id, result_data')
          .eq('user_id', renderData.user_id)
          .in('status', ['processing', 'pending', 'rendering'])
          .order('created_at', { ascending: false })
          .limit(1);
        if (progressRows?.length) {
          const existingRd = (progressRows[0].result_data as any) || {};
          await supabaseAdmin.from('universal_video_progress').update({
            current_step: 'failed', status: 'failed', progress_percent: 0,
            status_message: `Render-Timeout nach ${Math.round(RENDER_TIMEOUT_SECONDS / 60)} Min. Mode: ${trackingMode}`,
            result_data: {
              ...existingRd,
              errorCategory: 'timeout',
              errorMessage: `Render-Timeout nach ${Math.round(RENDER_TIMEOUT_SECONDS / 60)} Min.`,
              failedAt: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          }).eq('id', progressRows[0].id);
        }
      }

      // Refund credits
      if (cc.credits_used && renderData?.user_id) {
        try {
          await supabaseAdmin.rpc('increment_balance', { p_user_id: renderData.user_id, p_amount: cc.credits_used });
          console.log(`💰 Refunded ${cc.credits_used} credits`);
        } catch (e) { console.error('Refund error:', e); }
      }

      return jsonResponse({
        render_id: effectiveRenderId,
        progress: { done: false, fatalErrorEncountered: true, errors: [`Render-Timeout nach ${Math.round(RENDER_TIMEOUT_SECONDS / 60)} Min.`], overallProgress: 0, errorCategory: 'timeout' },
        status: 'failed',
        diagnostics: { trackingMode, realRenderId, elapsedSeconds: Math.round(elapsedSeconds) },
      });
    }

    // ============================================
    // CHECK S3 FOR COMPLETED VIDEO
    // ============================================
    const foundUrl = await findVideoOnS3(aws, bucketName, realRenderId, outName, effectiveRenderId, supabaseAdmin, tableName, renderIdColumn, outputColumn, renderData);
    if (foundUrl) {
      return jsonResponse({ render_id: effectiveRenderId, progress: { done: true, outputFile: foundUrl, overallProgress: 1 }, status: 'completed' });
    }

    // ============================================
    // CHECK progress.json
    // ============================================
    let estimatedProgress = 0.15;
    let progressSource = 'default';

    try {
      // Try real render ID first, then pending render ID
      const idsToTry = [realRenderId, effectiveRenderId].filter(Boolean);
      let progressJson: any = null;

      for (const id of idsToTry) {
        const progressUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/renders/${id}/progress.json`;
        const resp = await aws.fetch(progressUrl, { method: 'GET' });
        if (resp.ok) {
          progressJson = await resp.json();
          console.log(`✅ Found progress.json via id=${id}`);
          break;
        }
      }

      if (progressJson) {
        // Check errors
        if (progressJson.errors?.length || progressJson.fatalErrorEncountered) {
          const errorMessages = (progressJson.errors || [progressJson.message || 'Fatal error']).map((e: any) =>
            typeof e === 'string' ? e : (e.message || JSON.stringify(e)));

          // ✅ STRUCTURED ERROR CATEGORY
          const combinedMsg = errorMessages.join(' ').toLowerCase();
          let errorCategory: 'rate_limit' | 'lambda_crash' | 'validation' | 'unknown' = 'unknown';
          if (/rate exceeded|concurrency limit|throttl/i.test(combinedMsg)) errorCategory = 'rate_limit';
          else if (/reading '(length|0)'|reading "(length|0)"|getrealframerange/i.test(combinedMsg)) errorCategory = 'lambda_crash';
          else if (/codec|preset|framerange|invalid|schema|zod/i.test(combinedMsg)) errorCategory = 'validation';

          const existingCfg = (renderData?.content_config as any) || {};
          await supabaseAdmin.from(tableName).update({
            status: 'failed', error_message: errorMessages[0],
            content_config: { ...existingCfg, error_category: errorCategory },
          }).eq(renderIdColumn, effectiveRenderId);

          if (cc.credits_used && renderData?.user_id) {
            try { await supabaseAdmin.rpc('increment_balance', { p_user_id: renderData.user_id, p_amount: cc.credits_used }); } catch {}
          }

          return jsonResponse({
            render_id: effectiveRenderId,
            progress: { done: false, fatalErrorEncountered: true, errors: errorMessages, overallProgress: 0, errorCategory },
            status: 'failed',
          });
        }

        // Progress value
        if (typeof progressJson.overallProgress === 'number') {
          estimatedProgress = progressJson.overallProgress;
          progressSource = 's3-progress-json';
        }

        // Done?
        if (progressJson.done && progressJson.outputFile) {
          await supabaseAdmin.from(tableName).update({
            status: 'completed', [outputColumn]: progressJson.outputFile, completed_at: new Date().toISOString(),
          }).eq(renderIdColumn, effectiveRenderId);

          return jsonResponse({
            render_id: effectiveRenderId,
            progress: { done: true, outputFile: progressJson.outputFile, overallProgress: 1 },
            status: 'completed',
          });
        }
      }
    } catch (e) {
      console.log('⚠️ progress.json check error:', e);
    }

    // ============================================
    // TIME-BASED FALLBACK
    // ============================================
    if (progressSource === 'default') {
      const typicalRenderTime = 180;
      const rawProgress = elapsedSeconds / typicalRenderTime;
      if (rawProgress < 0.2) estimatedProgress = rawProgress * 0.5;
      else if (rawProgress < 0.8) estimatedProgress = 0.1 + (rawProgress - 0.2) * 1.2;
      else estimatedProgress = 0.82 + (rawProgress - 0.8) * 0.5;
      estimatedProgress = Math.max(0.05, Math.min(estimatedProgress, 0.92));
      progressSource = 'time-based';
    }

    return jsonResponse({
      render_id: effectiveRenderId,
      progress: { done: false, overallProgress: estimatedProgress, progressSource },
      status: 'rendering',
      diagnostics: { trackingMode, realRenderId, elapsedSeconds: Math.round(elapsedSeconds), progressSource },
    });

  } catch (error) {
    console.error('Error in check-remotion-progress:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================
// HELPER: Build JSON response
// ============================================
function jsonResponse(data: any) {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ============================================
// HELPER: Find video on S3 using multiple strategies
// 1. renders/{realRenderId}/{outName}
// 2. renders/{realRenderId}/out.mp4
// 3. Direct outName at bucket root
// 4. renders/{pendingRenderId}/out.mp4
// 5. Paginated ListObjectsV2 searching for outName
// ============================================
async function findVideoOnS3(
  aws: any, bucketName: string, realRenderId: string | null, outName: string | null,
  pendingRenderId: string, supabaseAdmin: any, tableName: string, renderIdColumn: string,
  outputColumn: string, renderData: any,
): Promise<string | null> {
  // Build candidate keys in priority order
  const keysToCheck: string[] = [];

  if (realRenderId && outName) keysToCheck.push(`renders/${realRenderId}/${outName}`);
  if (realRenderId) keysToCheck.push(`renders/${realRenderId}/out.mp4`);
  if (outName) keysToCheck.push(outName); // bucket root
  keysToCheck.push(`renders/${pendingRenderId}/out.mp4`);
  if (outName) keysToCheck.push(`renders/${pendingRenderId}/${outName}`);

  // Deduplicate
  const uniqueKeys = [...new Set(keysToCheck)];
  console.log('🔍 S3 keys to check:', uniqueKeys);

  for (const key of uniqueKeys) {
    const url = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    try {
      const resp = await aws.fetch(url, { method: 'HEAD' });
      if (resp.ok) {
        console.log(`✅ Video found at: ${key}`);
        await markCompleted(supabaseAdmin, tableName, renderIdColumn, outputColumn, pendingRenderId, url, renderData);
        return url;
      }
    } catch {}
  }

  // ============================================
  // PAGINATED S3 ListObjects reconciliation via outName
  // ============================================
  if (outName) {
    console.log(`🔍 Paginated S3 search for outName: ${outName}`);
    let continuationToken: string | null = null;
    let pagesScanned = 0;

    do {
      let listUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/?list-type=2&prefix=renders/&max-keys=200`;
      if (continuationToken) {
        listUrl += `&continuation-token=${encodeURIComponent(continuationToken)}`;
      }

      try {
        const listResp = await aws.fetch(listUrl, { method: 'GET' });
        if (!listResp.ok) { console.log('⚠️ ListObjects failed:', listResp.status); break; }

        const xml = await listResp.text();
        pagesScanned++;

        // Search for outName in keys
        const keyRegex = /<Key>([^<]+)<\/Key>/g;
        let match;
        while ((match = keyRegex.exec(xml)) !== null) {
          const key = match[1];
          if (key.endsWith(outName)) {
            console.log(`✅ Found via paginated search (page ${pagesScanned}): ${key}`);

            // Extract real render ID from path: renders/{realId}/{outName}
            const parts = key.split('/');
            const discoveredRealId = parts.length >= 3 ? parts[1] : null;

            const videoUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${key}`;
            // Verify
            const headResp = await aws.fetch(videoUrl, { method: 'HEAD' });
            if (headResp.ok) {
              // Update with discovered real render ID
              if (discoveredRealId && renderData?.content_config) {
                renderData.content_config = {
                  ...(renderData.content_config as any),
                  real_remotion_render_id: discoveredRealId,
                  reconciled_via: 'paginated-s3-list',
                  reconciled_at: new Date().toISOString(),
                  pages_scanned: pagesScanned,
                };
              }
              await markCompleted(supabaseAdmin, tableName, renderIdColumn, outputColumn, pendingRenderId, videoUrl, renderData);
              return videoUrl;
            }
          }
        }

        // Check for more pages
        const isTruncated = xml.includes('<IsTruncated>true</IsTruncated>');
        const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
        continuationToken = isTruncated && tokenMatch ? tokenMatch[1] : null;

      } catch (e) {
        console.error('⚠️ ListObjects error:', e);
        break;
      }
    } while (continuationToken && pagesScanned < MAX_RECONCILIATION_PAGES);

    console.log(`📊 Paginated search complete: ${pagesScanned} pages scanned, not found`);
  }

  return null;
}

// ============================================
// HELPER: Mark render as completed and save to Media Library
// ============================================
async function markCompleted(
  supabaseAdmin: any, tableName: string, renderIdColumn: string,
  outputColumn: string, renderId: string, videoUrl: string, renderData: any,
) {
  const updateData: any = {
    status: 'completed',
    [outputColumn]: videoUrl,
    completed_at: new Date().toISOString(),
    error_message: null,
  };
  if (renderData?.content_config) {
    updateData.content_config = renderData.content_config;
  }

  await supabaseAdmin.from(tableName).update(updateData).eq(renderIdColumn, renderId);

  // Save to Media Library
  if (renderData?.user_id) {
    const { data: ev } = await supabaseAdmin.from('video_creations').select('id').eq('output_url', videoUrl).maybeSingle();
    if (!ev) {
      await supabaseAdmin.from('video_creations').insert({
        user_id: renderData.user_id,
        output_url: videoUrl,
        status: 'completed',
        metadata: { source: 'universal-creator', render_id: renderId },
      });
    }
    const { data: ea } = await supabaseAdmin.from('media_assets').select('id').eq('original_url', videoUrl).maybeSingle();
    if (!ea) {
      await supabaseAdmin.from('media_assets').insert({
        user_id: renderData.user_id, type: 'video', original_url: videoUrl, storage_path: videoUrl, source: 'remotion-render',
      });
    }
  }

  // Update universal_video_progress
  if (renderData?.user_id) {
    const { data: rows } = await supabaseAdmin
      .from('universal_video_progress')
      .select('id, result_data')
      .eq('user_id', renderData.user_id)
      .in('status', ['processing', 'pending', 'rendering'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (rows?.length) {
      const rd = (rows[0].result_data as any) || {};
      await supabaseAdmin.from('universal_video_progress').update({
        status: 'completed', current_step: 'completed', progress_percent: 100,
        status_message: '✅ Video fertig!',
        result_data: { ...rd, outputUrl: videoUrl },
        updated_at: new Date().toISOString(),
      }).eq('id', rows[0].id);
    }
  }

  // Update project
  if (renderData?.project_id) {
    await supabaseAdmin.from('content_projects').update({ status: 'completed' }).eq('id', renderData.project_id);
  }
}
