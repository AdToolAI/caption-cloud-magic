
-- promo_codes: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Anyone can view active promo codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Public can view active promo codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Active promo codes are viewable" ON public.promo_codes;

CREATE POLICY "Authenticated users can view active promo codes"
ON public.promo_codes
FOR SELECT
TO authenticated
USING (active = true);

-- template_activity: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Users can view all activity" ON public.template_activity;

CREATE POLICY "Authenticated users can view template activity"
ON public.template_activity
FOR SELECT
TO authenticated
USING (true);
