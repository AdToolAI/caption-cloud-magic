-- Create secure app_secrets table for storing sensitive tokens
-- Only accessible via service role, not from client
CREATE TABLE IF NOT EXISTS public.app_secrets (
  name TEXT PRIMARY KEY,
  encrypted_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- NO public policies - only service role can access
-- This ensures secrets are only readable/writable from Edge Functions with service role key

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_secrets_name ON public.app_secrets(name);

-- Add trigger for updated_at
CREATE TRIGGER update_app_secrets_updated_at
  BEFORE UPDATE ON public.app_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();