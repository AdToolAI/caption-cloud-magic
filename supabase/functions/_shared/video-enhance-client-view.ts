/**
 * The customer-facing projection of a `video_enhance_runs` row.
 *
 * `video-enhance` answers `status` / `start` with THIS shape, never with the
 * raw row. Internal bookkeeping (callback token, submit lease, margin and
 * provider cost columns, calibration state) stays on the server; the measured
 * output facts the surfaces render are listed explicitly, so a column can not
 * be "typed and stored" without also being delivered.
 */

export const CLIENT_RUN_FIELDS = [
  // identity + state
  'id',
  'status',
  'error_code',
  'error_message',
  'created_at',
  'updated_at',
  'provider_status',
  'provider_submitted_at',
  'provider_completed_at',
  'cancel_requested_at',
  // what was ordered and what really runs
  'model_id',
  'requested_model_id',
  'delivery_strategy',
  'mode',
  'resolution',
  'fps',
  'tier',
  'requested_output_quality',
  'executing_topaz_model',
  'interpolation_model',
  'user_price_eur',
  'currency',
  'overcharge_refund_amount_eur',
  // source facts (server-measured)
  'source_asset_id',
  'source_url',
  'source_width',
  'source_height',
  'source_fps',
  'source_duration_seconds',
  // promised frame
  'target_width',
  'target_height',
  'projected_width',
  'projected_height',
  // delivered result
  'output_url',
  'output_asset_id',
  'projection_matched',
  'actual_width',
  'actual_height',
  'output_codec',
  'output_container',
  'output_mime_type',
  'output_bitrate_kbps',
  'output_size_bytes',
  'output_fps',
  'output_duration_seconds',
] as const;

export type ClientRunField = (typeof CLIENT_RUN_FIELDS)[number];

/** Columns that must NEVER reach a browser, whatever the row contains. */
export const INTERNAL_RUN_FIELDS = [
  'callback_token',
  'submit_lease_owner',
  'submit_lease_expires_at',
  'provider_prediction_id',
  'provider_output_url',
  'staging_key',
  'provider_cost_usd_estimated',
  'provider_cost_usd_actual',
  'provider_cost_eur_buffered',
  'net_revenue_eur',
  'contribution_eur',
  'margin_pct',
  'actual_contribution_eur',
  'actual_margin_pct',
  'cost_drift_ratio',
  'multiplier_used',
  'effective_multiplier',
  'verified_effective_multiplier',
  'calibration_status',
  'calibration_reason',
  'test_fail_persist_once',
] as const;

/** Output measurement columns the panels render after completion. */
export const OUTPUT_MEASUREMENT_FIELDS = [
  'projection_matched',
  'actual_width',
  'actual_height',
  'output_codec',
  'output_container',
  'output_mime_type',
  'output_bitrate_kbps',
  'output_size_bytes',
  'output_fps',
  'output_duration_seconds',
] as const;

export type ClientRun = Partial<Record<ClientRunField, unknown>>;

export function toClientRun(run: Record<string, unknown> | null | undefined): ClientRun | null {
  if (!run) return null;
  const view: ClientRun = {};
  for (const field of CLIENT_RUN_FIELDS) {
    if (field in run) view[field] = run[field];
  }
  return view;
}

/** The part of a price snapshot the customer needs — no margin internals. */
export function toClientPricing(pricing: {
  userPriceEur: number;
  fps: number;
  outputSeconds: number;
  costUnverified: boolean;
  rateCardVersion: string;
  resolution: string;
  modelId: string;
  mode: string;
}) {
  return {
    userPriceEur: pricing.userPriceEur,
    fps: pricing.fps,
    outputSeconds: pricing.outputSeconds,
    costUnverified: pricing.costUnverified,
    rateCardVersion: pricing.rateCardVersion,
    resolution: pricing.resolution,
    modelId: pricing.modelId,
    mode: pricing.mode,
  };
}
