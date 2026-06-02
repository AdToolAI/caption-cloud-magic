-- Same recovery as previous attempt; render_id columns in video_renders
-- are text, not uuid — remove the ::uuid casts.

UPDATE public.composer_scenes
SET
  lip_sync_status = 'running',
  twoshot_stage = NULL,
  clip_error = NULL,
  lip_sync_applied_at = NULL,
  dialog_shots = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            (dialog_shots::jsonb)
              || jsonb_build_object(
                'status', 'lipsyncing',
                'refunded', false,
                'finished_at', NULL,
                'error', NULL
              ),
            '{shots,0,preclip_url}',
            (SELECT to_jsonb(video_url) FROM public.video_renders
             WHERE render_id = '19e874cb-eb98-4fc6-977f-fafac68f39ce'),
            true
          ),
          '{shots,0,preclip_status}', '"ready"'::jsonb, true
        ),
        '{shots,1,preclip_url}',
        (SELECT to_jsonb(video_url) FROM public.video_renders
         WHERE render_id = '6abc9a62-46a2-4e87-a7ae-6c2d11b8cc56'),
        true
      ),
      '{shots,2,preclip_url}',
      (SELECT to_jsonb(video_url) FROM public.video_renders
       WHERE render_id = 'aeebf60b-ef15-4ce2-b745-eca5c72293c6'),
      true
    ),
    '{shots,1,preclip_status}', '"ready"'::jsonb, true
  ),
  updated_at = now()
WHERE id = 'd47e6e3c-13ca-42b0-abd0-2f3eae919c73'::uuid;

UPDATE public.composer_scenes
SET
  dialog_shots = jsonb_set(
    dialog_shots::jsonb,
    '{shots,2}',
    (
      (dialog_shots::jsonb #> '{shots,2}')
        - 'sync_job_id'
        - 'output_url'
        - 'started_at'
        - 'completed_at'
        - 'error'
        - 'degraded'
        - 'frame_number_override'
        - 'force_coords'
        - 'temperature'
      || jsonb_build_object(
        'status', 'pending',
        'retry_count', 0,
        'preclip_status', 'ready',
        'sync_source_kind', 'preclip',
        'preclip_completed_at', to_jsonb(now())
      )
    ),
    true
  ),
  updated_at = now()
WHERE id = 'd47e6e3c-13ca-42b0-abd0-2f3eae919c73'::uuid;

UPDATE public.composer_scenes
SET
  dialog_shots = jsonb_set(
    jsonb_set(
      dialog_shots::jsonb,
      '{shots,0,sync_source_kind}', '"preclip"'::jsonb, true
    ),
    '{shots,1,sync_source_kind}', '"preclip"'::jsonb, true
  ),
  updated_at = now()
WHERE id = 'd47e6e3c-13ca-42b0-abd0-2f3eae919c73'::uuid;
