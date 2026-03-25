
-- 1. Direct Messages table
CREATE TABLE public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own DMs"
  ON public.direct_messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send DMs"
  ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Sender can delete own DMs"
  ON public.direct_messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

CREATE INDEX idx_direct_messages_sender ON public.direct_messages(sender_id);
CREATE INDEX idx_direct_messages_receiver ON public.direct_messages(receiver_id);
CREATE INDEX idx_direct_messages_created ON public.direct_messages(created_at DESC);

-- Enable realtime for direct_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;

-- 2. Platform Announcements table
CREATE TABLE public.platform_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read announcements"
  ON public.platform_announcements FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Only admins can create announcements"
  ON public.platform_announcements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update announcements"
  ON public.platform_announcements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete announcements"
  ON public.platform_announcements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_platform_announcements_created ON public.platform_announcements(created_at DESC);

-- 3. Collaboration Posts table
CREATE TABLE public.collaboration_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  skills_needed TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.collaboration_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read collab posts"
  ON public.collaboration_posts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can create own collab posts"
  ON public.collaboration_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own collab posts"
  ON public.collaboration_posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own collab posts"
  ON public.collaboration_posts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_collaboration_posts_user ON public.collaboration_posts(user_id);
CREATE INDEX idx_collaboration_posts_status ON public.collaboration_posts(status);
CREATE INDEX idx_collaboration_posts_created ON public.collaboration_posts(created_at DESC);
