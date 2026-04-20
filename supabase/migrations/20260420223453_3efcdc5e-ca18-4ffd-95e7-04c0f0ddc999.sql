-- Helper function: returns the AI Superuser test account ID if it exists
CREATE OR REPLACE FUNCTION public.get_ai_superuser_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles
  WHERE is_test_account = true
    AND email = 'ai-superuser@adtool-internal.test'
  LIMIT 1
$$;

-- Helper function: seed demo post_metrics for the AI Superuser test account
-- Idempotent: only inserts if no rows exist for that user
CREATE OR REPLACE FUNCTION public.seed_ai_superuser_demo_data(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing INT;
BEGIN
  SELECT COUNT(*) INTO v_existing
  FROM public.post_metrics
  WHERE user_id = _user_id;

  IF v_existing >= 3 THEN
    RETURN; -- already seeded
  END IF;

  INSERT INTO public.post_metrics (
    user_id, provider, account_id, post_id, post_url, media_type,
    caption_text, posted_at, likes, comments, shares, saves, reach, impressions, engagement_rate
  ) VALUES
    (_user_id, 'instagram', 'test_acc_1', 'test_post_1', 'https://example.com/1', 'image',
     'Morning vibes ☕ #coffee #morning #productivity #worklife #entrepreneur',
     now() - interval '2 days', 245, 18, 12, 8, 3500, 4200, 0.07),
    (_user_id, 'instagram', 'test_acc_1', 'test_post_2', 'https://example.com/2', 'video',
     'Quick workout routine 💪 #fitness #workout #motivation #health #training',
     now() - interval '5 days', 512, 42, 28, 35, 7800, 9500, 0.066),
    (_user_id, 'instagram', 'test_acc_1', 'test_post_3', 'https://example.com/3', 'image',
     'Behind the scenes 🎬 #bts #creator #content #photography #lifestyle',
     now() - interval '7 days', 189, 11, 5, 4, 2400, 2900, 0.079)
  ON CONFLICT DO NOTHING;
END;
$$;