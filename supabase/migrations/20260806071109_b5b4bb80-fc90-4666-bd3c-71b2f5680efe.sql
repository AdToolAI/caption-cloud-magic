ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_profile_privileged_updates;

UPDATE public.profiles p
SET plan = 'pro',
    test_mode_plan = NULL,
    stripe_customer_id = NULL,
    account_paused = false,
    trial_status = 'converted'
FROM auth.users u
WHERE u.id = p.id AND u.email = 'info@useadtool.ai';

ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_privileged_updates;