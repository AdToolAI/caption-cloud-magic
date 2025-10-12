-- Drop existing tables if they exist (in correct order due to dependencies)
DROP TABLE IF EXISTS public.replies CASCADE;
DROP TABLE IF EXISTS public.imports CASCADE;
DROP TABLE IF EXISTS public.comment_analysis CASCADE;
DROP TABLE IF EXISTS public.comments CASCADE;
DROP TABLE IF EXISTS public.comment_sources CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;

-- Drop function if exists
DROP FUNCTION IF EXISTS public.user_owns_comment(UUID);
DROP FUNCTION IF EXISTS public.update_projects_updated_at();

-- Create projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create comment_sources table (platforms/accounts)
CREATE TABLE public.comment_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_handle TEXT,
  external_account_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create comments table (persistent)
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.comment_sources(id) ON DELETE SET NULL,
  external_comment_id TEXT,
  username TEXT NOT NULL,
  user_id_external TEXT,
  text TEXT NOT NULL CHECK (length(text) >= 3 AND length(text) <= 10000),
  language TEXT,
  created_at_platform TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fingerprint TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replied', 'ignored', 'flagged')),
  labels TEXT[] DEFAULT '{}'
);

-- Create comment_analysis table (1:1 with comments)
CREATE TABLE public.comment_analysis (
  comment_id UUID PRIMARY KEY REFERENCES public.comments(id) ON DELETE CASCADE,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  intent TEXT CHECK (intent IN ('praise', 'complaint', 'question', 'feature_request', 'bug_report', 'spam', 'sales_lead', 'other')),
  topics TEXT[] DEFAULT '{}',
  toxicity TEXT CHECK (toxicity IN ('none', 'mild', 'severe')),
  urgency TEXT CHECK (urgency IN ('low', 'medium', 'high')),
  priority_score INT CHECK (priority_score >= 0 AND priority_score <= 100),
  action TEXT,
  reply_suggestions JSONB DEFAULT '[]',
  analysis_version INT DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create replies table (optional tracking)
CREATE TABLE public.replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  reply_text TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create imports table (audit log)
CREATE TABLE public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.comment_sources(id) ON DELETE SET NULL,
  count_total INT NOT NULL DEFAULT 0,
  count_inserted INT NOT NULL DEFAULT 0,
  count_skipped INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indices for performance
CREATE INDEX idx_comments_project_created ON public.comments(project_id, created_at_platform DESC);
CREATE INDEX idx_comments_project_status ON public.comments(project_id, status);
CREATE INDEX idx_comments_fingerprint ON public.comments(fingerprint);
CREATE INDEX idx_comment_analysis_sentiment ON public.comment_analysis(sentiment);
CREATE INDEX idx_comment_analysis_intent ON public.comment_analysis(intent);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for comment_sources
CREATE POLICY "Users can view sources in own projects" ON public.comment_sources FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = comment_sources.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can create sources in own projects" ON public.comment_sources FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = comment_sources.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can update sources in own projects" ON public.comment_sources FOR UPDATE 
USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = comment_sources.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can delete sources in own projects" ON public.comment_sources FOR DELETE 
USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = comment_sources.project_id AND projects.user_id = auth.uid()));

-- RLS Policies for comments
CREATE POLICY "Users can view comments in own projects" ON public.comments FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = comments.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can create comments in own projects" ON public.comments FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = comments.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can update comments in own projects" ON public.comments FOR UPDATE 
USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = comments.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can delete comments in own projects" ON public.comments FOR DELETE 
USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = comments.project_id AND projects.user_id = auth.uid()));

-- Security definer function to check if user owns the comment
CREATE OR REPLACE FUNCTION public.user_owns_comment(_comment_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.comments 
    JOIN public.projects ON projects.id = comments.project_id 
    WHERE comments.id = _comment_id 
    AND projects.user_id = auth.uid()
  )
$$;

-- RLS Policies for comment_analysis using security definer function
CREATE POLICY "Users can view analysis in own projects" ON public.comment_analysis FOR SELECT 
USING (public.user_owns_comment(comment_id));
CREATE POLICY "Users can create analysis in own projects" ON public.comment_analysis FOR INSERT 
WITH CHECK (public.user_owns_comment(comment_id));
CREATE POLICY "Users can update analysis in own projects" ON public.comment_analysis FOR UPDATE 
USING (public.user_owns_comment(comment_id));
CREATE POLICY "Users can delete analysis in own projects" ON public.comment_analysis FOR DELETE 
USING (public.user_owns_comment(comment_id));

-- RLS Policies for replies
CREATE POLICY "Users can view replies in own projects" ON public.replies FOR SELECT 
USING (public.user_owns_comment(comment_id));
CREATE POLICY "Users can create replies in own projects" ON public.replies FOR INSERT 
WITH CHECK (public.user_owns_comment(comment_id));

-- RLS Policies for imports
CREATE POLICY "Users can view imports in own projects" ON public.imports FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = imports.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can create imports in own projects" ON public.imports FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = imports.project_id AND projects.user_id = auth.uid()));

-- Trigger to update updated_at on projects
CREATE OR REPLACE FUNCTION public.update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.update_projects_updated_at();