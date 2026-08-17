CREATE TABLE IF NOT EXISTS public._p1a_race_log (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._p1a_race_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public._p1a_race_fixture (
  user_id uuid NOT NULL,
  charge_id uuid NOT NULL,
  run_id uuid NOT NULL
);
ALTER TABLE public._p1a_race_fixture ENABLE ROW LEVEL SECURITY;

DO $setup$
DECLARE
  v_user uuid := gen_random_uuid();
  v_run uuid := gen_random_uuid();
  v_charge uuid;
BEGIN
  INSERT INTO public.ai_video_wallets (user_id, balance_euros) VALUES (v_user, 0.00);
  INSERT INTO public.ai_video_transactions (user_id, type, amount_euros, balance_after, generation_id, description)
  VALUES (v_user, 'deduction', -4.00, 0.00, v_run, 'p1a race fixture')
  RETURNING id INTO v_charge;
  INSERT INTO public._p1a_race_fixture (user_id, charge_id, run_id) VALUES (v_user, v_charge, v_run);
END;
$setup$;

SELECT cron.schedule(
  'p1a_race_a', '* * * * *',
  $job$INSERT INTO public._p1a_race_log (actor, result)
       SELECT 'a', public.composer_refund_charge(f.charge_id, f.run_id, 'race_a')
       FROM public._p1a_race_fixture f$job$
);

SELECT cron.schedule(
  'p1a_race_b', '* * * * *',
  $job$INSERT INTO public._p1a_race_log (actor, result)
       SELECT 'b', public.composer_refund_charge(f.charge_id, f.run_id, 'race_b')
       FROM public._p1a_race_fixture f$job$
);