
CREATE TABLE IF NOT EXISTS public.companion_triggers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_key TEXT NOT NULL,
  category TEXT NOT NULL,
  shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, trigger_key, shown_at)
);

CREATE INDEX IF NOT EXISTS idx_companion_triggers_user_key
  ON public.companion_triggers (user_id, trigger_key, shown_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.companion_triggers TO authenticated;
GRANT ALL ON public.companion_triggers TO service_role;

ALTER TABLE public.companion_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own companion triggers"
  ON public.companion_triggers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
