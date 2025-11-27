-- Fix search_path for the new function
CREATE OR REPLACE FUNCTION public.update_director_cut_renders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;