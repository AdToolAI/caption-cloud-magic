-- Add reward_dollars column to streak_milestones
ALTER TABLE public.streak_milestones
ADD COLUMN IF NOT EXISTS reward_dollars NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Update record_streak_activity to grant AI video dollar credits instead of platform credits
CREATE OR REPLACE FUNCTION public.record_streak_activity(p_user_id uuid)
 RETURNS TABLE(current_streak integer, longest_streak integer, freeze_tokens integer, milestone_reached integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_reward_dollars NUMERIC(10,2);
  v_inserted BOOLEAN;
  v_new_balance NUMERIC;
  v_currency TEXT;
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
    v_new_streak := 1;
  ELSIF v_streak.last_activity_date = v_yesterday THEN
    v_new_streak := v_streak.current_streak + 1;
  ELSIF v_streak.last_activity_date = (v_today - INTERVAL '2 days')::DATE
        AND v_streak.freeze_tokens > 0
        AND (v_streak.freeze_used_at IS NULL OR v_streak.freeze_used_at < v_today - INTERVAL '7 days') THEN
    v_new_streak := v_streak.current_streak + 1;
    v_new_freeze_tokens := v_streak.freeze_tokens - 1;
    v_new_freeze_used := v_today;
  ELSE
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
      v_reward_dollars := CASE v_threshold
        WHEN 3 THEN 0.50
        WHEN 7 THEN 1.50
        WHEN 14 THEN 3.00
        WHEN 30 THEN 7.00
        WHEN 60 THEN 15.00
        WHEN 100 THEN 25.00
        ELSE 0
      END;

      -- Insert milestone record (idempotent via unique index)
      INSERT INTO public.streak_milestones (user_id, milestone_days, reward_credits, reward_dollars)
      VALUES (p_user_id, v_threshold, 0, v_reward_dollars)
      ON CONFLICT (user_id, milestone_days) DO NOTHING
      RETURNING true INTO v_inserted;

      -- Grant AI video dollar credits only on first insert
      IF v_inserted IS TRUE AND v_reward_dollars > 0 THEN
        -- Get currency or default to USD
        SELECT currency INTO v_currency
        FROM public.ai_video_wallets
        WHERE user_id = p_user_id;

        IF v_currency IS NULL THEN
          v_currency := 'USD';
        END IF;

        -- Upsert wallet with reward
        INSERT INTO public.ai_video_wallets (user_id, currency, balance_euros, total_purchased_euros)
        VALUES (p_user_id, v_currency, v_reward_dollars, 0)
        ON CONFLICT (user_id) DO UPDATE
        SET balance_euros = public.ai_video_wallets.balance_euros + v_reward_dollars,
            updated_at = now()
        RETURNING balance_euros INTO v_new_balance;

        -- Log bonus transaction
        INSERT INTO public.ai_video_transactions (
          user_id, currency, type, amount_euros, balance_after,
          description, metadata
        ) VALUES (
          p_user_id, v_currency, 'bonus', v_reward_dollars, v_new_balance,
          'Streak milestone reward: ' || v_threshold || ' days',
          jsonb_build_object('milestone_days', v_threshold, 'source', 'streak')
        );
      END IF;

      v_milestone_reached := v_threshold;
      EXIT;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_new_streak, v_new_longest, v_new_freeze_tokens, v_milestone_reached;
END;
$function$;