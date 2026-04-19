CREATE OR REPLACE FUNCTION public.admin_force_delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_result jsonb;
  v_context text;
BEGIN
  BEGIN
    DELETE FROM auth.users WHERE id = p_user_id;
    v_result := jsonb_build_object('success', true, 'deleted_user_id', p_user_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_context = PG_EXCEPTION_CONTEXT;
    v_result := jsonb_build_object(
      'success', false,
      'sqlerrm', SQLERRM,
      'sqlstate', SQLSTATE,
      'context', v_context
    );
  END;
  RETURN v_result;
END;
$$;