/**
 * One finalisation path for every caller (submit poll, webhook, reconciler).
 *
 * Order is not negotiable:
 *   provider output -> resumable transfer into OUR storage -> validation
 *   -> asset row -> capture
 *
 * The provider file is temporary run data, never the URL of a finished asset.
 * The transfer itself is memory bounded and restart safe: nothing larger than
 * one chunk is ever held in RAM and a dead worker resumes at its byte offset
 * (see `video-enhance-transfer.ts`). A failure while STORING the file is a
 * persistence failure — never a provider failure.
 */

import { probeRemoteVideo } from './mp4-probe.ts';
import { refreshProviderOutputUrl } from './video-enhance-provider-read.ts';
import { frameMeetsTarget, resolveTargetFrame } from './video-enhance-frame.ts';
import {
  VIDEO_PRICING_HARD_MULTIPLIER_CAP,
  verifiedPricing,
  type VideoResolution,
} from './video-enhance-models.ts';

import {
  createUploadSession,
  destinationObjectPath,
  headProviderOutput,
  nextPersistAt,
  sessionOffset,
  storedObjectSize,
  transferChunks,
} from './video-enhance-transfer.ts';

import {
  outputMatchesOrder,
  type ProviderCostReading,
  reconcileCost,
  setStatus,
  STAGING_BUCKET,
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

/**
 * One re-request of the provider download link, and only one: the fresh URL is
 * returned exclusively when it actually differs from the expired one, so a
 * provider that keeps handing back the same dead link can never loop here.
 */
async function freshProviderUrl(run: Run, expiredUrl: string): Promise<string | null> {
  const env = (globalThis as any).Deno?.env;
  const fresh = await refreshProviderOutputUrl(run.provider_prediction_id, {
    topaz: env?.get('TOPAZ_API_KEY'),
    replicate: env?.get('REPLICATE_API_KEY'),
  });
  if (!fresh || fresh === expiredUrl) return null;
  console.log(`${TAG} refreshed expired provider link for run ${run.id}`);
  return fresh;
}

/**
 * Our storage failed, the provider did NOT. The provider reference is kept so
 * the next cycle (or an admin) can still recover the finished video; money is
 * never released here.
 */
async function persistFailure(
  admin: Admin,
  run: Run,
  attempts: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Promise<FinalizeResult> {
  await setStatus(admin, run.id, 'asset_persist_failed', {
    error_code: code,
    error_message: message,
    failure_stage: 'persist',
    persist_last_error: message.slice(0, 500),
    persist_attempts: attempts,
    next_persist_at: nextPersistAt(attempts),
    persist_lease_until: null,
    ...extra,
  });
  return { ok: false, status: 'asset_persist_failed', error: message };
}

export async function finalizeSuccess(
  admin: Admin,
  run: Run,
  providerOutputUrl: string,
  providerCost: ProviderCostReading = { source: 'unavailable' },
): Promise<FinalizeResult> {
  if (run.status === 'completed' && run.output_url) {
    return { ok: true, status: 'completed', outputUrl: run.output_url, assetId: run.output_asset_id };
  }

  // Read through globalThis so the shared app typecheck (no Deno typings) passes.
  const env = (globalThis as any).Deno?.env;
  const supabaseUrl = (env?.get('SUPABASE_URL') as string) ?? '';
  const serviceKey = (env?.get('SUPABASE_SERVICE_ROLE_KEY') as string) ?? '';
  const destKey = run.destination_object_path ?? destinationObjectPath(run.user_id, run.id);
  const attempts = Number(run.persist_attempts ?? 0) + 1;

  await setStatus(admin, run.id, 'asset_staging', {
    provider_output_url: providerOutputUrl,
    destination_object_path: destKey,
    persist_attempts: attempts,
  });

  // 1. bring the file into OUR storage, resuming whatever is already there.
  let size = Number(run.expected_content_length) || 0;
  let contentType = String(run.expected_content_type ?? 'video/mp4');
  const stored = await storedObjectSize(admin, STAGING_BUCKET, destKey);
  const alreadyComplete = stored !== null && stored > 0 && (size === 0 || stored >= size);

  if (!alreadyComplete) {
    let head = await headProviderOutput(providerOutputUrl);
    if (!head.ok && head.gone) {
      // A download link can EXPIRE without the file being gone. Ask the
      // provider once for a fresh link before declaring the result lost.
      const fresh = await freshProviderUrl(run, providerOutputUrl);
      if (fresh) {
        providerOutputUrl = fresh;
        await admin
          .from('video_enhance_runs')
          .update({ provider_output_url: fresh })
          .eq('id', run.id);
        head = await headProviderOutput(fresh);
      }
    }
    if (!head.ok) {
      // Provider link permanently gone: nothing left to recover. This is the
      // ONLY path that hands the run to the terminal provider-failure route.
      if (head.gone) {
        return await finalizeFailure(
          admin,
          run,
          'PROVIDER_OUTPUT_GONE',
          `provider output no longer available (${head.status})`,
          'persist',
        );
      }
      return await persistFailure(admin, run, attempts, 'PROVIDER_FETCH_FAILED', `provider head ${head.status}`);
    }
    size = head.contentLength ?? size;
    contentType = head.contentType ?? contentType;
    const ct = contentType.toLowerCase();
    if (!ct.startsWith('video/') && !ct.includes('octet-stream')) {
      return await persistFailure(admin, run, attempts, 'OUTPUT_INVALID', `unexpected content type ${contentType}`);
    }
    if (!size) {
      return await persistFailure(admin, run, attempts, 'PROVIDER_NO_LENGTH', 'provider did not report a size');
    }

    // Resume an existing session, or open a new one for the deterministic key.
    let uploadUrl: string | null = run.resumable_upload_url ?? null;
    let offset = Number(run.resumable_upload_offset ?? 0);
    if (uploadUrl) {
      const known = await sessionOffset(uploadUrl, serviceKey);
      if (known === null) {
        uploadUrl = null;
        offset = 0;
      } else {
        offset = known;
      }
    }
    if (!uploadUrl) {
      const created = await createUploadSession({
        supabaseUrl,
        serviceKey,
        bucket: STAGING_BUCKET,
        objectKey: destKey,
        contentType: 'video/mp4',
        size,
      });
      if (!created.ok) {
        return await persistFailure(admin, run, attempts, 'STAGING_FAILED', created.error ?? 'tus create failed');
      }
      uploadUrl = created.uploadUrl ?? null;
      offset = 0;
    }

    if (!uploadUrl) {
      return await persistFailure(admin, run, attempts, 'STAGING_FAILED', 'no upload session');
    }

    await admin.from('video_enhance_runs').update({
      resumable_upload_url: uploadUrl,
      resumable_upload_offset: offset,
      resumable_upload_expires_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      expected_content_length: size,
      expected_content_type: contentType,
      destination_object_path: destKey,
    }).eq('id', run.id);

    const progress = await transferChunks({
      admin,
      runId: run.id,
      providerUrl: providerOutputUrl,
      uploadUrl,
      serviceKey,
      size,
      startOffset: offset,
      onProgress: async (bytes) => {
        await admin.from('video_enhance_runs')
          .update({ resumable_upload_offset: bytes })
          .eq('id', run.id);
      },
    });

    if (!progress.done) {
      await admin.from('video_enhance_runs')
        .update({ resumable_upload_offset: progress.offset })
        .eq('id', run.id);
      if (progress.providerGone) {
        // Same rule as before the transfer: an expired link gets exactly one
        // refresh, and the next cycle resumes at the stored byte offset.
        const fresh = await freshProviderUrl(run, providerOutputUrl);
        if (fresh) {
          await admin
            .from('video_enhance_runs')
            .update({ provider_output_url: fresh })
            .eq('id', run.id);
          await setStatus(admin, run.id, 'asset_staging', {
            persist_attempts: Number(run.persist_attempts ?? 0),
            next_persist_at: new Date().toISOString(),
            persist_lease_until: null,
            failure_stage: null,
          });
          return { ok: false, status: 'asset_staging' };
        }
        return await finalizeFailure(
          admin,
          run,
          'PROVIDER_OUTPUT_GONE',
          'provider output disappeared mid-transfer',
          'persist',
        );
      }
      if (progress.error) {
        return await persistFailure(admin, run, attempts, 'PERSIST_TRANSFER_FAILED', progress.error);
      }
      // Budget spent, no error: the bytes already stored stay, the next cycle
      // resumes exactly here. This is progress, not a failure.
      await setStatus(admin, run.id, 'asset_staging', {
        persist_attempts: Number(run.persist_attempts ?? 0),
        next_persist_at: new Date().toISOString(),
        persist_lease_until: null,
        failure_stage: null,
      });
      return { ok: false, status: 'asset_staging' };
    }
  }

  // 2. validate what is now IN our storage against what the user ordered.
  const { data: publicUrlData } = admin.storage.from(STAGING_BUCKET).getPublicUrl(destKey);
  const publicUrl = publicUrlData.publicUrl;
  const target = run.target_width && run.target_height
    ? { width: Number(run.target_width), height: Number(run.target_height) }
    : resolveTargetFrame(
      run.resolution as VideoResolution,
      Number(run.source_width) || 0,
      Number(run.source_height) || 0,
    );
  const measurement: Record<string, unknown> = {};
  try {
    const measured = await probeRemoteVideo(publicUrl);
    measurement.actual_width = measured.width;
    measurement.actual_height = measured.height;
    measurement.output_size_bytes = measured.sizeBytes || size || stored || null;
    // codec, container and MIME type are three different facts. The codec
    // comes from the probed sample entry (h264 / hevc / av1) and is NEVER the
    // MIME type of the download.
    measurement.output_codec = measured.codec ?? null;
    measurement.output_container = measured.container ?? 'mp4';
    measurement.output_mime_type = contentType || 'video/mp4';
    measurement.output_fps = measured.fps || null;
    measurement.output_duration_seconds = measured.durationSeconds || null;
    const seconds = measured.durationSeconds || Number(run.source_duration_seconds) || 0;
    const bytes = Number(measurement.output_size_bytes) || 0;
    if (seconds > 0 && bytes > 0) {
      measurement.output_bitrate_kbps = Math.round((bytes * 8) / seconds / 1000);
    }
    measurement.projection_matched = frameMeetsTarget(
      { width: measured.width, height: measured.height },
      target,
    );

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
        failure_stage: 'output',
        persist_attempts: attempts,
        next_persist_at: nextPersistAt(attempts),
        persist_lease_until: null,
        ...measurement,
      });
      return { ok: false, status: 'asset_persist_failed', error: match.reason };
    }
  } catch (error) {
    // A probe failure is an infrastructure problem, not a verdict: keep the
    // stored file and let the reconciler retry instead of failing the run.
    console.warn(`${TAG} stored probe unavailable for ${run.id}:`, error);
  }


  // 4. asset row (non-destructive: the source stays, this is a child asset).
  //    Idempotent: a second worker reuses the existing row instead of
  //    creating a duplicate library entry for the same run.
  await setStatus(admin, run.id, 'asset_persisting', {});
  let assetId: string | null = run.output_asset_id ?? null;
  if (!assetId) {
    const { data: existingAsset } = await admin
      .from('video_creations')
      .select('id')
      .eq('user_id', run.user_id)
      .eq('metadata->>runId', run.id)
      .maybeSingle();
    assetId = existingAsset?.id ?? null;
  }
  if (!assetId) {
    const { data: asset, error: assetError } = await admin
      .from('video_creations')
      .insert({
        user_id: run.user_id,
        output_url: publicUrl,
        status: 'completed',
        framerate: Number(run.fps),
        metadata: {
          videoEnhance: true,
          runId: run.id,
          parentAssetId: run.source_asset_id,
          modelId: run.model_id,
          mode: run.mode,
          resolution: run.resolution,
          fps: run.fps,
          tier: run.tier,
          durationSeconds: Number(run.source_duration_seconds),
          priceEur: Number(run.user_price_eur),
          label: `Enhanced with ${run.model_id} (${run.resolution}/${run.fps}fps)`,
        },
      })
      .select('id')
      .maybeSingle();

    if (assetError || !asset) {
      return await persistFailure(
        admin,
        run,
        attempts,
        'ASSET_ROW_FAILED',
        assetError?.message ?? 'no asset row',
        { output_url: publicUrl },
      );
    }
    assetId = asset.id;
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

  // Calibration telemetry — observation only, never a gate.
  if (providerCost.units !== undefined) {
    costPatch.actual_units = providerCost.units;
    // Topaz bills in credits: compare them with what the calibrated estimator
    // predicted so a mis-calibrated chain becomes visible instead of silent.
    if (run.estimated_provider_credits !== null && run.estimated_provider_credits !== undefined) {
      const drift = topazCreditDrift(
        Number(run.estimated_provider_credits),
        Number(providerCost.units),
      );
      costPatch.actual_provider_credits = providerCost.units;
      costPatch.provider_credit_drift_pct = Math.round(drift.ratio * 10000) / 100;
      costPatch.provider_credit_drift_flagged = drift.flagged;
    }
  }

  const processingSeconds = providerCost.processingSeconds ??
    (run.provider_submitted_at
      ? (Date.now() - new Date(run.provider_submitted_at).getTime()) / 1000
      : undefined);
  if (processingSeconds !== undefined && Number.isFinite(processingSeconds)) {
    costPatch.processing_seconds = Math.round(processingSeconds);
  }
  costPatch.provider_retry_count = Number(run.persist_attempts ?? 1) - 1;


  // 5b. Price guarantee: once the provider's REAL cost is known, the customer
  // never keeps a charge above the hard multiplier cap. Overcharge is refunded;
  // a higher real cost is never charged back to the customer.
  const trueUp = verifiedPricing({
    capturedUsageChargeEur: Number(run.user_price_eur),
    providerCostUsdActual: providerCost.usd ?? null,
  });
  if (trueUp.refundEur > 0) {
    const refund = await walletOperation(admin, {
      runId: run.id,
      userId: run.user_id,
      operation: 'true_up_refund',
      amountEur: trueUp.refundEur,
      note: `pricing cap true-up (${VIDEO_PRICING_HARD_MULTIPLIER_CAP}x verified cost)`,
    });
    if (refund.applied) {
      costPatch.overcharge_refund_amount_eur = trueUp.refundEur;
      costPatch.overcharge_refund_at = new Date().toISOString();
    }
  }
  costPatch.verified_effective_multiplier = trueUp.verifiedMultiplierAfterTrueUp;
  costPatch.pricing_gate = trueUp.gateReason ? 'review_required' : 'ok';
  costPatch.pricing_gate_reason = trueUp.gateReason;
  // Calibration is deliberately NOT folded into the pricing gate: a run below
  // the target corridor is an estimator signal, never a blocker.
  costPatch.calibration_status = trueUp.calibrationStatus;
  costPatch.calibration_reason = trueUp.calibrationReason;
  // Cost still unverified -> stays eligible for a later true-up, forever, until
  // it is either verified or administratively closed.
  costPatch.next_late_check_at = providerCost.usd === undefined || providerCost.usd === null
    ? new Date(Date.now() + lateCostBackoffMinutes(0) * 60_000).toISOString()
    : null;

  await setStatus(admin, run.id, 'completed', {
    output_asset_id: assetId,
    output_url: publicUrl,
    // The provider reference is kept as evidence of where the file came from;
    // it is never rewritten to make a storage problem look like a model run.
    staging_key: null,
    resumable_upload_url: null,
    resumable_upload_offset: 0,
    persist_lease_owner: null,
    persist_lease_until: null,
    next_persist_at: null,
    failure_stage: null,
    persist_last_error: null,
    // Never overwrite when the provider's real completion time is known.
    provider_completed_at: run.provider_completed_at ?? new Date().toISOString(),
    next_reconcile_at: null,
    error_code: null,
    error_message: null,
    ...measurement,
    ...costPatch,
  });

  // 5. cleanup — any legacy staging copy must not pile up. The delivered file
  //    lives at the deterministic destination key and is never removed here.
  if (run.staging_key) {
    await admin.storage.from(STAGING_BUCKET).remove([run.staging_key]).catch(() => undefined);
  }

  return { ok: true, status: 'completed', outputUrl: publicUrl, assetId: assetId ?? undefined };
}

