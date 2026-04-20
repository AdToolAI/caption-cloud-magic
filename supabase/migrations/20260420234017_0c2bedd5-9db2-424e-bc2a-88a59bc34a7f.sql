-- Ensure initialize_storage_quota trigger exists on profiles INSERT
DROP TRIGGER IF EXISTS trg_initialize_storage_quota ON public.profiles;
CREATE TRIGGER trg_initialize_storage_quota
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_storage_quota();