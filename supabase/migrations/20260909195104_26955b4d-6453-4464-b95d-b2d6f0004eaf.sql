-- 1. Storage policies for the new private brand-assets bucket (owner = first path segment)
CREATE POLICY "brand_assets_read_own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "brand_assets_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "brand_assets_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = (auth.uid())::text)
WITH CHECK (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "brand_assets_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- 2. Harden brand-logos uploads: authenticated only, own folder, image extensions only
DROP POLICY IF EXISTS "Users can upload own brand logos" ON storage.objects;
CREATE POLICY "Users can upload own brand logos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'brand-logos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND lower(storage.extension(name)) IN ('png','jpg','jpeg','webp','svg')
);

-- 3. Persistent brand attribution on content entities
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS brand_kit_id uuid REFERENCES public.brand_kits(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS brand_kit_id uuid REFERENCES public.brand_kits(id) ON DELETE SET NULL;
ALTER TABLE public.content_projects ADD COLUMN IF NOT EXISTS brand_kit_id uuid REFERENCES public.brand_kits(id) ON DELETE SET NULL;
ALTER TABLE public.media_library ADD COLUMN IF NOT EXISTS brand_kit_id uuid REFERENCES public.brand_kits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_brand_kit_id ON public.campaigns(brand_kit_id);
CREATE INDEX IF NOT EXISTS idx_posts_brand_kit_id ON public.posts(brand_kit_id);
CREATE INDEX IF NOT EXISTS idx_content_projects_brand_kit_id ON public.content_projects(brand_kit_id);
CREATE INDEX IF NOT EXISTS idx_media_library_brand_kit_id ON public.media_library(brand_kit_id);

-- 4. Non-destructive archiving for brand kits
ALTER TABLE public.brand_kits ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_brand_kits_archived_at ON public.brand_kits(archived_at);