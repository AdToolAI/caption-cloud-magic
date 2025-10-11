-- ============================================
-- Phase 1: Event Infrastructure
-- ============================================

-- Create event type enum
CREATE TYPE public.app_event_type AS ENUM (
  'caption.created',
  'caption.rewritten',
  'hook.generated',
  'reel.script.created',
  'calendar.post.scheduled',
  'calendar.post.published',
  'comment.imported',
  'comment.replied',
  'faq.updated',
  'performance.synced',
  'trend.bookmarked',
  'goal.created',
  'goal.progress.updated',
  'goal.completed',
  'brandkit.created',
  'post.generated',
  'background.generated',
  'carousel.created',
  'bio.generated',
  'audit.completed',
  'campaign.created'
);

-- Create app_events table
CREATE TABLE public.app_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type app_event_type NOT NULL,
  source TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_flags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_app_events_user_id ON public.app_events(user_id);
CREATE INDEX idx_app_events_event_type ON public.app_events(event_type);
CREATE INDEX idx_app_events_occurred_at ON public.app_events(occurred_at DESC);
CREATE UNIQUE INDEX idx_app_events_idempotency ON public.app_events(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Enable RLS
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for app_events
CREATE POLICY "Users can create own events"
  ON public.app_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own events"
  ON public.app_events FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- Phase 2: Metrics & Aggregations
-- ============================================

-- Create user_metrics_daily table
CREATE TABLE public.user_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  posts_created INTEGER NOT NULL DEFAULT 0,
  hooks_generated INTEGER NOT NULL DEFAULT 0,
  captions_rewritten INTEGER NOT NULL DEFAULT 0,
  comments_imported INTEGER NOT NULL DEFAULT 0,
  auto_replies_sent INTEGER NOT NULL DEFAULT 0,
  goals_active INTEGER NOT NULL DEFAULT 0,
  goals_completed INTEGER NOT NULL DEFAULT 0,
  avg_engagement NUMERIC(5,2),
  posts_scheduled INTEGER NOT NULL DEFAULT 0,
  posts_published INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Create index for faster queries
CREATE INDEX idx_user_metrics_daily_user_date ON public.user_metrics_daily(user_id, date DESC);

-- Enable RLS
ALTER TABLE public.user_metrics_daily ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_metrics_daily
CREATE POLICY "Users can view own metrics"
  ON public.user_metrics_daily FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own metrics"
  ON public.user_metrics_daily FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own metrics"
  ON public.user_metrics_daily FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- Helper Functions
-- ============================================

-- Function to increment daily metric
CREATE OR REPLACE FUNCTION public.increment_daily_metric(
  p_user_id UUID,
  p_date DATE,
  p_metric TEXT,
  p_amount INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Build dynamic SQL to increment the specified metric
  EXECUTE format(
    'INSERT INTO public.user_metrics_daily (user_id, date, %I)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, date)
     DO UPDATE SET %I = user_metrics_daily.%I + $3, updated_at = now()',
    p_metric, p_metric, p_metric
  ) USING p_user_id, p_date, p_amount;
END;
$$;

-- Function to update goal progress from events
CREATE OR REPLACE FUNCTION public.process_goal_progress_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal_id UUID;
  v_new_progress NUMERIC;
  v_target_value NUMERIC;
BEGIN
  -- Only process goal-related events
  IF NEW.event_type IN ('caption.created', 'post.generated', 'calendar.post.published') THEN
    
    -- Find active goals for content creation
    FOR v_goal_id, v_target_value IN
      SELECT id, target_value
      FROM public.social_goals
      WHERE user_id = NEW.user_id
        AND status = 'active'
        AND goal_type = 'content_created'
    LOOP
      -- Increment current_value
      UPDATE public.social_goals
      SET 
        current_value = current_value + 1,
        progress_percent = LEAST(((current_value + 1) / target_value) * 100, 100),
        status = CASE 
          WHEN (current_value + 1) >= target_value THEN 'completed'::goal_status
          ELSE status
        END,
        updated_at = now()
      WHERE id = v_goal_id;
      
      -- Emit progress updated event
      INSERT INTO public.app_events (user_id, event_type, source, payload_json)
      VALUES (
        NEW.user_id,
        'goal.progress.updated',
        'auto_trigger',
        jsonb_build_object('goal_id', v_goal_id, 'trigger_event', NEW.event_type)
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for goal progress
CREATE TRIGGER trigger_process_goal_progress
  AFTER INSERT ON public.app_events
  FOR EACH ROW
  EXECUTE FUNCTION public.process_goal_progress_event();

-- Function to update daily metrics from events
CREATE OR REPLACE FUNCTION public.update_metrics_from_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date DATE;
BEGIN
  v_date := DATE(NEW.occurred_at);
  
  -- Update metrics based on event type
  CASE NEW.event_type
    WHEN 'caption.created' THEN
      PERFORM public.increment_daily_metric(NEW.user_id, v_date, 'posts_created');
    WHEN 'hook.generated' THEN
      PERFORM public.increment_daily_metric(NEW.user_id, v_date, 'hooks_generated');
    WHEN 'caption.rewritten' THEN
      PERFORM public.increment_daily_metric(NEW.user_id, v_date, 'captions_rewritten');
    WHEN 'comment.imported' THEN
      PERFORM public.increment_daily_metric(NEW.user_id, v_date, 'comments_imported');
    WHEN 'comment.replied' THEN
      PERFORM public.increment_daily_metric(NEW.user_id, v_date, 'auto_replies_sent');
    WHEN 'calendar.post.scheduled' THEN
      PERFORM public.increment_daily_metric(NEW.user_id, v_date, 'posts_scheduled');
    WHEN 'calendar.post.published' THEN
      PERFORM public.increment_daily_metric(NEW.user_id, v_date, 'posts_published');
    WHEN 'goal.completed' THEN
      PERFORM public.increment_daily_metric(NEW.user_id, v_date, 'goals_completed');
    ELSE
      -- Do nothing for other event types
      NULL;
  END CASE;
  
  RETURN NEW;
END;
$$;

-- Create trigger for metrics updates
CREATE TRIGGER trigger_update_metrics_from_event
  AFTER INSERT ON public.app_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_metrics_from_event();