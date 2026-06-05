UPDATE public.composer_scenes
SET clip_status = 'pending',
    clip_url = NULL,
    clip_error = NULL,
    dialog_shots = '[]'::jsonb,
    updated_at = now()
WHERE id = '57a28235-ccad-4400-8c75-fa168f18cc96';