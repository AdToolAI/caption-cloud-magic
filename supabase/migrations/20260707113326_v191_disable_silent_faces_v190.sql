-- v191 rollback: disable v190 Global-Silent-Slots.
-- brand_characters.portrait_url is not a suitable anchor source (ghost portraits
-- over the plate). Turn the feature back off until v190.1 ships a plate-derived
-- freeze-crop anchor.
INSERT INTO public.system_config (key, value)
VALUES ('composer.silent_faces_v183', 'false'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
