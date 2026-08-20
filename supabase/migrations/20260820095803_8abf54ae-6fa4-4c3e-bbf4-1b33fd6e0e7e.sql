REVOKE EXECUTE ON FUNCTION public.get_ai_discount_factor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_discount_factor(uuid) TO service_role;