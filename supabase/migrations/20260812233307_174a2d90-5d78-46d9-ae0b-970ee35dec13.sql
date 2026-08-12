CREATE TABLE IF NOT EXISTS public.composer_run_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid,
  scene_ids uuid[] NOT NULL DEFAULT '{}',
  run_ids uuid[] NOT NULL DEFAULT '{}',
  reserved_euros numeric(10,2) NOT NULL,
  actual_euros numeric(10,2),
  status text NOT NULL DEFAULT 'reserved',
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  CONSTRAINT composer_run_reservations_status_check
    CHECK (status IN ('reserved','settled','released'))
);

CREATE INDEX IF NOT EXISTS composer_run_reservations_user_idx
  ON public.composer_run_reservations (user_id, created_at DESC);

GRANT SELECT ON public.composer_run_reservations TO authenticated;
GRANT ALL ON public.composer_run_reservations TO service_role;

ALTER TABLE public.composer_run_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own composer reservations" ON public.composer_run_reservations;
CREATE POLICY "Users read own composer reservations"
  ON public.composer_run_reservations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Atomic upper-bound reservation: debits the wallet only when it covers the
-- amount, so no paid provider job can ever start without funds behind it.
CREATE OR REPLACE FUNCTION public.composer_reserve_run_credits(
  p_user_id uuid,
  p_amount numeric,
  p_project_id uuid DEFAULT NULL,
  p_scene_ids uuid[] DEFAULT '{}',
  p_run_ids uuid[] DEFAULT '{}',
  p_metadata jsonb DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := round(GREATEST(p_amount, 0)::numeric, 2);
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
    (p_user_id, p_project_id, COALESCE(p_scene_ids,'{}'), COALESCE(p_run_ids,'{}'), v_amount, COALESCE(p_metadata,'{}'))
  RETURNING id INTO v_id;

  INSERT INTO public.ai_video_transactions
    (user_id, type, amount_euros, balance_after, generation_id, description, metadata)
  VALUES
    (p_user_id, 'deduction', v_amount, v_balance, p_project_id,
     'Composer run reservation (v427)', jsonb_build_object('reservation_id', v_id));

  RETURN v_id;
END;
$$;

-- Reduce a reservation to the amount actually owed and refund the difference.
CREATE OR REPLACE FUNCTION public.composer_settle_run_reservation(
  p_reservation_id uuid,
  p_actual numeric
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res public.composer_run_reservations%ROWTYPE;
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

  v_actual := LEAST(GREATEST(round(COALESCE(p_actual,0)::numeric, 2), 0), v_res.reserved_euros);
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
$$;

-- Full release: nothing was dispatched, everything goes back.
CREATE OR REPLACE FUNCTION public.composer_release_run_reservation(
  p_reservation_id uuid,
  p_reason text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund numeric;
BEGIN
  SELECT public.composer_settle_run_reservation(p_reservation_id, 0) INTO v_refund;
  UPDATE public.composer_run_reservations
     SET status = 'released', reason = COALESCE(p_reason, reason)
   WHERE id = p_reservation_id AND status = 'settled' AND actual_euros = 0;
  RETURN v_refund;
END;
$$;

REVOKE ALL ON FUNCTION public.composer_reserve_run_credits(uuid, numeric, uuid, uuid[], uuid[], jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.composer_settle_run_reservation(uuid, numeric) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.composer_release_run_reservation(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_reserve_run_credits(uuid, numeric, uuid, uuid[], uuid[], jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.composer_settle_run_reservation(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.composer_release_run_reservation(uuid, text) TO service_role;