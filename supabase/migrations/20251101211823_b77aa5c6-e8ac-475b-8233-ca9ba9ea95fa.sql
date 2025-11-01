-- Phase 1: Content Planner Database Schema

-- Content Items Library (all reusable content)
CREATE TABLE IF NOT EXISTS public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image', 'video', 'text', 'draft')),
  title TEXT NOT NULL,
  caption TEXT,
  media_id UUID REFERENCES public.media_library(id) ON DELETE SET NULL,
  duration_sec INTEGER CHECK (duration_sec > 0),
  thumb_url TEXT,
  targets JSONB DEFAULT '[]'::jsonb,
  tags TEXT[],
  source TEXT CHECK (source IN ('manual', 'ai', 'campaign', 'imported')) DEFAULT 'manual',
  source_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Week Plans (2-4 week containers)
CREATE TABLE IF NOT EXISTS public.weekplans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  weeks INTEGER NOT NULL CHECK (weeks BETWEEN 1 AND 4),
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  default_platforms JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'approved', 'archived')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Schedule Blocks (individual posts in grid)
CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  weekplan_id UUID NOT NULL REFERENCES public.weekplans(id) ON DELETE CASCADE,
  content_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  
  platform TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL CHECK (end_at > start_at),
  
  title_override TEXT,
  caption_override TEXT,
  
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'approved', 'queued', 'posted', 'failed')),
  position INTEGER DEFAULT 0,
  
  meta JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Post Jobs (Quick-Poster queue)
CREATE TABLE IF NOT EXISTS public.post_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.schedule_blocks(id) ON DELETE CASCADE,
  calendar_event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  
  platform TEXT NOT NULL,
  run_at TIMESTAMPTZ NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'error')),
  error TEXT,
  posted_at TIMESTAMPTZ,
  
  content_snapshot JSONB NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_items_workspace ON public.content_items(workspace_id, type);
CREATE INDEX IF NOT EXISTS idx_content_items_source ON public.content_items(workspace_id, source, source_id);
CREATE INDEX IF NOT EXISTS idx_weekplans_workspace ON public.weekplans(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_weekplan ON public.schedule_blocks(weekplan_id, start_at);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_workspace_platform ON public.schedule_blocks(workspace_id, platform, start_at);
CREATE INDEX IF NOT EXISTS idx_post_jobs_pending ON public.post_jobs(workspace_id, status, run_at) WHERE status = 'pending';

-- RLS Policies
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekplans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_members_content_items ON public.content_items
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_members.workspace_id = content_items.workspace_id
    AND workspace_members.user_id = auth.uid()
  )
);

CREATE POLICY workspace_members_weekplans ON public.weekplans
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_members.workspace_id = weekplans.workspace_id
    AND workspace_members.user_id = auth.uid()
  )
);

CREATE POLICY workspace_members_schedule_blocks ON public.schedule_blocks
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_members.workspace_id = schedule_blocks.workspace_id
    AND workspace_members.user_id = auth.uid()
  )
);

CREATE POLICY workspace_members_post_jobs ON public.post_jobs
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_members.workspace_id = post_jobs.workspace_id
    AND workspace_members.user_id = auth.uid()
  )
);

-- Trigger: Auto-populate content_items from campaign_posts
CREATE OR REPLACE FUNCTION sync_campaign_to_content_items()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  -- Get workspace_id from campaign
  SELECT user_id INTO v_workspace_id
  FROM public.campaigns
  WHERE id = NEW.campaign_id;
  
  -- Only sync if not already linked
  IF NOT EXISTS (
    SELECT 1 FROM public.content_items
    WHERE source = 'campaign' AND source_id = NEW.id
  ) THEN
    INSERT INTO public.content_items (
      workspace_id,
      type,
      title,
      caption,
      thumb_url,
      targets,
      tags,
      source,
      source_id
    )
    VALUES (
      v_workspace_id,
      CASE
        WHEN NEW.post_type IN ('Reel', 'Story') THEN 'video'
        ELSE 'image'
      END,
      NEW.title,
      NEW.caption_outline,
      NEW.media_url,
      NEW.platforms,
      NEW.hashtags,
      'campaign',
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER sync_campaign_posts_to_library
AFTER INSERT OR UPDATE ON public.campaign_posts
FOR EACH ROW
EXECUTE FUNCTION sync_campaign_to_content_items();