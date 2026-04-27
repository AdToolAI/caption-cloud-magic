
-- ============= COLLABORATORS TABLE =============
CREATE TABLE public.composer_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  invited_email text,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer','editor','owner')),
  invited_by uuid,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_composer_collaborators_project ON public.composer_collaborators(project_id);
CREATE INDEX idx_composer_collaborators_user ON public.composer_collaborators(user_id);

ALTER TABLE public.composer_collaborators ENABLE ROW LEVEL SECURITY;

-- ============= COMMENTS TABLE =============
CREATE TABLE public.composer_scene_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES public.composer_scenes(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  parent_id uuid REFERENCES public.composer_scene_comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) > 0 AND length(body) <= 5000),
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_composer_scene_comments_scene ON public.composer_scene_comments(scene_id, created_at);
CREATE INDEX idx_composer_scene_comments_project ON public.composer_scene_comments(project_id);

ALTER TABLE public.composer_scene_comments ENABLE ROW LEVEL SECURITY;

-- ============= ACCESS HELPER (security definer to avoid RLS recursion) =============
CREATE OR REPLACE FUNCTION public.can_access_composer_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.composer_projects
    WHERE id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.composer_collaborators
    WHERE project_id = _project_id
      AND user_id = _user_id
      AND accepted_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_composer_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.composer_projects
    WHERE id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.composer_collaborators
    WHERE project_id = _project_id
      AND user_id = _user_id
      AND accepted_at IS NOT NULL
      AND role IN ('editor','owner')
  );
$$;

-- ============= RLS: composer_collaborators =============
CREATE POLICY "Project owners manage collaborators"
ON public.composer_collaborators
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.composer_projects p WHERE p.id = project_id AND p.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.composer_projects p WHERE p.id = project_id AND p.user_id = auth.uid())
);

CREATE POLICY "Collaborators can view their own membership"
ON public.composer_collaborators
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Collaborators can accept their own invitation"
ON public.composer_collaborators
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Members can view all collaborators of accessible project"
ON public.composer_collaborators
FOR SELECT
USING (public.can_access_composer_project(project_id, auth.uid()));

-- ============= RLS: composer_scene_comments =============
CREATE POLICY "Members can view comments on accessible projects"
ON public.composer_scene_comments
FOR SELECT
USING (public.can_access_composer_project(project_id, auth.uid()));

CREATE POLICY "Members can create comments on accessible projects"
ON public.composer_scene_comments
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND public.can_access_composer_project(project_id, auth.uid())
);

CREATE POLICY "Authors can update their own comments"
ON public.composer_scene_comments
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authors and owners can delete comments"
ON public.composer_scene_comments
FOR DELETE
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.composer_projects p WHERE p.id = project_id AND p.user_id = auth.uid())
);

CREATE POLICY "Editors can resolve comments"
ON public.composer_scene_comments
FOR UPDATE
USING (public.can_edit_composer_project(project_id, auth.uid()))
WITH CHECK (public.can_edit_composer_project(project_id, auth.uid()));

-- ============= EXPAND composer_projects RLS for collaborators =============
CREATE POLICY "Collaborators can view shared projects"
ON public.composer_projects
FOR SELECT
USING (public.can_access_composer_project(id, auth.uid()));

CREATE POLICY "Editor collaborators can update shared projects"
ON public.composer_projects
FOR UPDATE
USING (public.can_edit_composer_project(id, auth.uid()))
WITH CHECK (public.can_edit_composer_project(id, auth.uid()));

-- ============= EXPAND composer_scenes RLS for collaborators =============
CREATE POLICY "Collaborators can view shared scenes"
ON public.composer_scenes
FOR SELECT
USING (public.can_access_composer_project(project_id, auth.uid()));

CREATE POLICY "Editor collaborators can modify shared scenes"
ON public.composer_scenes
FOR ALL
USING (public.can_edit_composer_project(project_id, auth.uid()))
WITH CHECK (public.can_edit_composer_project(project_id, auth.uid()));

-- ============= TRIGGERS =============
CREATE TRIGGER trg_composer_collaborators_updated
BEFORE UPDATE ON public.composer_collaborators
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_composer_scene_comments_updated
BEFORE UPDATE ON public.composer_scene_comments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= REALTIME =============
ALTER TABLE public.composer_scenes REPLICA IDENTITY FULL;
ALTER TABLE public.composer_scene_comments REPLICA IDENTITY FULL;
ALTER TABLE public.composer_collaborators REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.composer_scenes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.composer_scene_comments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.composer_collaborators;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
