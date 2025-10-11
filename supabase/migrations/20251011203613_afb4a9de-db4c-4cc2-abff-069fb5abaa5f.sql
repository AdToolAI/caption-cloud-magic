-- Create coach_sessions table
CREATE TABLE public.coach_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'en',
  mode TEXT NOT NULL DEFAULT 'free' CHECK (mode IN ('free', 'pro')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coach_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for coach_sessions
CREATE POLICY "Users can view own coach sessions"
  ON public.coach_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own coach sessions"
  ON public.coach_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own coach sessions"
  ON public.coach_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create coach_messages table
CREATE TABLE public.coach_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.coach_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for coach_messages
CREATE POLICY "Users can view messages from own sessions"
  ON public.coach_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_sessions
      WHERE coach_sessions.id = coach_messages.session_id
      AND coach_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in own sessions"
  ON public.coach_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.coach_sessions
      WHERE coach_sessions.id = coach_messages.session_id
      AND coach_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete messages from own sessions"
  ON public.coach_messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_sessions
      WHERE coach_sessions.id = coach_messages.session_id
      AND coach_sessions.user_id = auth.uid()
    )
  );

-- Create index for faster session lookups
CREATE INDEX idx_coach_messages_session_id ON public.coach_messages(session_id);
CREATE INDEX idx_coach_sessions_user_id ON public.coach_sessions(user_id);

-- Add to feature registry
INSERT INTO feature_registry (id, category, route, titles_json, description_json, icon, plan, enabled, "order")
VALUES 
  ('coach', 'optimize', '/coach',
   '{"en": "AI Content Coach", "de": "KI-Content-Coach", "es": "Entrenador de Contenido IA"}',
   '{"en": "Get personalized strategy advice from your AI mentor", "de": "Erhalte personalisierte Strategieberatung von deinem KI-Mentor", "es": "Obtén consejos de estrategia personalizados de tu mentor de IA"}',
   'MessageSquareCode', 'free', true, 15)
ON CONFLICT (id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  "order" = EXCLUDED."order";