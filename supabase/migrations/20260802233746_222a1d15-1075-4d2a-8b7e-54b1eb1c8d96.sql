UPDATE public.composer_scenes
SET clip_url = 'https://s3.eu-central-1.amazonaws.com/remotionlambda-eucentral1-6ul51trd3p/renders/c6o5wgd2ds/dialog-stitch-muxed-d7402a67-d10d-493d-8fe5-aefb91b6ccc9-1785713334095.mp4',
    clip_status = 'ready',
    lip_sync_source_clip_url = coalesce(dialog_shots->>'source_clip_url', lip_sync_source_clip_url),
    lip_sync_applied_at = coalesce(lip_sync_applied_at, now()),
    lip_sync_status = 'done',
    twoshot_stage = 'done',
    clip_error = NULL,
    dialog_shots = coalesce(dialog_shots, '{}'::jsonb)
      || jsonb_build_object(
           'status', 'done',
           'final_url', 'https://s3.eu-central-1.amazonaws.com/remotionlambda-eucentral1-6ul51trd3p/renders/c6o5wgd2ds/dialog-stitch-muxed-d7402a67-d10d-493d-8fe5-aefb91b6ccc9-1785713334095.mp4',
           'finished_at', now(),
           'error', NULL
         ),
    pipeline_detail = 'recovered_completed_dialog_stitch_after_guard_fix',
    updated_at = now()
WHERE id = 'd7402a67-d10d-493d-8fe5-aefb91b6ccc9'
  AND EXISTS (
    SELECT 1
    FROM public.video_renders vr
    WHERE vr.render_id = '98110c65-faad-437f-b37d-c74effa074b8'
      AND vr.status = 'completed'
      AND vr.video_url IS NOT NULL
  );