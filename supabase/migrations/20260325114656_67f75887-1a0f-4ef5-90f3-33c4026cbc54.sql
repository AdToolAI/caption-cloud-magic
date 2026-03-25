
-- Community Channels
CREATE TABLE public.community_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  topic TEXT NOT NULL,
  allowed_user_ids UUID[] NOT NULL DEFAULT '{}',
  moderation_rules JSONB NOT NULL DEFAULT '{"max_length": 2000, "blocked_words": [], "require_tags": false, "auto_approve": true, "ai_check": false}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Community Messages
CREATE TABLE public.community_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.community_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_spotlight BOOLEAN NOT NULL DEFAULT false,
  moderated_at TIMESTAMPTZ,
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Community Message Tags (normalized)
CREATE TABLE public.community_message_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tag)
);

-- Mentor Slots
CREATE TABLE public.mentor_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.community_channels(id) ON DELETE SET NULL,
  slot_time TIMESTAMPTZ NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  booked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spotlight Rotation
CREATE TABLE public.spotlight_rotation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.community_channels(id) ON DELETE CASCADE,
  current_post_id UUID REFERENCES public.community_messages(id) ON DELETE SET NULL,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotation_interval_days INTEGER NOT NULL DEFAULT 7,
  UNIQUE(channel_id)
);

-- Community Audit Log (GDPR-compliant)
CREATE TABLE public.community_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_community_messages_channel ON public.community_messages(channel_id, created_at DESC);
CREATE INDEX idx_community_messages_tags ON public.community_messages USING GIN(tags);
CREATE INDEX idx_community_messages_spotlight ON public.community_messages(is_spotlight) WHERE is_spotlight = true;
CREATE INDEX idx_mentor_slots_status ON public.mentor_slots(status, slot_time);
CREATE INDEX idx_community_audit_user ON public.community_audit_log(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.community_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_message_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spotlight_rotation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: community_channels - authenticated can read
CREATE POLICY "Authenticated users can read channels" ON public.community_channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Channel creators can manage" ON public.community_channels FOR ALL TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- RLS: community_messages - read if authenticated, insert only if allowed
CREATE POLICY "Authenticated users can read messages" ON public.community_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allowed users can post messages" ON public.community_messages FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.community_channels
    WHERE id = channel_id AND auth.uid() = ANY(allowed_user_ids)
  )
);
CREATE POLICY "Users can delete own messages" ON public.community_messages FOR DELETE TO authenticated USING (user_id = auth.uid());

-- RLS: community_message_tags - everyone reads
CREATE POLICY "Anyone can read tags" ON public.community_message_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tags" ON public.community_message_tags FOR INSERT TO authenticated WITH CHECK (true);

-- RLS: mentor_slots
CREATE POLICY "Authenticated can read slots" ON public.mentor_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mentors can create slots" ON public.mentor_slots FOR INSERT TO authenticated WITH CHECK (mentor_user_id = auth.uid());
CREATE POLICY "Mentors can update own slots" ON public.mentor_slots FOR UPDATE TO authenticated USING (mentor_user_id = auth.uid());
CREATE POLICY "Users can book slots" ON public.mentor_slots FOR UPDATE TO authenticated USING (
  status = 'open' AND mentor_user_id != auth.uid()
);

-- RLS: spotlight_rotation
CREATE POLICY "Authenticated can read spotlight" ON public.spotlight_rotation FOR SELECT TO authenticated USING (true);

-- RLS: community_audit_log - users read own entries
CREATE POLICY "Users can read own audit log" ON public.community_audit_log FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mentor_slots;
