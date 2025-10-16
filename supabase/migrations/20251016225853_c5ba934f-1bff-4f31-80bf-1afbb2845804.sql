-- Create backup table for Instagram Page Tokens
CREATE TABLE IF NOT EXISTS public.kv_secrets_backup (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_last6 TEXT NOT NULL,
  scopes JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS kv_secrets_backup_name_created_at_idx 
ON public.kv_secrets_backup(name, created_at DESC);

-- Enable RLS (only service role can access)
ALTER TABLE public.kv_secrets_backup ENABLE ROW LEVEL SECURITY;

-- No policies = only service role can access (most secure)
COMMENT ON TABLE public.kv_secrets_backup IS 'Backup history for sensitive secrets. Only accessible via service role.';