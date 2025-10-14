-- Allow service role to manage calendar integrations (needed for OAuth callbacks)
CREATE POLICY "Service role can manage integrations"
ON public.calendar_integrations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);