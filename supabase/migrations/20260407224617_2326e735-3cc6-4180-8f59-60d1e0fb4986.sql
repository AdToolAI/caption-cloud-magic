CREATE TABLE public.gaming_discord_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  webhook_url TEXT NOT NULL,
  auto_notify_live BOOLEAN DEFAULT true,
  auto_notify_offline BOOLEAN DEFAULT false,
  notify_on_clip BOOLEAN DEFAULT false,
  custom_go_live_message TEXT,
  custom_offline_message TEXT,
  embed_color INTEGER DEFAULT 9520895,
  include_viewer_count BOOLEAN DEFAULT true,
  include_category BOOLEAN DEFAULT true,
  include_thumbnail BOOLEAN DEFAULT true,
  last_notification_at TIMESTAMPTZ,
  notification_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gaming_discord_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own discord settings"
  ON public.gaming_discord_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_gaming_discord_settings_updated_at
  BEFORE UPDATE ON public.gaming_discord_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();