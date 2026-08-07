CREATE TABLE public.meta_oauth_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  state_key text,
  requested_scopes text[],
  dialog_url text,
  uses_config_id boolean,
  auth_type text,
  fb_user_id text,
  fb_user_name text,
  granted_scopes text[],
  declined_scopes text[],
  granular_scopes jsonb,
  debug_token_raw jsonb,
  me_accounts_raw jsonb,
  me_businesses_raw jsonb,
  pages_found_count integer,
  callback_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_oauth_diagnostics_user_created
  ON public.meta_oauth_diagnostics (user_id, created_at DESC);
CREATE INDEX idx_meta_oauth_diagnostics_state_key
  ON public.meta_oauth_diagnostics (state_key);

GRANT SELECT ON public.meta_oauth_diagnostics TO authenticated;
GRANT ALL ON public.meta_oauth_diagnostics TO service_role;

ALTER TABLE public.meta_oauth_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own meta oauth diagnostics"
  ON public.meta_oauth_diagnostics
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);