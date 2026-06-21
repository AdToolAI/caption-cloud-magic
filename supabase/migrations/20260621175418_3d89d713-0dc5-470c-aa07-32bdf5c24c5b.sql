update public.plate_face_cache
set expires_at = now() - interval '1 second'
where detector like 'aws_rekognition%'
  and expires_at > now();

update public.composer_scenes
set dialog_shots = (dialog_shots::jsonb - 'plate_identity')
where id = '2e387d22-403e-4eb0-9a8c-0e74d9a6156a'
  and dialog_shots is not null;
