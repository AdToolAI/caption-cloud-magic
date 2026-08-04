DELETE FROM public.video_creations
WHERE output_url ILIKE '%dialog-pass-preclip%'
   OR output_url ILIKE '%dialog-turn-preclip%'
   OR output_url ILIKE '%dialog-stitch%';