-- v154 cleanup (round 2): use mean-center-y >= 0.45 * height, matching the
-- live sanity gate "cluster_below_upper_third" rule.

UPDATE public.plate_face_cache
SET expires_at = now() - interval '1 second'
WHERE expires_at > now()
  AND (
    SELECT AVG((f->'center'->>1)::numeric)
    FROM jsonb_array_elements(faces) f
  ) / GREATEST(height, 1) >= 0.45;

UPDATE public.composer_scenes
SET dialog_shots = dialog_shots - 'plate_identity'
WHERE dialog_shots ? 'plate_identity'
  AND jsonb_typeof(dialog_shots->'plate_identity'->'bboxes') = 'array'
  AND (
    SELECT AVG(((b->>1)::numeric + (b->>3)::numeric) / 2)
    FROM jsonb_array_elements(dialog_shots->'plate_identity'->'bboxes') b
  ) / GREATEST(COALESCE((dialog_shots->'plate_identity'->'dims'->>'height')::numeric, 720), 1) >= 0.45;