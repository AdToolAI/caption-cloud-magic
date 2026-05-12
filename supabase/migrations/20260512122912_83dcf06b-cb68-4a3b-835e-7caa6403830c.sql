
-- 1) Preset table
CREATE TABLE public.system_preset_avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role_label TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('female','male','neutral')),
  description TEXT,
  portrait_url TEXT,
  reference_image_url TEXT,
  visual_identity_json JSONB DEFAULT '{}'::jsonb,
  default_voice_id TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_preset_avatars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "preset_avatars_read_all_authenticated"
  ON public.system_preset_avatars FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "preset_avatars_admin_insert"
  ON public.system_preset_avatars FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "preset_avatars_admin_update"
  ON public.system_preset_avatars FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "preset_avatars_admin_delete"
  ON public.system_preset_avatars FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_system_preset_avatars_updated_at
  BEFORE UPDATE ON public.system_preset_avatars
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_system_preset_avatars_active_sort
  ON public.system_preset_avatars (is_active, sort_order);

-- 2) Track cloned origin on brand_characters
ALTER TABLE public.brand_characters
  ADD COLUMN IF NOT EXISTS cloned_from_preset UUID REFERENCES public.system_preset_avatars(id) ON DELETE SET NULL;

-- 3) Public storage bucket for preset assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('system-preset-avatars', 'system-preset-avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "preset_assets_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'system-preset-avatars');

CREATE POLICY "preset_assets_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'system-preset-avatars' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "preset_assets_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'system-preset-avatars' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "preset_assets_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'system-preset-avatars' AND public.has_role(auth.uid(), 'admin'));
