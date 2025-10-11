-- Create content_audits table
CREATE TABLE public.content_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform VARCHAR NOT NULL,
  language VARCHAR NOT NULL DEFAULT 'en',
  source_type VARCHAR NOT NULL CHECK (source_type IN ('manual', 'upload')),
  ai_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  avg_score FLOAT,
  total_captions INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create content_audit_items table
CREATE TABLE public.content_audit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.content_audits(id) ON DELETE CASCADE,
  caption TEXT NOT NULL,
  word_count INT NOT NULL,
  reading_level VARCHAR NOT NULL,
  emotion VARCHAR NOT NULL,
  cta_strength VARCHAR NOT NULL,
  engagement_score INT NOT NULL,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_content_audits_user_id ON public.content_audits(user_id);
CREATE INDEX idx_content_audits_created_at ON public.content_audits(created_at DESC);
CREATE INDEX idx_content_audit_items_audit_id ON public.content_audit_items(audit_id);

-- Enable RLS
ALTER TABLE public.content_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_audit_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for content_audits
CREATE POLICY "Users can view own audits"
  ON public.content_audits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own audits"
  ON public.content_audits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own audits"
  ON public.content_audits FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for content_audit_items
CREATE POLICY "Users can view items from own audits"
  ON public.content_audit_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.content_audits
      WHERE content_audits.id = content_audit_items.audit_id
        AND content_audits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create items in own audits"
  ON public.content_audit_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content_audits
      WHERE content_audits.id = content_audit_items.audit_id
        AND content_audits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete items from own audits"
  ON public.content_audit_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.content_audits
      WHERE content_audits.id = content_audit_items.audit_id
        AND content_audits.user_id = auth.uid()
    )
  );

-- Insert or update feature registry entry
INSERT INTO public.feature_registry (id, category, route, plan, icon, titles_json, description_json, enabled, "order")
VALUES (
  'audit',
  'analyze',
  '/audit',
  'free',
  'SearchCheck',
  '{"en": "Content Audit Tool", "de": "Content-Audit-Tool", "es": "Herramienta de Auditoría"}'::jsonb,
  '{"en": "Analyze your captions for engagement potential", "de": "Analysieren Sie Ihre Captions auf Engagement-Potenzial", "es": "Analiza tus subtítulos para potencial de interacción"}'::jsonb,
  true,
  24
)
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  route = EXCLUDED.route,
  titles_json = EXCLUDED.titles_json,
  description_json = EXCLUDED.description_json,
  "order" = EXCLUDED."order";