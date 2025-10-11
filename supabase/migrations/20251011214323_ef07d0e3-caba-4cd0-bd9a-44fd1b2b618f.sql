-- Create comments table for comment management
CREATE TABLE public.comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  post_id TEXT,
  username TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  sentiment TEXT,
  sentiment_score FLOAT,
  intent TEXT,
  ai_replies JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_auto_replied BOOLEAN NOT NULL DEFAULT false,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  timestamp TIMESTAMP WITH TIME ZONE
);

-- Create comment_faqs table for recurring questions
CREATE TABLE public.comment_faqs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  frequency INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_faqs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for comments
CREATE POLICY "Users can create own comments"
ON public.comments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own comments"
ON public.comments
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
ON public.comments
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
ON public.comments
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for comment_faqs
CREATE POLICY "Users can create own FAQs"
ON public.comment_faqs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own FAQs"
ON public.comment_faqs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own FAQs"
ON public.comment_faqs
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own FAQs"
ON public.comment_faqs
FOR DELETE
USING (auth.uid() = user_id);

-- Add feature to registry
INSERT INTO public.feature_registry (id, titles_json, description_json, category, route, icon, plan, enabled, "order")
VALUES (
  'comment-manager',
  '{"en": "AI Comment Manager", "de": "KI-Kommentar-Manager", "es": "Gestor de Comentarios IA"}'::jsonb,
  '{"en": "Manage comments with AI-powered reply suggestions", "de": "Verwalten Sie Kommentare mit KI-gestützten Antwortvorschlägen", "es": "Gestiona comentarios con sugerencias de respuesta con IA"}'::jsonb,
  'optimize',
  '/comment-manager',
  'MessageCircle',
  'free',
  true,
  45
);

-- Add trigger for updated_at on comment_faqs
CREATE TRIGGER update_comment_faqs_updated_at
BEFORE UPDATE ON public.comment_faqs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();