-- ============================================================
-- Motion Studio Casting & Scene Building — Upgrades A + B + C
-- ============================================================

-- 1. Optional workspace_id on existing library tables (sharing)
ALTER TABLE public.motion_studio_characters
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

ALTER TABLE public.motion_studio_locations
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_motion_studio_characters_workspace
  ON public.motion_studio_characters(workspace_id) WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_motion_studio_locations_workspace
  ON public.motion_studio_locations(workspace_id) WHERE workspace_id IS NOT NULL;

-- Add workspace-read policies (existing user-scoped policies remain for write)
DROP POLICY IF EXISTS "Workspace members view shared characters" ON public.motion_studio_characters;
CREATE POLICY "Workspace members view shared characters"
  ON public.motion_studio_characters FOR SELECT
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member_func(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "Workspace members view shared locations" ON public.motion_studio_locations;
CREATE POLICY "Workspace members view shared locations"
  ON public.motion_studio_locations FOR SELECT
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member_func(workspace_id, auth.uid())
  );

-- 2. Character Variants (Multi-Vibe Casting) ------------------
CREATE TABLE IF NOT EXISTS public.motion_studio_character_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.motion_studio_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vibe text NOT NULL,                  -- e.g. 'realistic', 'cinematic', 'editorial', 'documentary'
  label text,                          -- optional human label
  image_url text NOT NULL,
  seed text,
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msc_variants_character ON public.motion_studio_character_variants(character_id);
CREATE INDEX IF NOT EXISTS idx_msc_variants_user ON public.motion_studio_character_variants(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_msc_variants_one_primary
  ON public.motion_studio_character_variants(character_id) WHERE is_primary = true;

ALTER TABLE public.motion_studio_character_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own character variants"
  ON public.motion_studio_character_variants FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Workspace members view shared character variants"
  ON public.motion_studio_character_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.motion_studio_characters c
      WHERE c.id = motion_studio_character_variants.character_id
        AND c.workspace_id IS NOT NULL
        AND public.is_workspace_member_func(c.workspace_id, auth.uid())
    )
  );
CREATE POLICY "Users insert own character variants"
  ON public.motion_studio_character_variants FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own character variants"
  ON public.motion_studio_character_variants FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own character variants"
  ON public.motion_studio_character_variants FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Location Variants (Lighting / Inpaint outputs) -----------
CREATE TABLE IF NOT EXISTS public.motion_studio_location_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.motion_studio_locations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vibe text NOT NULL,                  -- e.g. 'sunrise', 'night', 'overcast', 'inpaint'
  label text,
  image_url text NOT NULL,
  seed text,
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msl_variants_location ON public.motion_studio_location_variants(location_id);
CREATE INDEX IF NOT EXISTS idx_msl_variants_user ON public.motion_studio_location_variants(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_msl_variants_one_primary
  ON public.motion_studio_location_variants(location_id) WHERE is_primary = true;

ALTER TABLE public.motion_studio_location_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own location variants"
  ON public.motion_studio_location_variants FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Workspace members view shared location variants"
  ON public.motion_studio_location_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.motion_studio_locations l
      WHERE l.id = motion_studio_location_variants.location_id
        AND l.workspace_id IS NOT NULL
        AND public.is_workspace_member_func(l.workspace_id, auth.uid())
    )
  );
CREATE POLICY "Users insert own location variants"
  ON public.motion_studio_location_variants FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own location variants"
  ON public.motion_studio_location_variants FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own location variants"
  ON public.motion_studio_location_variants FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Scene Snippets (Story building blocks) -------------------
CREATE TABLE IF NOT EXISTS public.motion_studio_scene_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text DEFAULT '',
  prompt text NOT NULL,
  cast_character_ids uuid[] DEFAULT '{}',
  location_id uuid REFERENCES public.motion_studio_locations(id) ON DELETE SET NULL,
  clip_url text,
  last_frame_url text,
  reference_image_url text,
  duration_seconds numeric(5,2),
  tags text[] DEFAULT '{}',
  usage_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scene_snippets_user ON public.motion_studio_scene_snippets(user_id);
CREATE INDEX IF NOT EXISTS idx_scene_snippets_workspace
  ON public.motion_studio_scene_snippets(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scene_snippets_tags ON public.motion_studio_scene_snippets USING GIN(tags);

ALTER TABLE public.motion_studio_scene_snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own scene snippets"
  ON public.motion_studio_scene_snippets FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Workspace members view shared scene snippets"
  ON public.motion_studio_scene_snippets FOR SELECT
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member_func(workspace_id, auth.uid())
  );
CREATE POLICY "Users insert own scene snippets"
  ON public.motion_studio_scene_snippets FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own scene snippets"
  ON public.motion_studio_scene_snippets FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own scene snippets"
  ON public.motion_studio_scene_snippets FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_motion_studio_scene_snippets_updated_at
  BEFORE UPDATE ON public.motion_studio_scene_snippets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();