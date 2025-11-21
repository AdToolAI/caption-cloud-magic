-- Enable realtime for video_templates
ALTER PUBLICATION supabase_realtime ADD TABLE video_templates;

-- Create comments table for templates
CREATE TABLE IF NOT EXISTS public.template_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.video_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  comment_text TEXT NOT NULL,
  parent_comment_id UUID REFERENCES public.template_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create activity log table
CREATE TABLE IF NOT EXISTS public.template_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.video_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  changes_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create approval workflows table
CREATE TABLE IF NOT EXISTS public.template_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.video_templates(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.video_template_versions(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL,
  approver_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comment TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

-- Create collaborative editing sessions table
CREATE TABLE IF NOT EXISTS public.template_editing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.video_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.template_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_editing_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for template_comments
CREATE POLICY "Users can view all comments"
  ON public.template_comments
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create comments"
  ON public.template_comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments"
  ON public.template_comments
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON public.template_comments
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for template_activity
CREATE POLICY "Users can view all activity"
  ON public.template_activity
  FOR SELECT
  USING (true);

CREATE POLICY "System can insert activity"
  ON public.template_activity
  FOR INSERT
  WITH CHECK (true);

-- RLS Policies for template_approvals
CREATE POLICY "Users can view all approvals"
  ON public.template_approvals
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can submit for approval"
  ON public.template_approvals
  FOR INSERT
  WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Approvers can update approvals"
  ON public.template_approvals
  FOR UPDATE
  USING (auth.uid() = approver_id);

-- RLS Policies for template_editing_sessions
CREATE POLICY "Users can view all active sessions"
  ON public.template_editing_sessions
  FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own sessions"
  ON public.template_editing_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
  ON public.template_editing_sessions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions"
  ON public.template_editing_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for collaboration tables
ALTER PUBLICATION supabase_realtime ADD TABLE template_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE template_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE template_editing_sessions;

-- Create indexes for performance
CREATE INDEX idx_template_comments_template_id ON public.template_comments(template_id);
CREATE INDEX idx_template_comments_parent_id ON public.template_comments(parent_comment_id);
CREATE INDEX idx_template_activity_template_id ON public.template_activity(template_id);
CREATE INDEX idx_template_activity_created_at ON public.template_activity(created_at DESC);
CREATE INDEX idx_template_approvals_template_id ON public.template_approvals(template_id);
CREATE INDEX idx_template_approvals_status ON public.template_approvals(status);
CREATE INDEX idx_template_editing_sessions_template_id ON public.template_editing_sessions(template_id);
CREATE INDEX idx_template_editing_sessions_active ON public.template_editing_sessions(is_active);

-- Create trigger to update updated_at on template_comments
CREATE TRIGGER update_template_comments_updated_at
  BEFORE UPDATE ON public.template_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to log template activity
CREATE OR REPLACE FUNCTION public.log_template_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.template_activity (template_id, user_id, action, changes_json)
  VALUES (
    NEW.id,
    auth.uid(),
    TG_OP,
    jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    )
  );
  RETURN NEW;
END;
$$;

-- Create trigger to log template updates
CREATE TRIGGER log_template_updates
  AFTER UPDATE ON public.video_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.log_template_activity();

-- Function to cleanup inactive editing sessions
CREATE OR REPLACE FUNCTION public.cleanup_inactive_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.template_editing_sessions
  SET is_active = false
  WHERE last_activity < now() - INTERVAL '30 minutes'
  AND is_active = true;
END;
$$;