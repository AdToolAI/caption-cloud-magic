-- AI Companion Tables for personalized assistant

-- Conversations table to store chat sessions
CREATE TABLE public.companion_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'Neue Unterhaltung',
  context_type TEXT DEFAULT 'general', -- 'general', 'onboarding', 'troubleshooting', 'feature_help'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Messages within conversations
CREATE TABLE public.companion_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.companion_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User preferences for the companion
CREATE TABLE public.companion_user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  preferred_language TEXT DEFAULT 'de',
  onboarding_completed BOOLEAN DEFAULT false,
  features_introduced JSONB DEFAULT '[]', -- Array of feature IDs already shown
  interaction_count INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  preferences JSONB DEFAULT '{}', -- Custom preferences like tone, detail level
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.companion_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for companion_conversations
CREATE POLICY "Users can view their own conversations"
ON public.companion_conversations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
ON public.companion_conversations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
ON public.companion_conversations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
ON public.companion_conversations FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for companion_messages (through conversation ownership)
CREATE POLICY "Users can view messages in their conversations"
ON public.companion_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.companion_conversations
    WHERE id = companion_messages.conversation_id
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can create messages in their conversations"
ON public.companion_messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.companion_conversations
    WHERE id = companion_messages.conversation_id
    AND user_id = auth.uid()
  )
);

-- RLS Policies for companion_user_preferences
CREATE POLICY "Users can view their own preferences"
ON public.companion_user_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own preferences"
ON public.companion_user_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.companion_user_preferences FOR UPDATE
USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_companion_conversations_user_id ON public.companion_conversations(user_id);
CREATE INDEX idx_companion_conversations_active ON public.companion_conversations(user_id, is_active);
CREATE INDEX idx_companion_messages_conversation_id ON public.companion_messages(conversation_id);
CREATE INDEX idx_companion_messages_created_at ON public.companion_messages(conversation_id, created_at);

-- Trigger for updated_at
CREATE TRIGGER update_companion_conversations_updated_at
BEFORE UPDATE ON public.companion_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_companion_preferences_updated_at
BEFORE UPDATE ON public.companion_user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();