-- Block K-4: Motion Studio Style Presets
CREATE TABLE IF NOT EXISTS public.motion_studio_style_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  slots JSONB NOT NULL DEFAULT '{}'::jsonb,
  director_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_thumb_url TEXT,
  category TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msp_user ON public.motion_studio_style_presets(user_id);
CREATE INDEX IF NOT EXISTS idx_msp_public ON public.motion_studio_style_presets(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_msp_category ON public.motion_studio_style_presets(category) WHERE category IS NOT NULL;

ALTER TABLE public.motion_studio_style_presets ENABLE ROW LEVEL SECURITY;

-- READ: own + public + system (user_id IS NULL)
CREATE POLICY "msp_select_visible"
  ON public.motion_studio_style_presets
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_public = true
    OR user_id IS NULL
  );

-- INSERT: only own
CREATE POLICY "msp_insert_own"
  ON public.motion_studio_style_presets
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: only own
CREATE POLICY "msp_update_own"
  ON public.motion_studio_style_presets
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: only own
CREATE POLICY "msp_delete_own"
  ON public.motion_studio_style_presets
  FOR DELETE
  USING (user_id = auth.uid());

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_msp_updated_at ON public.motion_studio_style_presets;
CREATE TRIGGER trg_msp_updated_at
  BEFORE UPDATE ON public.motion_studio_style_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Extend composer_scenes with slot fields (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'composer_scenes') THEN
    ALTER TABLE public.composer_scenes
      ADD COLUMN IF NOT EXISTS prompt_slots JSONB,
      ADD COLUMN IF NOT EXISTS prompt_mode TEXT CHECK (prompt_mode IN ('free', 'structured')),
      ADD COLUMN IF NOT EXISTS applied_style_preset_id UUID REFERENCES public.motion_studio_style_presets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Seed system presets (user_id NULL → visible to everyone, immutable for users)
INSERT INTO public.motion_studio_style_presets (user_id, name, description, category, is_public, slots, director_modifiers)
VALUES
  (NULL, 'Cinematic Drama',
   'Premium Hollywood look — dramatic lighting, anamorphic lens, teal & orange grade.',
   'genre', true,
   '{"style":"cinematic Hollywood drama, anamorphic widescreen, teal and orange color grade","timeWeather":"golden hour with long shadows"}'::jsonb,
   '{"camera":"cam-dolly-in","lens":"lens-anamorphic","lighting":"light-golden-hour","mood":"mood-dramatic"}'::jsonb),
  (NULL, 'Vlog Authentic',
   'Handheld, natural light, lifestyle storytelling.',
   'genre', true,
   '{"style":"authentic lifestyle vlog, candid handheld documentary feel","timeWeather":"soft natural daylight"}'::jsonb,
   '{"camera":"cam-handheld","lighting":"light-natural-day"}'::jsonb),
  (NULL, 'Commercial Glow',
   'Bright product spot — clean, punchy, high-contrast.',
   'genre', true,
   '{"style":"polished commercial spot, glossy product hero shot, hyper-clean studio aesthetic","timeWeather":"bright studio lighting, no shadows"}'::jsonb,
   '{"camera":"cam-orbit","lens":"lens-macro","lighting":"light-studio-softbox"}'::jsonb),
  (NULL, 'Horror Tension',
   'Dark, low-key chiaroscuro with unsettling movement.',
   'genre', true,
   '{"style":"horror cinematography, low-key chiaroscuro, desaturated palette, unsettling atmosphere","timeWeather":"dim moonlight, fog","negative":"no jump scares, no gore on screen"}'::jsonb,
   '{"camera":"cam-handheld","lighting":"light-low-key","mood":"mood-eerie"}'::jsonb),
  (NULL, 'Anime Vibrant',
   'Hand-drawn anime aesthetic with painterly skies.',
   'genre', true,
   '{"style":"Japanese anime aesthetic, cel-shaded characters, painterly sky gradients, Studio Ghibli inspired"}'::jsonb,
   '{}'::jsonb),
  (NULL, 'Documentary Real',
   'Observational reportage with natural sound and motion.',
   'genre', true,
   '{"style":"documentary reportage style, observational framing, journalistic authenticity","timeWeather":"available natural light"}'::jsonb,
   '{"camera":"cam-handheld","lighting":"light-natural-day"}'::jsonb)
ON CONFLICT DO NOTHING;