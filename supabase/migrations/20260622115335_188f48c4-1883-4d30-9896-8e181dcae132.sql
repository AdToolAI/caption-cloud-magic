-- Phase 2: Per-Pass-Lock for parallel dialog dispatch.
-- Drops the (scene_id)-only primary key and adds (scene_id, pass_idx) so
-- N parallel passes for the same scene can each hold their own lock.
-- pass_idx defaults to 0 → backward-compatible for legacy single-pass callers.

ALTER TABLE public.dialog_dispatch_locks
  ADD COLUMN IF NOT EXISTS pass_idx INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.dialog_dispatch_locks
  DROP CONSTRAINT IF EXISTS dialog_dispatch_locks_pkey;

ALTER TABLE public.dialog_dispatch_locks
  ADD CONSTRAINT dialog_dispatch_locks_pkey PRIMARY KEY (scene_id, pass_idx);

-- Extended try_acquire_dialog_lock with optional _pass_idx (default 0).
-- Old callsites passing only (_scene_id, _holder, _ttl_seconds) continue to
-- acquire the (scene_id, 0) slot — exact legacy semantics.
CREATE OR REPLACE FUNCTION public.try_acquire_dialog_lock(
  _scene_id uuid,
  _holder text,
  _ttl_seconds integer DEFAULT 60,
  _pass_idx integer DEFAULT 0
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _now TIMESTAMPTZ := now();
  _exp TIMESTAMPTZ := now() + make_interval(secs => _ttl_seconds);
BEGIN
  -- Best-effort cleanup of stale rows so they don't permanently block.
  DELETE FROM public.dialog_dispatch_locks WHERE expires_at < _now;

  INSERT INTO public.dialog_dispatch_locks (scene_id, pass_idx, holder, acquired_at, expires_at)
  VALUES (_scene_id, _pass_idx, _holder, _now, _exp)
  ON CONFLICT (scene_id, pass_idx) DO UPDATE
    SET holder = EXCLUDED.holder,
        acquired_at = EXCLUDED.acquired_at,
        expires_at = EXCLUDED.expires_at
    WHERE public.dialog_dispatch_locks.expires_at < _now;

  RETURN EXISTS (
    SELECT 1
    FROM public.dialog_dispatch_locks
    WHERE scene_id = _scene_id
      AND pass_idx = _pass_idx
      AND holder = _holder
      AND expires_at = _exp
  );
END;
$function$;

-- Extended release_dialog_lock with optional _pass_idx (default 0).
CREATE OR REPLACE FUNCTION public.release_dialog_lock(
  _scene_id uuid,
  _holder text,
  _pass_idx integer DEFAULT 0
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DELETE FROM public.dialog_dispatch_locks
  WHERE scene_id = _scene_id
    AND pass_idx = _pass_idx
    AND holder = _holder;
$function$;

GRANT EXECUTE ON FUNCTION public.try_acquire_dialog_lock(uuid, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_dialog_lock(uuid, text, integer) TO authenticated, service_role;