/**
 * Terminal failure with exactly one release.
 *
 * `stage` records WHERE it failed: `provider` (the model/provider did not
 * deliver) or `persist` (the provider delivered, but the result is proven
 * unrecoverable — e.g. its link expired). The provider status is never
 * rewritten to look like a model failure.
 */
export async function finalizeFailure(
  admin: Admin,
  run: Run,
  errorCode: string,
  errorMessage: string,
  stage: 'provider' | 'persist' = 'provider',
): Promise<FinalizeResult> {
  await walletOperation(admin, {
    runId: run.id,
    userId: run.user_id,
    operation: 'release',
    amountEur: Number(run.user_price_eur),
    note: errorCode,
  });
  // The provider verdict and OUR storage verdict are two different facts. A
  // run whose provider finished but whose file we could not keep terminates as
  // `output_lost`, never as `provider_failed`.
  const terminal = stage === 'persist' ? 'output_lost' : 'provider_failed';
  await setStatus(admin, run.id, terminal, {
    error_code: errorCode,
    error_message: errorMessage,
    failure_stage: stage,
    persist_last_error: stage === 'persist' ? errorMessage.slice(0, 500) : undefined,
    // Provider success stays recorded on the row (provider_completed_at,
    // provider_job_id) — it is never cleared by a storage failure.
    next_reconcile_at: null,
    next_persist_at: null,
    persist_lease_until: null,
  });
  if (run.staging_key) {
    await admin.storage.from(STAGING_BUCKET).remove([run.staging_key]).catch(() => undefined);
  }
  return { ok: false, status: terminal, error: errorMessage };
}


