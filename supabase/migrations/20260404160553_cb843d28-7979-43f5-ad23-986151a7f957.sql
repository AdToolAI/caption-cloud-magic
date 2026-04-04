CREATE TABLE public.video_translations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_video_url TEXT NOT NULL,
  source_language TEXT,
  target_language TEXT NOT NULL,
  original_transcript TEXT,
  translated_transcript TEXT,
  voiceover_url TEXT,
  output_video_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.video_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own translations"
  ON public.video_translations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own translations"
  ON public.video_translations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own translations"
  ON public.video_translations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON public.video_translations FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER update_video_translations_updated_at
  BEFORE UPDATE ON public.video_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.video_translations;