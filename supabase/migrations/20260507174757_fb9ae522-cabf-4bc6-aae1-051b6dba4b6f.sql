
CREATE TABLE IF NOT EXISTS public.scene_audio_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid,
  scene_id text,
  kind text NOT NULL CHECK (kind IN ('ambient','sfx','foley','music','voiceover')),
  source text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','stock','upload')),
  prompt text,
  url text NOT NULL,
  storage_path text,
  start_offset numeric NOT NULL DEFAULT 0,
  duration numeric NOT NULL DEFAULT 5,
  volume numeric NOT NULL DEFAULT 0.5,
  ducking_enabled boolean NOT NULL DEFAULT false,
  cost_credits integer NOT NULL DEFAULT 0,
  refunded boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scene_audio_clips_user ON public.scene_audio_clips(user_id);
CREATE INDEX IF NOT EXISTS idx_scene_audio_clips_project ON public.scene_audio_clips(project_id);
CREATE INDEX IF NOT EXISTS idx_scene_audio_clips_scene ON public.scene_audio_clips(scene_id);

ALTER TABLE public.scene_audio_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own scene audio clips"
  ON public.scene_audio_clips FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own scene audio clips"
  ON public.scene_audio_clips FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own scene audio clips"
  ON public.scene_audio_clips FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own scene audio clips"
  ON public.scene_audio_clips FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_scene_audio_clips_updated_at
  BEFORE UPDATE ON public.scene_audio_clips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for AI generated SFX / ambient
INSERT INTO storage.buckets (id, name, public)
VALUES ('scene-sfx','scene-sfx', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read scene-sfx"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'scene-sfx');

CREATE POLICY "Users upload own scene-sfx"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'scene-sfx'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users update own scene-sfx"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'scene-sfx'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own scene-sfx"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'scene-sfx'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
