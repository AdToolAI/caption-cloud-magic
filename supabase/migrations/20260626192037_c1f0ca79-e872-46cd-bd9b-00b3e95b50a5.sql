ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_marketing_email_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_profiles_last_marketing_email_at ON public.profiles(last_marketing_email_at);