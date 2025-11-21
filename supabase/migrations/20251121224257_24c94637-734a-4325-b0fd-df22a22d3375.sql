-- Phase 27: Template Discovery Enhancement
-- Add tags, ratings, and search improvements

-- 1. Add tags column to content_templates
ALTER TABLE public.content_templates 
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- 2. Add search_vector for full-text search
ALTER TABLE public.content_templates 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 3. Create template_ratings table
CREATE TABLE IF NOT EXISTS public.template_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.content_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(template_id, user_id)
);

-- 4. Create template_views table for analytics
CREATE TABLE IF NOT EXISTS public.template_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.content_templates(id) ON DELETE CASCADE,
  user_id uuid,
  viewed_at timestamptz DEFAULT now(),
  session_id text
);

-- 5. Add computed columns to content_templates
ALTER TABLE public.content_templates 
ADD COLUMN IF NOT EXISTS average_rating numeric(3,2),
ADD COLUMN IF NOT EXISTS total_ratings integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;

-- 6. Create function to update search vector
CREATE OR REPLACE FUNCTION public.update_template_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger for search vector updates
DROP TRIGGER IF EXISTS update_content_templates_search_vector ON public.content_templates;
CREATE TRIGGER update_content_templates_search_vector
  BEFORE INSERT OR UPDATE OF name, description, tags, category
  ON public.content_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_template_search_vector();

-- 8. Create function to update template rating stats
CREATE OR REPLACE FUNCTION public.update_template_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.content_templates
  SET 
    average_rating = (
      SELECT AVG(rating)::numeric(3,2)
      FROM public.template_ratings
      WHERE template_id = COALESCE(NEW.template_id, OLD.template_id)
    ),
    total_ratings = (
      SELECT COUNT(*)
      FROM public.template_ratings
      WHERE template_id = COALESCE(NEW.template_id, OLD.template_id)
    )
  WHERE id = COALESCE(NEW.template_id, OLD.template_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 9. Create trigger for rating stats updates
DROP TRIGGER IF EXISTS update_template_rating_stats_trigger ON public.template_ratings;
CREATE TRIGGER update_template_rating_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.template_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_template_rating_stats();

-- 10. Create index for full-text search
CREATE INDEX IF NOT EXISTS idx_content_templates_search_vector 
  ON public.content_templates USING gin(search_vector);

-- 11. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_content_templates_tags 
  ON public.content_templates USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_content_templates_average_rating 
  ON public.content_templates(average_rating DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_template_ratings_template_id 
  ON public.template_ratings(template_id);

CREATE INDEX IF NOT EXISTS idx_template_views_template_id 
  ON public.template_views(template_id);

-- 12. Enable RLS on new tables
ALTER TABLE public.template_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_views ENABLE ROW LEVEL SECURITY;

-- 13. RLS Policies for template_ratings
CREATE POLICY "Anyone can view ratings"
  ON public.template_ratings FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own ratings"
  ON public.template_ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ratings"
  ON public.template_ratings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ratings"
  ON public.template_ratings FOR DELETE
  USING (auth.uid() = user_id);

-- 14. RLS Policies for template_views
CREATE POLICY "Anyone can view template views"
  ON public.template_views FOR SELECT
  USING (true);

CREATE POLICY "Anyone can record views"
  ON public.template_views FOR INSERT
  WITH CHECK (true);

-- 15. Update existing templates' search vectors
UPDATE public.content_templates
SET search_vector = 
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(category, '')), 'D')
WHERE search_vector IS NULL;