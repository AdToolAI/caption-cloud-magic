-- v154 cleanup: evict torso-bbox cache rows + persisted plate identity for
-- scenes that hit the v153.x detector bug (any face center_y > 0.55 of plate height).

-- 1) Evict matching plate_face_cache rows.
UPDATE public.plate_face_cache
SET expires_at = now() - interval '1 second'
WHERE expires_at > now()
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(faces) f
    WHERE (f->'center'->>1)::numeric > 0.55 * GREATEST(height, 1)
  );

-- 2) Strip plate_identity.bboxes from composer_scenes where the cached bboxes
--    are torso-sized. Forces compose-dialog-segments to re-detect via the
--    v154 sanity gate on the next "Sauber neu starten".
UPDATE public.composer_scenes
SET dialog_shots = dialog_shots - 'plate_identity'
WHERE dialog_shots ? 'plate_identity'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(dialog_shots->'plate_identity'->'bboxes') b,
         LATERAL (
           SELECT (b->>1)::numeric AS y1, (b->>3)::numeric AS y2
         ) coords
    WHERE coords.y1 IS NOT NULL
      AND coords.y2 IS NOT NULL
      AND ((coords.y1 + coords.y2) / 2) > 0.55
          * GREATEST(COALESCE((dialog_shots->'plate_identity'->'dims'->>'height')::numeric, 720), 1)
  );