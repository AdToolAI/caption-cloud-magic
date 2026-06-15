
-- 1) v126 recovery: concurrency cap back to 4
UPDATE public.system_config
SET value = '4'::jsonb, updated_at = now()
WHERE key = 'composer.sync_so_concurrency_cap';

INSERT INTO public.system_config (key, value)
SELECT 'composer.sync_so_concurrency_cap', '4'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_config WHERE key = 'composer.sync_so_concurrency_cap'
);

-- 2) Reset stuck passes on the affected scene
UPDATE public.composer_scenes
SET
  lip_sync_status = 'running',
  dialog_shots = jsonb_set(
    dialog_shots - 'error',
    '{passes}',
    COALESCE((
      SELECT jsonb_agg(
        CASE
          WHEN COALESCE(p->>'status','') = 'done' THEN p
          ELSE (
            ((((((((p
              - 'job_id')
              - 'output_url')
              - 'started_at')
              - 'finished_at')
              - 'preclip_url')
              - 'preclip_face_count')
              - 'last_error')
            ) || jsonb_build_object('status','pending')
          )
        END
        ORDER BY (p->>'idx')::int
      )
      FROM jsonb_array_elements(dialog_shots->'passes') p
    ), '[]'::jsonb)
  )
WHERE id = '9a1787ae-c83b-4fd8-af7d-de6ab2d54518';
