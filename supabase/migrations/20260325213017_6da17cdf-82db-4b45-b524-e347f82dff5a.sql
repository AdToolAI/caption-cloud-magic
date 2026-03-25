
-- Studio Albums table
CREATE TABLE public.studio_albums (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own albums" ON public.studio_albums FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own albums" ON public.studio_albums FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own albums" ON public.studio_albums FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own albums" ON public.studio_albums FOR DELETE USING (auth.uid() = user_id);

-- Studio Images table
CREATE TABLE public.studio_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  album_id UUID REFERENCES public.studio_albums(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  prompt TEXT,
  style TEXT,
  model_used TEXT,
  aspect_ratio TEXT DEFAULT '1:1',
  source TEXT NOT NULL DEFAULT 'generated' CHECK (source IN ('generated', 'background', 'upload')),
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own images" ON public.studio_images FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own images" ON public.studio_images FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own images" ON public.studio_images FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own images" ON public.studio_images FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at on albums
CREATE TRIGGER update_studio_albums_updated_at
  BEFORE UPDATE ON public.studio_albums
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
