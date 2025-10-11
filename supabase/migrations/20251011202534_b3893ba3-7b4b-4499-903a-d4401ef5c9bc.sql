-- Create carousel_projects table
CREATE TABLE public.carousel_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'en',
  platform TEXT NOT NULL DEFAULT 'instagram',
  template TEXT NOT NULL DEFAULT 'minimal',
  slide_count INTEGER NOT NULL DEFAULT 7 CHECK (slide_count >= 5 AND slide_count <= 10),
  brand_kit_id UUID REFERENCES public.brand_kits(id) ON DELETE SET NULL,
  outline_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  design_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  has_watermark BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.carousel_projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for carousel_projects
CREATE POLICY "Users can view own carousel projects"
  ON public.carousel_projects
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own carousel projects"
  ON public.carousel_projects
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own carousel projects"
  ON public.carousel_projects
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own carousel projects"
  ON public.carousel_projects
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_carousel_projects_updated_at
  BEFORE UPDATE ON public.carousel_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Create carousel_assets table (for future export storage)
CREATE TABLE public.carousel_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.carousel_projects(id) ON DELETE CASCADE,
  slide_index INTEGER NOT NULL,
  image_url TEXT,
  exported_png_url TEXT,
  exported_pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.carousel_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for carousel_assets
CREATE POLICY "Users can view own carousel assets"
  ON public.carousel_assets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.carousel_projects
      WHERE carousel_projects.id = carousel_assets.project_id
      AND carousel_projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own carousel assets"
  ON public.carousel_assets
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carousel_projects
      WHERE carousel_projects.id = carousel_assets.project_id
      AND carousel_projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own carousel assets"
  ON public.carousel_assets
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.carousel_projects
      WHERE carousel_projects.id = carousel_assets.project_id
      AND carousel_projects.user_id = auth.uid()
    )
  );