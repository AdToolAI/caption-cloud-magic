-- Create feature registry table
CREATE TABLE public.feature_registry (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('create', 'optimize', 'analyze')),
  route TEXT NOT NULL UNIQUE,
  titles_json JSONB NOT NULL,
  icon TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('free', 'pro')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL,
  description_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.feature_registry ENABLE ROW LEVEL SECURITY;

-- Everyone can view enabled features
CREATE POLICY "Anyone can view enabled features"
ON public.feature_registry
FOR SELECT
USING (enabled = true OR auth.uid() IS NOT NULL);

-- Only admins can modify (we'll need an admin check later)
CREATE POLICY "Authenticated users can view all features"
ON public.feature_registry
FOR SELECT
TO authenticated
USING (true);

-- Seed existing features
INSERT INTO public.feature_registry (id, category, route, titles_json, icon, plan, enabled, "order", description_json) VALUES
  ('generator', 'create', '/generator', '{"en":"Generator","de":"Generator","es":"Generador"}', 'Sparkles', 'free', true, 10, '{"en":"Create engaging captions with AI","de":"Erstelle ansprechende Bildunterschriften mit KI","es":"Crea subtítulos atractivos con IA"}'),
  ('wizard', 'create', '/prompt-wizard', '{"en":"Prompt Wizard","de":"Prompt-Assistent","es":"Asistente de Prompts"}', 'Wand2', 'free', true, 20, '{"en":"Craft optimized prompts for better results","de":"Erstelle optimierte Prompts für bessere Ergebnisse","es":"Crea prompts optimizados para mejores resultados"}'),
  ('hooks', 'create', '/hook-generator', '{"en":"Hook Generator","de":"Hook-Generator","es":"Generador de Ganchos"}', 'Zap', 'free', true, 30, '{"en":"Generate attention-grabbing hooks","de":"Generiere aufmerksamkeitsstarke Hooks","es":"Genera ganchos que capten la atención"}'),
  ('rewriter', 'optimize', '/rewriter', '{"en":"Caption Rewriter","de":"Caption-Umschreiber","es":"Reescritor de Subtítulos"}', 'RefreshCw', 'free', true, 10, '{"en":"Refine and improve your captions","de":"Verfeinere und verbessere deine Bildunterschriften","es":"Refina y mejora tus subtítulos"}'),
  ('advisor', 'optimize', '/post-time-advisor', '{"en":"Time-to-Post Advisor","de":"Posting-Zeit-Berater","es":"Asesor de Horario de Publicación"}', 'Clock', 'free', true, 20, '{"en":"Find the best time to post","de":"Finde die beste Zeit zum Posten","es":"Encuentra el mejor momento para publicar"}'),
  ('performance', 'analyze', '/performance', '{"en":"Performance Tracker","de":"Leistungs-Tracker","es":"Seguimiento de Rendimiento"}', 'BarChart3', 'pro', true, 10, '{"en":"Track and analyze your post performance","de":"Verfolge und analysiere deine Post-Performance","es":"Rastrea y analiza el rendimiento de tus publicaciones"}'),
  ('goals', 'analyze', '/goals', '{"en":"Goals Dashboard","de":"Ziele-Dashboard","es":"Panel de Objetivos"}', 'Target', 'free', true, 20, '{"en":"Set and track your social media goals","de":"Setze und verfolge deine Social-Media-Ziele","es":"Establece y rastrea tus objetivos de redes sociales"}');

-- Seed placeholder features (disabled)
INSERT INTO public.feature_registry (id, category, route, titles_json, icon, plan, enabled, "order", description_json) VALUES
  ('image_generator', 'create', '/image-generator', '{"en":"Image Generator","de":"Bild-Generator","es":"Generador de Imágenes"}', 'Image', 'pro', false, 40, '{"en":"Coming soon: Generate AI images","de":"Demnächst: KI-Bilder generieren","es":"Próximamente: Generar imágenes con IA"}'),
  ('carousel_builder', 'create', '/carousel-builder', '{"en":"Carousel Builder","de":"Karussell-Builder","es":"Constructor de Carrusel"}', 'Layers', 'pro', false, 50, '{"en":"Coming soon: Build engaging carousels","de":"Demnächst: Erstelle ansprechende Karussells","es":"Próximamente: Crea carruseles atractivos"}'),
  ('hashtag_manager', 'optimize', '/hashtag-manager', '{"en":"Hashtag Manager","de":"Hashtag-Manager","es":"Gestor de Hashtags"}', 'Hash', 'free', false, 30, '{"en":"Coming soon: Manage your hashtag strategy","de":"Demnächst: Verwalte deine Hashtag-Strategie","es":"Próximamente: Gestiona tu estrategia de hashtags"}'),
  ('bio_optimizer', 'optimize', '/bio-optimizer', '{"en":"Bio Optimizer","de":"Bio-Optimierer","es":"Optimizador de Biografía"}', 'UserCheck', 'pro', false, 40, '{"en":"Coming soon: Optimize your social bios","de":"Demnächst: Optimiere deine Social Bios","es":"Próximamente: Optimiza tus biografías sociales"}'),
  ('campaign_reports', 'analyze', '/campaign-reports', '{"en":"Campaign Reports","de":"Kampagnen-Berichte","es":"Informes de Campañas"}', 'FileText', 'pro', false, 30, '{"en":"Coming soon: Export detailed reports","de":"Demnächst: Exportiere detaillierte Berichte","es":"Próximamente: Exporta informes detallados"}');

-- Add trigger for updated_at
CREATE TRIGGER update_feature_registry_updated_at
  BEFORE UPDATE ON public.feature_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();