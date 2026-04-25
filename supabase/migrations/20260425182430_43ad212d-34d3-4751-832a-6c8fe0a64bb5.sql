
-- Motion Studio Templates: kuratierte Vorlagen für neue Projekte
CREATE TABLE public.motion_studio_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  use_case TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT 'cinematic',
  category TEXT NOT NULL DEFAULT 'product-ad',
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  duration_seconds INTEGER NOT NULL DEFAULT 30,
  thumbnail_url TEXT,
  preview_video_url TEXT,
  briefing_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  scene_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_motion_studio_templates_active
  ON public.motion_studio_templates (is_active, sort_order)
  WHERE is_active = true;
CREATE INDEX idx_motion_studio_templates_use_case
  ON public.motion_studio_templates (use_case);
CREATE INDEX idx_motion_studio_templates_workspace
  ON public.motion_studio_templates (workspace_id)
  WHERE workspace_id IS NOT NULL;

ALTER TABLE public.motion_studio_templates ENABLE ROW LEVEL SECURITY;

-- Read: System-Templates (workspace_id IS NULL) + eigene Workspace-Templates
CREATE POLICY "Users can view active system or own workspace templates"
ON public.motion_studio_templates
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND (
    workspace_id IS NULL
    OR public.is_workspace_member_func(workspace_id, auth.uid())
  )
);

-- Insert/Update/Delete für Workspace-Admins
CREATE POLICY "Workspace admins can insert templates"
ON public.motion_studio_templates
FOR INSERT
TO authenticated
WITH CHECK (
  workspace_id IS NOT NULL
  AND public.is_workspace_admin(workspace_id, auth.uid())
);

CREATE POLICY "Workspace admins can update templates"
ON public.motion_studio_templates
FOR UPDATE
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND public.is_workspace_admin(workspace_id, auth.uid())
);

CREATE POLICY "Workspace admins can delete templates"
ON public.motion_studio_templates
FOR DELETE
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND public.is_workspace_admin(workspace_id, auth.uid())
);

-- Updated-At Trigger
CREATE TRIGGER update_motion_studio_templates_updated_at
BEFORE UPDATE ON public.motion_studio_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
