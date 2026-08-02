INSERT INTO public.composer_scene_transitions (from_state, to_state)
VALUES ('lipsync_muxing'::composer_scene_state, 'audio_ready'::composer_scene_state),
       ('lipsync_muxing'::composer_scene_state, 'plate_ready'::composer_scene_state)
ON CONFLICT DO NOTHING;