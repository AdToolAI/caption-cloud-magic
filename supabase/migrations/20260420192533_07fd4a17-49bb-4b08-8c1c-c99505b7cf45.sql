-- 1. Add tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verify_reminder_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz NULL;

-- Backfill email_verified_at for already-verified users (best-effort: use created_at as fallback)
UPDATE public.profiles p
SET email_verified_at = COALESCE(
  (SELECT u.email_confirmed_at FROM auth.users u WHERE u.id = p.id),
  p.created_at
)
WHERE p.email_verified = true AND p.email_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_verify_reminder
  ON public.profiles (created_at)
  WHERE email_verified = false AND verify_reminder_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_email_verified_at
  ON public.profiles (email_verified_at)
  WHERE email_verified_at IS NOT NULL;

-- 2. Conversion Funnel RPC
CREATE OR REPLACE FUNCTION public.get_conversion_funnel(days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff timestamptz := now() - (days || ' days')::interval;
  v_prev_cutoff timestamptz := now() - (days * 2 || ' days')::interval;
  v_signups int;
  v_verified int;
  v_first_video int;
  v_paid int;
  v_prev_signups int;
  v_prev_verified int;
  v_prev_first_video int;
  v_prev_paid int;
  v_avg_time_to_verify numeric;
  v_avg_time_to_first_video numeric;
  v_reminders_sent int;
  v_reminders_converted int;
BEGIN
  -- Authorization: only admins
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Current period
  SELECT COUNT(*) INTO v_signups
  FROM public.profiles
  WHERE created_at >= v_cutoff;

  SELECT COUNT(*) INTO v_verified
  FROM public.profiles
  WHERE created_at >= v_cutoff AND email_verified = true;

  SELECT COUNT(DISTINCT p.id) INTO v_first_video
  FROM public.profiles p
  WHERE p.created_at >= v_cutoff
    AND p.email_verified = true
    AND EXISTS (
      SELECT 1 FROM public.ai_video_generations g
      WHERE g.user_id = p.id
    );

  SELECT COUNT(*) INTO v_paid
  FROM public.profiles p
  JOIN public.wallets w ON w.user_id = p.id
  WHERE p.created_at >= v_cutoff
    AND w.plan_code IN ('basic','pro','enterprise');

  -- Previous period (for delta)
  SELECT COUNT(*) INTO v_prev_signups
  FROM public.profiles
  WHERE created_at >= v_prev_cutoff AND created_at < v_cutoff;

  SELECT COUNT(*) INTO v_prev_verified
  FROM public.profiles
  WHERE created_at >= v_prev_cutoff AND created_at < v_cutoff AND email_verified = true;

  SELECT COUNT(DISTINCT p.id) INTO v_prev_first_video
  FROM public.profiles p
  WHERE p.created_at >= v_prev_cutoff AND p.created_at < v_cutoff
    AND p.email_verified = true
    AND EXISTS (
      SELECT 1 FROM public.ai_video_generations g
      WHERE g.user_id = p.id
    );

  SELECT COUNT(*) INTO v_prev_paid
  FROM public.profiles p
  JOIN public.wallets w ON w.user_id = p.id
  WHERE p.created_at >= v_prev_cutoff AND p.created_at < v_cutoff
    AND w.plan_code IN ('basic','pro','enterprise');

  -- Avg time to verify (hours)
  SELECT AVG(EXTRACT(EPOCH FROM (email_verified_at - created_at)) / 3600.0)
  INTO v_avg_time_to_verify
  FROM public.profiles
  WHERE created_at >= v_cutoff
    AND email_verified_at IS NOT NULL;

  -- Avg time to first video (hours from verify -> first video)
  SELECT AVG(EXTRACT(EPOCH FROM (first_v.first_at - p.email_verified_at)) / 3600.0)
  INTO v_avg_time_to_first_video
  FROM public.profiles p
  JOIN LATERAL (
    SELECT MIN(g.created_at) AS first_at
    FROM public.ai_video_generations g
    WHERE g.user_id = p.id
  ) first_v ON true
  WHERE p.created_at >= v_cutoff
    AND p.email_verified_at IS NOT NULL
    AND first_v.first_at IS NOT NULL;

  -- Reminder effectiveness
  SELECT COUNT(*) INTO v_reminders_sent
  FROM public.profiles
  WHERE created_at >= v_cutoff AND verify_reminder_sent_at IS NOT NULL;

  SELECT COUNT(*) INTO v_reminders_converted
  FROM public.profiles
  WHERE created_at >= v_cutoff
    AND verify_reminder_sent_at IS NOT NULL
    AND email_verified = true
    AND email_verified_at > verify_reminder_sent_at;

  RETURN jsonb_build_object(
    'period_days', days,
    'signups', v_signups,
    'verified', v_verified,
    'first_video', v_first_video,
    'paid', v_paid,
    'prev_signups', v_prev_signups,
    'prev_verified', v_prev_verified,
    'prev_first_video', v_prev_first_video,
    'prev_paid', v_prev_paid,
    'avg_hours_to_verify', COALESCE(v_avg_time_to_verify, 0),
    'avg_hours_to_first_video', COALESCE(v_avg_time_to_first_video, 0),
    'reminders_sent', v_reminders_sent,
    'reminders_converted', v_reminders_converted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversion_funnel(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversion_funnel(integer) TO authenticated;
