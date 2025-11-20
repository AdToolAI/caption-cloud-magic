-- Phase 3: Tables for Multi-Format Export, Analytics, and Collaboration

-- 1. Batch Renders (Multi-Format Export)
CREATE TABLE IF NOT EXISTS public.batch_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.content_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Render Settings
  export_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_variants INTEGER NOT NULL DEFAULT 1,
  
  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rendering', 'completed', 'failed')),
  completed_variants INTEGER NOT NULL DEFAULT 0,
  failed_variants INTEGER NOT NULL DEFAULT 0,
  
  -- Output
  render_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Credits
  credits_used INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_batch_renders_user ON public.batch_renders(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_renders_project ON public.batch_renders(project_id);
CREATE INDEX IF NOT EXISTS idx_batch_renders_status ON public.batch_renders(status);

-- 2. Project Share Links (Public Sharing)
CREATE TABLE IF NOT EXISTS public.project_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.content_projects(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  
  -- Link Config
  share_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  max_views INTEGER DEFAULT NULL,
  current_views INTEGER NOT NULL DEFAULT 0,
  
  -- Permissions
  allow_download BOOLEAN NOT NULL DEFAULT true,
  allow_comments BOOLEAN NOT NULL DEFAULT false,
  require_password BOOLEAN NOT NULL DEFAULT false,
  password_hash TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_links_token ON public.project_share_links(share_token);
CREATE INDEX IF NOT EXISTS idx_share_links_project ON public.project_share_links(project_id);

-- 3. Project Collaborators (Team Collaboration)
CREATE TABLE IF NOT EXISTS public.project_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.content_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  invited_by UUID NOT NULL,
  
  -- Permission Level
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collaborators_project ON public.project_collaborators(project_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_user ON public.project_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_status ON public.project_collaborators(status);

-- RLS Policies
ALTER TABLE public.batch_renders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

-- batch_renders policies
CREATE POLICY "Users can view their own batch renders"
  ON public.batch_renders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create batch renders"
  ON public.batch_renders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- project_share_links policies
CREATE POLICY "Users can view share links for their projects"
  ON public.project_share_links FOR SELECT
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.content_projects 
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create share links for their projects"
  ON public.project_share_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content_projects 
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own share links"
  ON public.project_share_links FOR DELETE
  USING (created_by = auth.uid());

-- project_collaborators policies
CREATE POLICY "Users can view collaborations for their projects"
  ON public.project_collaborators FOR SELECT
  USING (
    user_id = auth.uid() OR
    invited_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.content_projects 
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can invite collaborators to their projects"
  ON public.project_collaborators FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content_projects 
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own collaboration status"
  ON public.project_collaborators FOR UPDATE
  USING (user_id = auth.uid());