/** Provider CONFIRMED the cancellation — only here money moves back. */
export async function finalizeCancelConfirmed(
  admin: Admin,
  run: Run,
  providerCost: ProviderCostReading = { source: 'unavailable' },
): Promise<FinalizeResult> {
  // Cancel policy: the customer gets the full reservation back; provider cost
  // already incurred is booked internally only.
  await walletOperation(admin, {
    runId: run.id,
    userId: run.user_id,
    operation: 'release',
    amountEur: Number(run.user_price_eur),
    note: 'provider cancel confirmed',
  });
  await setStatus(admin, run.id, 'provider_cancelled_confirmed', {
    next_reconcile_at: null,
    provider_cost_usd_actual: providerCost.usd ?? null,
    provider_cost_source: providerCost.source,
  });
  if (run.staging_key) {
    await admin.storage.from(STAGING_BUCKET).remove([run.staging_key]).catch(() => undefined);
  }
  return { ok: false, status: 'provider_cancelled_confirmed' };
}

/**
 * Backoff for the late-cost scanner: hours first, then days, capped at 7 days.
 * The scanner is only the fallback — an authoritative cost arriving through any
 * active path is trued up immediately.
 */
export function lateCostBackoffMinutes(attempts: number): number {
  const schedule = [60, 6 * 60, 24 * 60, 3 * 24 * 60, 7 * 24 * 60];
  return schedule[Math.min(attempts, schedule.length - 1)];
}

