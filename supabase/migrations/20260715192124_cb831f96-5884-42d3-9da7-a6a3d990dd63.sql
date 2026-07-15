-- Fix 1: Privilege escalation in wallets — only service_role can insert wallets
DROP POLICY IF EXISTS "Users can insert their own wallet" ON public.wallets;

-- Fix 2: mentor_slots — hide booker identity from non-participants
DROP POLICY IF EXISTS "Authenticated can read slots" ON public.mentor_slots;

CREATE POLICY "Anyone authenticated can see open slots"
ON public.mentor_slots FOR SELECT
TO authenticated
USING (
  status = 'open'
  OR mentor_user_id = auth.uid()
  OR booked_by = auth.uid()
);