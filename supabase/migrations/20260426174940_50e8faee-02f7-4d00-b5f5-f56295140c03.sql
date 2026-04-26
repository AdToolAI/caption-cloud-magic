
-- Block S: Brand Memory — Auto-apply user's active brand kit on new composer projects

CREATE OR REPLACE FUNCTION public.set_default_brand_kit_on_composer_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_kit_id uuid;
BEGIN
  -- Only auto-apply if user did not explicitly pick one
  IF NEW.brand_kit_id IS NULL THEN
    SELECT id INTO v_active_kit_id
    FROM public.brand_kits
    WHERE user_id = NEW.user_id
      AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_active_kit_id IS NOT NULL THEN
      NEW.brand_kit_id := v_active_kit_id;
      -- Default auto-sync ON when brand was auto-applied
      NEW.brand_kit_auto_sync := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_composer_projects_default_brand_kit ON public.composer_projects;
CREATE TRIGGER trg_composer_projects_default_brand_kit
  BEFORE INSERT ON public.composer_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_default_brand_kit_on_composer_project();
