
-- 1. user_streaks table
CREATE TABLE public.user_streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_activity_date DATE,
  freeze_tokens INT NOT NULL DEFAULT 1,
  freeze_used_at DATE,
  total_active_days INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own streak"
  ON public.user_streaks FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE policies — only SECURITY DEFINER function may write

-- 2. streak_milestones table
CREATE TABLE public.streak_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_days INT NOT NULL,
  reached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reward_credits INT DEFAULT 0,
  UNIQUE(user_id, milestone_days)
);

CREATE INDEX idx_streak_milestones_user ON public.streak_milestones(user_id, reached_at DESC);

ALTER TABLE public.streak_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own milestones"
  ON public.streak_milestones FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Trigger for updated_at
CREATE TRIGGER update_user_streaks_updated_at
  BEFORE UPDATE ON public.user_streaks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RPC: record_streak_activity
CREATE OR REPLACE FUNCTION public.record_streak_activity(p_user_id UUID)
RETURNS TABLE(
  current_streak INT,
  longest_streak INT,
  freeze_tokens INT,
  milestone_reached INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
  v_streak public.user_streaks%ROWTYPE;
  v_new_streak INT;
  v_new_longest INT;
  v_new_freeze_tokens INT;
  v_new_freeze_used DATE;
  v_milestone_thresholds INT[] := ARRAY[3, 7, 14, 30, 60, 100];
  v_threshold INT;
  v_milestone_reached INT := 0;
  v_reward INT;
BEGIN
  -- Upsert: get or create row
  INSERT INTO public.user_streaks (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_streak FROM public.user_streaks WHERE user_id = p_user_id FOR UPDATE;

  -- Idempotent: same day → no-op
  IF v_streak.last_activity_date = v_today THEN
    RETURN QUERY SELECT v_streak.current_streak, v_streak.longest_streak, v_streak.freeze_tokens, 0;
    RETURN;
  END IF;

  v_new_freeze_tokens := v_streak.freeze_tokens;
  v_new_freeze_used := v_streak.freeze_used_at;

  IF v_streak.last_activity_date IS NULL THEN
    -- First activity ever
    v_new_streak := 1;
  ELSIF v_streak.last_activity_date = v_yesterday THEN
    -- Continuing streak
    v_new_streak := v_streak.current_streak + 1;
  ELSIF v_streak.last_activity_date = (v_today - INTERVAL '2 days')::DATE
        AND v_streak.freeze_tokens > 0
        AND (v_streak.freeze_used_at IS NULL OR v_streak.freeze_used_at < v_today - INTERVAL '7 days') THEN
    -- 1-day gap + freeze available + not used in last 7 days → consume freeze
    v_new_streak := v_streak.current_streak + 1;
    v_new_freeze_tokens := v_streak.freeze_tokens - 1;
    v_new_freeze_used := v_today;
  ELSE
    -- Streak broken
    v_new_streak := 1;
  END IF;

  v_new_longest := GREATEST(v_streak.longest_streak, v_new_streak);

  UPDATE public.user_streaks
  SET current_streak = v_new_streak,
      longest_streak = v_new_longest,
      last_activity_date = v_today,
      freeze_tokens = v_new_freeze_tokens,
      freeze_used_at = v_new_freeze_used,
      total_active_days = total_active_days + 1,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Milestone check
  FOREACH v_threshold IN ARRAY v_milestone_thresholds LOOP
    IF v_new_streak = v_threshold THEN
      v_reward := CASE v_threshold
        WHEN 3 THEN 10
        WHEN 7 THEN 30
        WHEN 14 THEN 50
        WHEN 30 THEN 100
        WHEN 60 THEN 200
        WHEN 100 THEN 500
        ELSE 0
      END;

      INSERT INTO public.streak_milestones (user_id, milestone_days, reward_credits)
      VALUES (p_user_id, v_threshold, v_reward)
      ON CONFLICT (user_id, milestone_days) DO NOTHING;

      -- Grant credits if wallet exists
      IF v_reward > 0 THEN
        PERFORM public.increment_balance(p_user_id, v_reward);
      END IF;

      v_milestone_reached := v_threshold;
      EXIT;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_new_streak, v_new_longest, v_new_freeze_tokens, v_milestone_reached;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_streak_activity(UUID) TO authenticated;

-- 5. Helper: refresh freeze tokens (called weekly by edge function)
CREATE OR REPLACE FUNCTION public.refresh_streak_freeze_tokens()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH updated AS (
    UPDATE public.user_streaks
    SET freeze_tokens = LEAST(freeze_tokens + 1, 2),
        freeze_used_at = CASE
          WHEN freeze_used_at < CURRENT_DATE - INTERVAL '7 days' THEN NULL
          ELSE freeze_used_at
        END,
        updated_at = now()
    WHERE current_streak > 0
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

-- 6. Helper: break stale streaks (called daily by edge function)
CREATE OR REPLACE FUNCTION public.break_stale_streaks()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_row public.user_streaks%ROWTYPE;
  v_yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
BEGIN
  FOR v_row IN
    SELECT * FROM public.user_streaks
    WHERE current_streak > 0
      AND last_activity_date < v_yesterday
  LOOP
    -- 2-day gap with freeze available → consume freeze, keep streak
    IF v_row.last_activity_date = (CURRENT_DATE - INTERVAL '2 days')::DATE
       AND v_row.freeze_tokens > 0
       AND (v_row.freeze_used_at IS NULL OR v_row.freeze_used_at < CURRENT_DATE - INTERVAL '7 days') THEN
      UPDATE public.user_streaks
      SET freeze_tokens = freeze_tokens - 1,
          freeze_used_at = CURRENT_DATE,
          last_activity_date = v_yesterday,
          updated_at = now()
      WHERE user_id = v_row.user_id;
    ELSE
      -- Reset
      UPDATE public.user_streaks
      SET current_streak = 0,
          updated_at = now()
      WHERE user_id = v_row.user_id;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
