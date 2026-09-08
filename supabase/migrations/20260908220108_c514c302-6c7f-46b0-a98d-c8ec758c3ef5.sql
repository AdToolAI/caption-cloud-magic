CREATE OR REPLACE VIEW public.video_enhance_topaz_drift_samples AS
SELECT
  r.id AS run_id,
  r.created_at,
  r.user_id,
  r.cost_estimator_version,
  r.mode,
  r.resolution AS target_resolution,
  r.fps AS target_fps,
  r.source_fps,
  round(r.source_duration_seconds::numeric, 2) AS source_duration_seconds,
  CASE
    WHEN r.source_duration_seconds < 6 THEN '0-6s'
    WHEN r.source_duration_seconds < 12 THEN '6-12s'
    WHEN r.source_duration_seconds < 20 THEN '12-20s'
    ELSE '20s+'
  END AS duration_bucket,
  COALESCE(r.interpolation_model, 'none') AS interpolation_model,
  r.estimated_provider_credits,
  r.actual_provider_credits,
  r.provider_credit_drift_pct,
  r.provider_credit_drift_flagged,
  r.charged_price_eur,
  r.effective_multiple_after_discount,
  r.profitability_class
FROM public.video_enhance_runs r
WHERE r.model_id = 'topaz-video-upscale'
  AND r.actual_provider_credits IS NOT NULL;

CREATE OR REPLACE VIEW public.video_enhance_topaz_drift_groups AS
SELECT
  cost_estimator_version,
  interpolation_model,
  target_resolution,
  target_fps,
  duration_bucket,
  count(*) AS samples,
  round(avg(provider_credit_drift_pct)::numeric, 2) AS avg_drift_pct,
  round(min(provider_credit_drift_pct)::numeric, 2) AS min_drift_pct,
  round(max(provider_credit_drift_pct)::numeric, 2) AS max_drift_pct,
  count(*) FILTER (WHERE provider_credit_drift_flagged) AS flagged_samples,
  round(avg(effective_multiple_after_discount)::numeric, 3) AS avg_effective_multiple,
  count(*) FILTER (WHERE profitability_class = 'subsidized') AS subsidized_samples
FROM public.video_enhance_topaz_drift_samples
GROUP BY 1, 2, 3, 4, 5;

REVOKE ALL ON public.video_enhance_topaz_drift_samples FROM anon, authenticated;
REVOKE ALL ON public.video_enhance_topaz_drift_groups FROM anon, authenticated;
GRANT SELECT ON public.video_enhance_topaz_drift_samples TO service_role;
GRANT SELECT ON public.video_enhance_topaz_drift_groups TO service_role;