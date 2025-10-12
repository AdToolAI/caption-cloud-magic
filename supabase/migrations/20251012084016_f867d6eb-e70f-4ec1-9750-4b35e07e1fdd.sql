-- Create recurring_posts table for scheduled recurring content
CREATE TABLE IF NOT EXISTS public.recurring_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  caption TEXT NOT NULL,
  platform TEXT NOT NULL,
  frequency TEXT NOT NULL,
  next_scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
  last_posted_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_publish BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create report_templates table for custom report configurations
CREATE TABLE IF NOT EXISTS public.report_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  date_range TEXT NOT NULL DEFAULT '30days',
  platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
  include_logo BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create scheduled_reports table for automatic report delivery
CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.report_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL,
  recipients_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_send_date TIMESTAMP WITH TIME ZONE NOT NULL,
  last_sent_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
DO $$ BEGIN
  ALTER TABLE public.recurring_posts ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- RLS Policies for recurring_posts
DO $$ BEGIN
  CREATE POLICY "Users can view own recurring posts"
    ON public.recurring_posts FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own recurring posts"
    ON public.recurring_posts FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own recurring posts"
    ON public.recurring_posts FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own recurring posts"
    ON public.recurring_posts FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- RLS Policies for report_templates
DO $$ BEGIN
  CREATE POLICY "Users can view own report templates"
    ON public.report_templates FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own report templates"
    ON public.report_templates FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own report templates"
    ON public.report_templates FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own report templates"
    ON public.report_templates FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- RLS Policies for scheduled_reports
DO $$ BEGIN
  CREATE POLICY "Users can view own scheduled reports"
    ON public.scheduled_reports FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own scheduled reports"
    ON public.scheduled_reports FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own scheduled reports"
    ON public.scheduled_reports FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own scheduled reports"
    ON public.scheduled_reports FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Create triggers for updated_at
DO $$ BEGIN
  CREATE TRIGGER update_recurring_posts_updated_at
    BEFORE UPDATE ON public.recurring_posts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_report_templates_updated_at
    BEFORE UPDATE ON public.report_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_scheduled_reports_updated_at
    BEFORE UPDATE ON public.scheduled_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;