/**
 * Late authoritative provider cost for an ALREADY completed run.
 *
 * Runs the exact same hard-cap check as finalisation and books at most one
 * `true_up_refund` — the ledger operation key makes webhook, reconciler and
 * retries collapse into a single credit. Never charges the customer more.
 * `cost_unverified` stays a pure admin/telemetry state.
 */
export async function applyLateCostTrueUp(
  admin: Admin,
  run: Run,
  providerCost: ProviderCostReading,
): Promise<{ applied: boolean; reason?: string; verifiedMultiplier?: number | null }> {
  if (run.cost_closed_at) {
    return { applied: false, reason: 'administratively_closed' };
  }
  if (run.provider_cost_usd_actual !== null && run.provider_cost_usd_actual !== undefined) {
    return { applied: false, reason: 'already_verified' };
  }
  if (providerCost.usd === undefined || providerCost.usd === null) {
    // No number yet: reschedule the fallback scan, never give up on the run.
    const attempts = Number(run.late_cost_attempts ?? 0) + 1;
    await admin
      .from('video_enhance_runs')
      .update({
        late_cost_attempts: attempts,
        next_late_check_at: new Date(
          Date.now() + lateCostBackoffMinutes(attempts) * 60_000,
        ).toISOString(),
      })
      .eq('id', run.id);
    return { applied: false, reason: 'cost_unavailable' };
  }

  const trueUp = verifiedPricing({
    capturedUsageChargeEur: Number(run.user_price_eur),
    providerCostUsdActual: providerCost.usd,
  });

  const patch: Record<string, unknown> = {
    provider_cost_usd_actual: providerCost.usd,
    provider_cost_source: providerCost.source,
    actual_units: providerCost.units ?? null,
    verified_effective_multiplier: trueUp.verifiedMultiplierAfterTrueUp,
    pricing_gate: trueUp.gateReason ? 'review_required' : 'ok',
    pricing_gate_reason: trueUp.gateReason,
    calibration_status: trueUp.calibrationStatus,
    calibration_reason: trueUp.calibrationReason,
    next_late_check_at: null,
  };

  if (trueUp.refundEur > 0) {
    const refund = await walletOperation(admin, {
      runId: run.id,
      userId: run.user_id,
      operation: 'true_up_refund',
      amountEur: trueUp.refundEur,
      note: `pricing cap true-up (${VIDEO_PRICING_HARD_MULTIPLIER_CAP}x verified cost)`,
    });
    if (refund.applied) {
      patch.overcharge_refund_amount_eur = trueUp.refundEur;
      patch.overcharge_refund_at = new Date().toISOString();
    }
  }

  await admin.from('video_enhance_runs').update(patch).eq('id', run.id);
  return { applied: true, verifiedMultiplier: trueUp.verifiedMultiplierAfterTrueUp };
}
