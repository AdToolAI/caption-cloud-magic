ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_profile_privileged_updates;

UPDATE public.profiles
SET trial_ends_at = COALESCE(created_at, now()) + interval '14 days'
WHERE trial_ends_at IS NULL;

ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_privileged_updates;