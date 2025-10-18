-- Allow service role to manage social connections on behalf of users
CREATE POLICY "Service role can manage connections"
ON public.social_connections
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);