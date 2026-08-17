REVOKE EXECUTE ON FUNCTION public.composer_refund_charge(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.composer_refund_charge(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.composer_refund_charge(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_refund_charge(uuid, uuid, text) TO service_role;