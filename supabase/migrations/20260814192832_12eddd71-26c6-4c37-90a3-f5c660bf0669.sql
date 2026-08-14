-- G0 — Migration 1: Audit-/Regel-/Grandfather-Tabellen + Seeds
-- Scope: ausschließlich Schema für den neuen State-Core. Keine Funktionen.

-- ============================================================
-- 1. composer_scene_transition_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.composer_scene_transition_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES public.composer_scenes(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  from_state public.composer_scene_state NOT NULL,
  to_state public.composer_scene_state NOT NULL,
  step_index integer NOT NULL,
  is_intermediate boolean NOT NULL DEFAULT true,
  guard_mode text NOT NULL,
  runless_reason text,
  run_id uuid,
  generation integer,
  write_id text NOT NULL,
  applied boolean NOT NULL,
  reason text,
  source_signature text NOT NULL,
  caller_class text NOT NULL,
  caller_role text,
  auth_uid uuid,
  detail text,
  substate text,
  error_text text,
  path public.composer_scene_state[] DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.composer_scene_transition_log TO authenticated;
GRANT ALL ON public.composer_scene_transition_log TO service_role;

ALTER TABLE public.composer_scene_transition_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own project transition logs"
  ON public.composer_scene_transition_log
  FOR SELECT TO authenticated
  USING (public.can_access_composer_project(project_id, auth.uid()));

CREATE POLICY "Service role manages transition logs"
  ON public.composer_scene_transition_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 2. composer_runless_transition_rules (v2 runless allowlist)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.composer_runless_transition_rules (
  reason text NOT NULL,
  write_id text NOT NULL,
  from_state public.composer_scene_state NOT NULL,
  to_state public.composer_scene_state NOT NULL,
  note text,
  PRIMARY KEY (reason, write_id, from_state, to_state)
);

GRANT ALL ON public.composer_runless_transition_rules TO service_role;

ALTER TABLE public.composer_runless_transition_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role only on runless rules"
  ON public.composer_runless_transition_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 3. composer_transition_grandfather (legacy wrapper runless allowlist)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.composer_transition_grandfather (
  source_signature text NOT NULL,
  write_id text NOT NULL,
  from_state public.composer_scene_state NOT NULL,
  to_state public.composer_scene_state NOT NULL,
  note text,
  PRIMARY KEY (source_signature, write_id, from_state, to_state)
);

GRANT ALL ON public.composer_transition_grandfather TO service_role;

ALTER TABLE public.composer_transition_grandfather ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role only on grandfather rules"
  ON public.composer_transition_grandfather
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 4. Seeds: v2 runless rules
-- ============================================================
-- Cancel (single scene, no active run): from any non-terminal state to canceled.
INSERT INTO public.composer_runless_transition_rules (reason, write_id, from_state, to_state, note)
SELECT
  'user_cancel_no_active_run',
  'composer-cancel-scene:cancel-no-active-run',
  fs.from_state,
  'canceled',
  'single-scene cancel without active run'
FROM public.composer_scene_transitions fs
WHERE fs.to_state = 'canceled'
  AND fs.from_state NOT IN ('complete', 'failed', 'canceled')
ON CONFLICT DO NOTHING;

-- Project teardown (no active run): from any non-terminal state to canceled.
INSERT INTO public.composer_runless_transition_rules (reason, write_id, from_state, to_state, note)
SELECT
  'project_teardown_no_active_run',
  'composer-cancel-project:teardown-no-active-run',
  fs.from_state,
  'canceled',
  'project teardown without active run'
FROM public.composer_scene_transitions fs
WHERE fs.to_state = 'canceled'
  AND fs.from_state NOT IN ('complete', 'failed', 'canceled')
ON CONFLICT DO NOTHING;

-- Image scenes without run context: direct upload paths that do not spawn a run.
INSERT INTO public.composer_runless_transition_rules (reason, write_id, from_state, to_state, note)
VALUES
  ('image_scene_no_run_context', 'image-upload:idle-to-plate-queued', 'idle', 'plate_queued', 'image upload queues plate generation'),
  ('image_scene_no_run_context', 'image-upload:plate-queued-to-ready', 'plate_queued', 'plate_ready', 'image upload resolves to ready plate')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. Seeds: legacy wrapper grandfather rules
-- ============================================================
-- Legacy 6er wrapper: allow all single-step state-machine transitions during the
-- observation window. This preserves existing callers; the table shrinks in G1-G5.
INSERT INTO public.composer_transition_grandfather (source_signature, write_id, from_state, to_state, note)
SELECT
  'legacy_6',
  'legacy_wrapper_6',
  from_state,
  to_state,
  'G0 observation-window grandfathering'
FROM public.composer_scene_transitions
ON CONFLICT DO NOTHING;

-- Legacy 7er wrapper: same broad grandfathering for the observation window.
INSERT INTO public.composer_transition_grandfather (source_signature, write_id, from_state, to_state, note)
SELECT
  'legacy_7',
  'legacy_wrapper_7',
  from_state,
  to_state,
  'G0 observation-window grandfathering'
FROM public.composer_scene_transitions
ON CONFLICT DO NOTHING;