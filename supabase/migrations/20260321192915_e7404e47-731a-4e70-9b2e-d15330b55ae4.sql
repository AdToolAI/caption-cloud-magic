CREATE TABLE public.background_music_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mood TEXT NOT NULL,
  genre TEXT NOT NULL,
  moods TEXT[] NOT NULL DEFAULT '{}',
  source_id TEXT,
  duration_seconds INTEGER,
  file_size_bytes INTEGER,
  is_valid BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);