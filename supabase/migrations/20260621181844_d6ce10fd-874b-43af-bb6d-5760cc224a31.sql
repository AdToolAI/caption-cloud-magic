-- v159 sync-3 mouth-box hard-fail rollout: clear stale plate identity + AWS face cache
update public.plate_face_cache
  set expires_at = now() - interval '1 second'
  where detector like 'aws_rekognition%'
    and expires_at > now();

update public.composer_scenes
  set dialog_shots = (dialog_shots::jsonb - 'plate_identity')
  where id = '5f4005fa-5fe1-429f-b47c-e6478310429a'
    and dialog_shots is not null;