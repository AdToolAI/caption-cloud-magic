
-- 1) Clear legacy dialog-srs marker from real cinematic-sync MAIN scenes.
--    These are not sub-scenes; the marker only existed because of an older
--    code path and was the trigger for the destructive cleanup.
UPDATE public.composer_scenes
SET cinematic_preset_slug = NULL,
    updated_at = now()
WHERE engine_override = 'cinematic-sync'
  AND cinematic_preset_slug LIKE 'dialog-srs:%';

-- 2) Close order_index gaps per project without touching scene contents.
--    Two-phase write to honour the UNIQUE(project_id, order_index) constraint.
DO $$
DECLARE
  r record;
  new_idx int;
  has_gap boolean;
BEGIN
  FOR r IN
    SELECT project_id
    FROM public.composer_scenes
    GROUP BY project_id
  LOOP
    SELECT (MAX(order_index) - MIN(order_index) + 1) <> COUNT(*)
    INTO has_gap
    FROM public.composer_scenes
    WHERE project_id = r.project_id;

    IF has_gap THEN
      -- Phase A: park every scene of this project at a unique negative slot.
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn
        FROM public.composer_scenes
        WHERE project_id = r.project_id
      )
      UPDATE public.composer_scenes cs
      SET order_index = -ordered.rn,
          updated_at = now()
      FROM ordered
      WHERE cs.id = ordered.id;

      -- Phase B: assign final 0..N-1 indexes in the same logical order.
      WITH ordered AS (
        SELECT id, (ROW_NUMBER() OVER (ORDER BY order_index DESC)) - 1 AS rn
        FROM public.composer_scenes
        WHERE project_id = r.project_id
      )
      UPDATE public.composer_scenes cs
      SET order_index = ordered.rn,
          updated_at = now()
      FROM ordered
      WHERE cs.id = ordered.id;
    END IF;
  END LOOP;
END $$;
