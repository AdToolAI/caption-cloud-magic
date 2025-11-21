-- Fix search_path for increment_template_usage function
CREATE OR REPLACE FUNCTION increment_template_usage(template_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.video_templates
  SET usage_count = COALESCE(usage_count, 0) + 1
  WHERE id = template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';