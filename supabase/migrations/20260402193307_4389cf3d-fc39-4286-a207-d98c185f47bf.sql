ALTER TABLE public.director_cut_projects
  ADD COLUMN IF NOT EXISTS cleaned_video_url TEXT,
  ADD COLUMN IF NOT EXISTS burned_subtitles_status TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS burned_subtitles_error TEXT,
  ADD COLUMN IF NOT EXISTS burned_subtitles_prediction_id TEXT;