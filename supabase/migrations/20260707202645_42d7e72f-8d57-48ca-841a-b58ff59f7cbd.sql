
-- ============================================================================
-- ID-Only Cast Resolution + Face-Track Foundation
-- ============================================================================
-- Additive: existing scenes continue to work via legacy fallback.
-- composer_scenes ownership: via project_id -> composer_projects.user_id
-- ============================================================================

-- 1) composer_scenes.dialog_turns ---------------------------------------------

ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS dialog_turns jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.composer_scenes.dialog_turns IS
  'Canonical ID-referenced dialog turns. Format: [{turnId, characterId, text, mood?, order}]. characterId must be a valid brand_characters.id. When non-empty, backend uses this as single source of truth and skips name-based fuzzy speaker resolution.';

-- Best-effort backfill from dialog_script + character_shots.
DO $$
DECLARE
  scn RECORD;
  turn_arr jsonb;
  script_txt text;
  cast_ids uuid[];
  matched_id uuid;
  m text[];
  name_prefix text;
  body text;
  order_i int;
  turn_uuid text;
BEGIN
  FOR scn IN
    SELECT id, dialog_script, character_shots
    FROM public.composer_scenes
    WHERE COALESCE(dialog_script, '') <> ''
      AND jsonb_array_length(COALESCE(dialog_turns, '[]'::jsonb)) = 0
  LOOP
    script_txt := scn.dialog_script;
    turn_arr := '[]'::jsonb;
    order_i := 0;

    SELECT COALESCE(array_agg(DISTINCT (elem->>'characterId')::uuid), ARRAY[]::uuid[])
      INTO cast_ids
    FROM jsonb_array_elements(COALESCE(scn.character_shots, '[]'::jsonb)) AS elem
    WHERE elem->>'characterId' IS NOT NULL
      AND elem->>'characterId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

    IF array_length(cast_ids, 1) IS NULL THEN
      CONTINUE;
    END IF;

    FOR m IN
      SELECT regexp_matches(
        script_txt,
        '(?:^|\n)\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .''-]{0,60}?)\s*:\s*([^\n]+)',
        'g'
      )
    LOOP
      name_prefix := trim(m[1]);
      body := trim(m[2]);
      IF name_prefix = '' OR body = '' THEN CONTINUE; END IF;

      SELECT bc.id INTO matched_id
      FROM public.brand_characters bc
      WHERE bc.id = ANY(cast_ids)
        AND (
          lower(bc.name) = lower(name_prefix)
          OR lower(split_part(bc.name, ' ', 1)) = lower(split_part(name_prefix, ' ', 1))
        )
      LIMIT 1;

      IF matched_id IS NULL THEN CONTINUE; END IF;

      turn_uuid := gen_random_uuid()::text;
      turn_arr := turn_arr || jsonb_build_object(
        'turnId', turn_uuid,
        'characterId', matched_id::text,
        'text', body,
        'order', order_i
      );
      order_i := order_i + 1;
    END LOOP;

    IF jsonb_array_length(turn_arr) > 0 THEN
      UPDATE public.composer_scenes
        SET dialog_turns = turn_arr
        WHERE id = scn.id;
    END IF;
  END LOOP;
END $$;


-- 2) scene_face_tracks --------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.scene_face_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES public.composer_scenes(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.brand_characters(id) ON DELETE CASCADE,
  pass_idx int NOT NULL DEFAULT 0,
  track_kind text NOT NULL DEFAULT 'motion' CHECK (track_kind IN ('anchor', 'motion')),
  plate_url text,
  frames jsonb NOT NULL DEFAULT '[]'::jsonb,
  face_embedding vector(512),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scene_id, character_id, pass_idx)
);

COMMENT ON TABLE public.scene_face_tracks IS
  'Per-(scene, character_id, pass) face trajectory. Enables trajectory-aware Single-Face preclips for stable lipsync during body motion (driving, fighting).';

CREATE INDEX IF NOT EXISTS idx_scene_face_tracks_scene ON public.scene_face_tracks(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_face_tracks_character ON public.scene_face_tracks(character_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scene_face_tracks TO authenticated;
GRANT ALL ON public.scene_face_tracks TO service_role;

ALTER TABLE public.scene_face_tracks ENABLE ROW LEVEL SECURITY;

-- Ownership: scene -> project -> user
CREATE POLICY "Users can view face tracks for own scenes"
  ON public.scene_face_tracks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.composer_scenes cs
      JOIN public.composer_projects cp ON cp.id = cs.project_id
      WHERE cs.id = scene_face_tracks.scene_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert face tracks for own scenes"
  ON public.scene_face_tracks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.composer_scenes cs
      JOIN public.composer_projects cp ON cp.id = cs.project_id
      WHERE cs.id = scene_face_tracks.scene_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update face tracks for own scenes"
  ON public.scene_face_tracks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.composer_scenes cs
      JOIN public.composer_projects cp ON cp.id = cs.project_id
      WHERE cs.id = scene_face_tracks.scene_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete face tracks for own scenes"
  ON public.scene_face_tracks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.composer_scenes cs
      JOIN public.composer_projects cp ON cp.id = cs.project_id
      WHERE cs.id = scene_face_tracks.scene_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.tg_scene_face_tracks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scene_face_tracks_updated_at ON public.scene_face_tracks;
CREATE TRIGGER scene_face_tracks_updated_at
  BEFORE UPDATE ON public.scene_face_tracks
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_scene_face_tracks_updated_at();


-- 3) Feature flags in system_config -------------------------------------------

INSERT INTO public.system_config (key, value)
VALUES
  ('composer.feature.id_only_cast_resolution', 'true'::jsonb),
  ('composer.feature.face_track_preclip', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
