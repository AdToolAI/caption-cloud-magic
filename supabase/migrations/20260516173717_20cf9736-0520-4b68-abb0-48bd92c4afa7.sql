-- Fix workspace membership check to use the correct table
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE user_id = _user_id
      AND workspace_id = _workspace_id
  )
$function$;

-- Tighten template_approvals SELECT policy
DROP POLICY IF EXISTS "Users can view all approvals" ON public.template_approvals;

CREATE POLICY "Users can view relevant approvals"
ON public.template_approvals
FOR SELECT
TO authenticated
USING (
  auth.uid() = submitted_by
  OR auth.uid() = approver_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
);