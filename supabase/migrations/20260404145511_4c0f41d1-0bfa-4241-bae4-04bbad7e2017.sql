
-- Cloud Storage Connections table
CREATE TABLE public.cloud_storage_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google_drive',
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  folder_id TEXT,
  folder_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_sync BOOLEAN NOT NULL DEFAULT false,
  quota_bytes BIGINT DEFAULT 0,
  used_bytes BIGINT DEFAULT 0,
  account_email TEXT,
  account_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.cloud_storage_connections ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own cloud connections"
  ON public.cloud_storage_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own cloud connections"
  ON public.cloud_storage_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cloud connections"
  ON public.cloud_storage_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cloud connections"
  ON public.cloud_storage_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER update_cloud_storage_connections_updated_at
  BEFORE UPDATE ON public.cloud_storage_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
