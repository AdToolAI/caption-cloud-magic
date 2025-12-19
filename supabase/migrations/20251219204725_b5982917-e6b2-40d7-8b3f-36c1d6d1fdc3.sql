-- Make project_id nullable for Universal Video Creator support
ALTER TABLE public.video_renders
ALTER COLUMN project_id DROP NOT NULL;