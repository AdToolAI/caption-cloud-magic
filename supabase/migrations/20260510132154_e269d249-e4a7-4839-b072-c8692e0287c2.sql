-- Phase 5.6 — Composer Undo-Stack
CREATE TABLE IF NOT EXISTS public.composer_undo_stack (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  scene_id UUID,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  label TEXT,
  before_state JSONB,
  after_state JSONB,
  credits_charged NUMERIC NOT NULL DEFAULT 0,
  refundable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_composer_undo_project_created
  ON public.composer_undo_stack (project_id, created_at DESC);

ALTER TABLE public.composer_undo_stack ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view own undo entries"
  ON public.composer_undo_stack FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Owners insert own undo entries"
  ON public.composer_undo_stack FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners delete own undo entries"
  ON public.composer_undo_stack FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-prune: keep at most 10 entries per project
CREATE OR REPLACE FUNCTION public.composer_undo_prune()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.composer_undo_stack
  WHERE project_id = NEW.project_id
    AND id NOT IN (
      SELECT id FROM public.composer_undo_stack
      WHERE project_id = NEW.project_id
      ORDER BY created_at DESC
      LIMIT 10
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_composer_undo_prune ON public.composer_undo_stack;
CREATE TRIGGER trg_composer_undo_prune
AFTER INSERT ON public.composer_undo_stack
FOR EACH ROW EXECUTE FUNCTION public.composer_undo_prune();