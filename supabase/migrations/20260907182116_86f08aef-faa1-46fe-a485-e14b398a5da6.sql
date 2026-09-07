ALTER TABLE public.video_enhance_runs
  ADD COLUMN IF NOT EXISTS failure_stage text,
  ADD COLUMN IF NOT EXISTS next_persist_at timestamptz,
  ADD COLUMN IF NOT EXISTS persist_last_error text,
  ADD COLUMN IF NOT EXISTS persist_lease_owner text,
  ADD COLUMN IF NOT EXISTS persist_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS resumable_upload_url text,
  ADD COLUMN IF NOT EXISTS resumable_upload_offset bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resumable_upload_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS destination_object_path text,
  ADD COLUMN IF NOT EXISTS provider_output_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS expected_content_length bigint,
  ADD COLUMN IF NOT EXISTS expected_content_type text;

CREATE INDEX IF NOT EXISTS video_enhance_runs_persist_due_idx
  ON public.video_enhance_runs (status, next_persist_at);

CREATE OR REPLACE FUNCTION public.video_enhance_claim_persist_run(
  p_worker text,
  p_lease_seconds integer DEFAULT 240
)
RETURNS SETOF public.video_enhance_runs
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.video_enhance_runs r
     SET persist_lease_owner = p_worker,
         persist_lease_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   WHERE r.id = (
     SELECT id
       FROM public.video_enhance_runs
      WHERE status IN ('provider_output_ready','asset_staging','asset_persisting','asset_persist_failed')
        AND provider_output_url IS NOT NULL
        AND (next_persist_at IS NULL OR next_persist_at <= now())
        AND (persist_lease_until IS NULL OR persist_lease_until < now())
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
  RETURNING r.*;
$$;

REVOKE ALL ON FUNCTION public.video_enhance_claim_persist_run(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.video_enhance_claim_persist_run(text, integer) TO service_role;