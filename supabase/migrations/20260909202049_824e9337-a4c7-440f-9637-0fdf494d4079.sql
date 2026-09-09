ALTER TABLE public.brand_kits
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_brand_kits_updated_at ON public.brand_kits;
CREATE TRIGGER update_brand_kits_updated_at
BEFORE UPDATE ON public.brand_kits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();