UPDATE composer_scenes
SET clip_status = 'pending',
    clip_error = NULL,
    audio_plan = jsonb_set(
      coalesce(audio_plan, '{}'::jsonb),
      '{twoshot,anchor_identity}',
      coalesce(audio_plan->'twoshot'->'anchor_identity', '{}'::jsonb)
        || jsonb_build_object(
             'assignmentLock', jsonb_build_object('0','483f9cdc-eb31-4486-bf67-9c5e7d955016','1','54d90504-7253-482f-9c6f-1902e8a6749b'),
             'assignmentLockSource','v326_geometry_rowmajor',
             'status','geometry',
             'resolvedCount', 2
           ),
      true
    ),
    dialog_shots = jsonb_set(
      coalesce(dialog_shots, '{}'::jsonb),
      '{plate_identity}',
      coalesce(dialog_shots->'plate_identity', '{}'::jsonb)
        || jsonb_build_object(
             'assignmentLock', jsonb_build_object('0','483f9cdc-eb31-4486-bf67-9c5e7d955016','1','54d90504-7253-482f-9c6f-1902e8a6749b'),
             'assignmentLockSource','v326_geometry_rowmajor',
             'status','geometry',
             'resolvedCount', 2
           ),
      true
    ),
    updated_at = now()
WHERE id = '0fab8a39-f90c-492a-b3bb-4c3cb53258a1';