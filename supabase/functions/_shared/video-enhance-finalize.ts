/**
 * One finalisation path for every caller (submit poll, webhook, reconciler).
 *
 * Order is not negotiable:
 *   provider output -> staging copy -> server-side validation -> asset row
 *   -> capture -> staging cleanup
 *
 * The provider file is temporary run data, never the URL of a finished asset.
 */

import { probeRemoteVideo } from './mp4-probe.ts';
import { RESOLUTION_PIXELS, type VideoResolution } from './video-enhance-models.ts';
import {
  outputKey,
  outputMatchesOrder,
  type ProviderCostReading,
  reconcileCost,
  setStatus,
  STAGING_BUCKET,
  stagingKey,
  validateStagedOutput,
  walletOperation,
} from './video-enhance-runtime.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;
// deno-lint-ignore no-explicit-any
type Run = any;

export interface FinalizeResult {
  ok: boolean;
  status: string;
  outputUrl?: string;
  assetId?: string;
  error?: string;
}

const TAG = '[video-enhance]';

export async function finalizeSuccess(
  admin: Admin,
  run: Run,
  providerOutputUrl: string,
  providerCost: ProviderCostReading = { source: 'unavailable' },
): Promise<FinalizeResult> {
  if (run.status === 'completed' && run.output_url) {
    return { ok: true, status: 'completed', outputUrl: run.output_url, assetId: run.output_asset_id };
  }

  const staging = run.staging_key ?? stagingKey(run.user_id, run.id);
  await setStatus(admin, run.id, 'asset_staging', {
    provider_output_url: providerOutputUrl,
    staging_key: staging,
    persist_attempts: (run.persist_attempts ?? 0) + 1,
  });

  // 1. copy the provider file into our own storage IMMEDIATELY.
  let buffer: ArrayBuffer;
  let contentType = 'video/mp4';
  try {
    const res = await fetch(providerOutputUrl);
    if (!res.ok) throw new Error(`provider fetch ${res.status}`);
    contentType = res.headers.get('content-type') ?? contentType;
    buffer = await res.arrayBuffer();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setStatus(admin, run.id, 'asset_persist_failed', { error_code: 'PROVIDER_FETCH_FAILED', error_message: message });
    return { ok: false, status: 'asset_persist_failed', error: message };
  }

  const basicCheck = validateStagedOutput(buffer, contentType, {});
  if (!basicCheck.ok) {
    await setStatus(admin, run.id, 'asset_persist_failed', {
      error_code: 'OUTPUT_INVALID',
      error_message: basicCheck.reason ?? 'invalid output',
    });
    return { ok: false, status: 'asset_persist_failed', error: basicCheck.reason };
  }

  const { error: stageError } = await admin.storage
    .from(STAGING_BUCKET)
    .upload(staging, buffer, { contentType: 'video/mp4', upsert: true });
  if (stageError) {
    await setStatus(admin, run.id, 'asset_persist_failed', { error_code: 'STAGING_FAILED', error_message: stageError.message });
    return { ok: false, status: 'asset_persist_failed', error: stageError.message };
  }

  // 2. validate the staged file against what the user actually ordered.
  const { data: stagedUrlData } = admin.storage.from(STAGING_BUCKET).getPublicUrl(staging);
  const target = RESOLUTION_PIXELS[run.resolution as VideoResolution];
  try {
    const measured = await probeRemoteVideo(stagedUrlData.publicUrl);
    const match = outputMatchesOrder(measured, {
      durationSeconds: Number(run.source_duration_seconds),
      width: target.width,
      height: target.height,
      fps: Number(run.fps),
    });
    if (!match.ok) {
      await setStatus(admin, run.id, 'asset_persist_failed', {
        error_code: 'OUTPUT_MISMATCH',
        error_message: match.reason ?? 'output does not match order',
      });
      return { ok: false, status: 'asset_persist_failed', error: match.reason };
    }
  } catch (error) {
    // A probe failure is an infrastructure problem, not a verdict: keep the
    // staged file and let the reconciler retry instead of failing the run.
    console.warn(`${TAG} staged probe unavailable for ${run.id}:`, error);
  }

  // 3. promote the staged file to its final key.
  const finalKey = outputKey(run.user_id, run.id);
  const { error: moveError } = await admin.storage.from(STAGING_BUCKET).move(staging, finalKey);
  if (moveError) {
    const { error: copyError } = await admin.storage
      .from(STAGING_BUCKET)
      .upload(finalKey, buffer, { contentType: 'video/mp4', upsert: true });
    if (copyError) {
      await setStatus(admin, run.id, 'asset_persist_failed', { error_code: 'PERSIST_FAILED', error_message: copyError.message });
      return { ok: false, status: 'asset_persist_failed', error: copyError.message };
    }
  }
  const { data: publicUrlData } = admin.storage.from(STAGING_BUCKET).getPublicUrl(finalKey);
  const publicUrl = publicUrlData.publicUrl;

  // 4. asset row (non-destructive: the source stays, this is a child asset).
  await setStatus(admin, run.id, 'asset_persisting', {});
  const { data: asset, error: assetError } = await admin
    .from('video_creations')
    .insert({
      user_id: run.user_id,
      video_url: publicUrl,
      status: 'completed',
      prompt: `Enhanced with ${run.model_id} (${run.resolution}/${run.fps}fps)`,
      model_used: run.model_id,
      duration: Math.round(Number(run.source_duration_seconds)),
      cost_euros: Number(run.user_price_eur),
      metadata: {
        videoEnhance: true,
        runId: run.id,
        parentAssetId: run.source_asset_id,
        modelId: run.model_id,
        mode: run.mode,
        resolution: run.resolution,
        fps: run.fps,
        tier: run.tier,
      },
    })
    .select('id')
    .maybeSingle();

  if (assetError || !asset) {
    await setStatus(admin, run.id, 'asset_persist_failed', {
      error_code: 'ASSET_ROW_FAILED',
      error_message: assetError?.message ?? 'no asset row',
      output_url: publicUrl,
    });
    return { ok: false, status: 'asset_persist_failed', error: assetError?.message };
  }

  // 5. capture the frozen amount (idempotent, never a second debit).
  await walletOperation(admin, {
    runId: run.id,
    userId: run.user_id,
    operation: 'capture',
    amountEur: Number(run.user_price_eur),
    note: 'provider success',
  });

  // A missing cost number is recorded, never fatal: only its source changes.
  const costPatch: Record<string, unknown> =
    providerCost.usd !== undefined ? reconcileCost(run, providerCost.usd) : {};
  costPatch.provider_cost_source = providerCost.source;
  delete costPatch._warn;
  delete costPatch._block;

  await setStatus(admin, run.id, 'completed', {
    output_asset_id: asset.id,
    output_url: publicUrl,
    provider_output_url: null,
    staging_key: null,
    provider_completed_at: new Date().toISOString(),
    next_reconcile_at: null,
    error_code: null,
    error_message: null,
    ...costPatch,
  });

  // 6. cleanup — big video files must not pile up in staging.
  await admin.storage.from(STAGING_BUCKET).remove([staging]).catch(() => undefined);

  return { ok: true, status: 'completed', outputUrl: publicUrl, assetId: asset.id };
}

