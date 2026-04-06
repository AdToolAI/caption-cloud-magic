
-- Stream sessions table
CREATE TABLE public.stream_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL DEFAULT 'twitch',
  stream_id TEXT,
  title TEXT,
  game_name TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  peak_viewers INTEGER DEFAULT 0,
  avg_viewers INTEGER DEFAULT 0,
  total_chat_messages INTEGER DEFAULT 0,
  thumbnail_url TEXT,
  vod_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stream_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own stream sessions" ON public.stream_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Stream clips table
CREATE TABLE public.stream_clips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.stream_sessions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  clip_url TEXT,
  thumbnail_url TEXT,
  duration_seconds NUMERIC,
  start_offset_seconds NUMERIC,
  view_count INTEGER DEFAULT 0,
  export_status TEXT DEFAULT 'pending',
  exported_platforms JSONB DEFAULT '[]'::jsonb,
  twitch_clip_id TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stream_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own clips" ON public.stream_clips FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Overlay presets table
CREATE TABLE public.overlay_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  preset_type TEXT NOT NULL DEFAULT 'alert',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_url TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.overlay_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own overlays" ON public.overlay_presets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Stream schedules table
CREATE TABLE public.stream_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  game_name TEXT,
  platform TEXT NOT NULL DEFAULT 'twitch',
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 120,
  auto_announce BOOLEAN DEFAULT false,
  announce_platforms JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stream_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own schedules" ON public.stream_schedules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_stream_sessions_updated_at BEFORE UPDATE ON public.stream_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_stream_clips_updated_at BEFORE UPDATE ON public.stream_clips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_overlay_presets_updated_at BEFORE UPDATE ON public.overlay_presets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_stream_schedules_updated_at BEFORE UPDATE ON public.stream_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
