-- 1) Creator account fields on profiles (server-side only; the existing
--    prevent_profile_privileged_updates allowlist already blocks client writes)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS ai_discount_percent integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_type_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_type_check CHECK (account_type IN ('standard','creator'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_ai_discount_percent_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_ai_discount_percent_check CHECK (ai_discount_percent BETWEEN 0 AND 100);
  END IF;
END $$;

-- 2) Central discount factor helper
CREATE OR REPLACE FUNCTION public.get_ai_discount_factor(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT (100 - LEAST(GREATEST(ai_discount_percent, 0), 100))::numeric / 100
       FROM public.profiles WHERE id = p_user_id),
    1::numeric
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_discount_factor(uuid) TO authenticated, service_role;

-- 3) Discounted deductions / refunds
CREATE OR REPLACE FUNCTION public.deduct_ai_video_credits(p_user_id uuid, p_amount numeric, p_generation_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
  v_currency TEXT;
  v_factor NUMERIC := public.get_ai_discount_factor(p_user_id);
  v_amount NUMERIC := round(GREATEST(COALESCE(p_amount, 0), 0) * v_factor, 2);
BEGIN
  SELECT balance_euros, currency INTO v_current_balance, v_currency
  FROM public.ai_video_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  IF v_current_balance < v_amount THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  UPDATE public.ai_video_wallets
  SET balance_euros = balance_euros - v_amount,
      total_spent_euros = total_spent_euros + v_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_euros INTO v_new_balance;

  INSERT INTO public.ai_video_transactions (
    user_id, currency, type, amount_euros, balance_after, generation_id, description, metadata
  ) VALUES (
    p_user_id, v_currency, 'deduction', -v_amount, v_new_balance, p_generation_id,
    'Video generation cost',
    jsonb_build_object('list_amount_euros', round(GREATEST(COALESCE(p_amount, 0), 0), 2), 'discount_factor', v_factor)
  );

  RETURN v_new_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refund_ai_video_credits(p_user_id uuid, p_amount_euros numeric, p_generation_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_balance NUMERIC;
  v_currency TEXT;
  v_factor NUMERIC := public.get_ai_discount_factor(p_user_id);
  v_amount NUMERIC := round(GREATEST(COALESCE(p_amount_euros, 0), 0) * v_factor, 2);
BEGIN
  SELECT currency INTO v_currency
  FROM public.ai_video_wallets
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    v_currency := 'EUR';
  END IF;

  UPDATE public.ai_video_wallets
  SET balance_euros = balance_euros + v_amount,
      total_spent_euros = GREATEST(total_spent_euros - v_amount, 0),
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_euros INTO v_new_balance;

  INSERT INTO public.ai_video_transactions (
    user_id, currency, type, amount_euros, balance_after, generation_id, description, metadata
  ) VALUES (
    p_user_id, v_currency, 'refund', v_amount, v_new_balance, p_generation_id,
    'AI video generation refund',
    jsonb_build_object('list_amount_euros', round(GREATEST(COALESCE(p_amount_euros, 0), 0), 2), 'discount_factor', v_factor)
  );

  RETURN v_new_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_text_studio_credits(p_user_id uuid, p_amount numeric, p_conversation_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current NUMERIC;
  v_new NUMERIC;
  v_currency TEXT;
  v_factor NUMERIC := public.get_ai_discount_factor(p_user_id);
  v_amount NUMERIC := round(GREATEST(COALESCE(p_amount, 0), 0) * v_factor, 2);
BEGIN
  SELECT balance_euros, currency INTO v_current, v_currency
  FROM public.ai_video_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  IF v_current < v_amount THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  UPDATE public.ai_video_wallets
  SET balance_euros = balance_euros - v_amount,
      total_spent_euros = total_spent_euros + v_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_euros INTO v_new;

  INSERT INTO public.ai_video_transactions (
    user_id, currency, type, amount_euros, balance_after, description, metadata
  ) VALUES (
    p_user_id, v_currency, 'deduction', -v_amount, v_new,
    'AI Text Studio',
    jsonb_build_object('source', 'text_studio', 'conversation_id', p_conversation_id,
                       'list_amount_euros', round(GREATEST(COALESCE(p_amount, 0), 0), 2),
                       'discount_factor', v_factor)
  );

  RETURN v_new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.composer_reserve_run_credits(p_user_id uuid, p_amount numeric, p_project_id uuid DEFAULT NULL::uuid, p_scene_ids uuid[] DEFAULT '{}'::uuid[], p_run_ids uuid[] DEFAULT '{}'::uuid[], p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_factor numeric := public.get_ai_discount_factor(p_user_id);
  v_amount numeric := round(GREATEST(p_amount, 0)::numeric * v_factor, 2);
  v_balance numeric;
  v_id uuid;
BEGIN
  UPDATE public.ai_video_wallets
     SET balance_euros = balance_euros - v_amount,
         total_spent_euros = total_spent_euros + v_amount,
         updated_at = now()
   WHERE user_id = p_user_id
     AND balance_euros >= v_amount
  RETURNING balance_euros INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.composer_run_reservations
    (user_id, project_id, scene_ids, run_ids, reserved_euros, metadata)
  VALUES
    (p_user_id, p_project_id, COALESCE(p_scene_ids,'{}'), COALESCE(p_run_ids,'{}'), v_amount,
     COALESCE(p_metadata,'{}') || jsonb_build_object('discount_factor', v_factor))
  RETURNING id INTO v_id;

  INSERT INTO public.ai_video_transactions
    (user_id, type, amount_euros, balance_after, generation_id, description, metadata)
  VALUES
    (p_user_id, 'deduction', v_amount, v_balance, p_project_id,
     'Composer run reservation (v427)',
     jsonb_build_object('reservation_id', v_id, 'discount_factor', v_factor));

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.composer_settle_run_reservation(p_reservation_id uuid, p_actual numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_res public.composer_run_reservations%ROWTYPE;
  v_factor numeric;
  v_actual numeric;
  v_refund numeric;
  v_balance numeric;
BEGIN
  SELECT * INTO v_res FROM public.composer_run_reservations
   WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation_missing' USING ERRCODE = 'P0001';
  END IF;
  IF v_res.status <> 'reserved' THEN
    RETURN 0;
  END IF;

  v_factor := public.get_ai_discount_factor(v_res.user_id);
  v_actual := LEAST(GREATEST(round(COALESCE(p_actual,0)::numeric * v_factor, 2), 0), v_res.reserved_euros);
  v_refund := v_res.reserved_euros - v_actual;

  IF v_refund > 0 THEN
    UPDATE public.ai_video_wallets
       SET balance_euros = balance_euros + v_refund,
           total_spent_euros = GREATEST(total_spent_euros - v_refund, 0),
           updated_at = now()
     WHERE user_id = v_res.user_id
    RETURNING balance_euros INTO v_balance;

    INSERT INTO public.ai_video_transactions
      (user_id, type, amount_euros, balance_after, generation_id, description, metadata)
    VALUES
      (v_res.user_id, 'refund', v_refund, COALESCE(v_balance, 0), v_res.project_id,
       'Composer reservation settled (v427)', jsonb_build_object('reservation_id', v_res.id));
  END IF;

  UPDATE public.composer_run_reservations
     SET status = 'settled', actual_euros = v_actual, settled_at = now()
   WHERE id = v_res.id;

  RETURN v_refund;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount integer)
RETURNS TABLE(new_balance integer, success boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_balance INTEGER;
  v_amount INTEGER := GREATEST(CEIL(GREATEST(COALESCE(p_amount, 0), 0) * public.get_ai_discount_factor(p_user_id)), 0)::integer;
BEGIN
  UPDATE public.wallets
  SET balance = balance - v_amount, updated_at = now()
  WHERE user_id = p_user_id
    AND balance >= v_amount
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NOT NULL THEN
    RETURN QUERY SELECT v_new_balance, true;
  ELSE
    RETURN QUERY SELECT 0, false;
  END IF;
END;
$function$;