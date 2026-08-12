CREATE TABLE IF NOT EXISTS public.composer_continuity_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  scene_id uuid NOT NULL REFERENCES public.composer_scenes(id) ON DELETE CASCADE,
  predecessor_scene_id uuid NOT NULL REFERENCES public.composer_scenes(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  dispatched_at timestamptz
);

GRANT SELECT ON public.composer_continuity_queue TO authenticated;
GRANT ALL ON public.composer_continuity_queue TO service_role;

ALTER TABLE public.composer_continuity_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own continuity queue"
ON public.composer_continuity_queue
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS composer_continuity_queue_pending_scene_idx
  ON public.composer_continuity_queue (scene_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS composer_continuity_queue_predecessor_idx
  ON public.composer_continuity_queue (predecessor_scene_id, status);