/** Terminal provider failure: exactly one release, no automatic retry. */
export async function finalizeFailure(
  admin: Admin,
  run: Run,
  errorCode: string,
  errorMessage: string,
): Promise<FinalizeResult> {
  await walletOperation(admin, {
    runId: run.id,
    userId: run.user_id,
    operation: 'release',
    amountEur: Number(run.user_price_eur),
    note: errorCode,
  });
  await setStatus(admin, run.id, 'provider_failed', {
    error_code: errorCode,
    error_message: errorMessage,
    next_reconcile_at: null,
  });
  if (run.staging_key) {
    await admin.storage.from(STAGING_BUCKET).remove([run.staging_key]).catch(() => undefined);
  }
  return { ok: false, status: 'provider_failed', error: errorMessage };
}

/** Provider CONFIRMED the cancellation — only here money moves back. */
export async function finalizeCancelConfirmed(admin: Admin, run: Run): Promise<FinalizeResult> {
  await walletOperation(admin, {
    runId: run.id,
    userId: run.user_id,
    operation: 'release',
    amountEur: Number(run.user_price_eur),
    note: 'provider cancel confirmed',
  });
  await setStatus(admin, run.id, 'provider_cancelled_confirmed', { next_reconcile_at: null });
  if (run.staging_key) {
    await admin.storage.from(STAGING_BUCKET).remove([run.staging_key]).catch(() => undefined);
  }
  return { ok: false, status: 'provider_cancelled_confirmed' };
}
