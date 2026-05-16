-- Restrict community_messages SELECT to channel members only
DROP POLICY IF EXISTS "Authenticated users can read messages" ON public.community_messages;

CREATE POLICY "Channel members can read messages"
ON public.community_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.community_channels c
    WHERE c.id = community_messages.channel_id
      AND auth.uid() = ANY (c.allowed_user_ids)
  )
);

-- Remove permissive token-based UPDATE policy on calendar_approvals.
-- Token-based approve/reject must go through edge functions (calendar-approve-stage,
-- calendar-reject-approval) which use the service role and verify the approver.
DROP POLICY IF EXISTS "Public can update with valid token" ON public.calendar_approvals;