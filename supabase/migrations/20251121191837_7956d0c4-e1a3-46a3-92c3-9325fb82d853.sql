-- Add user_id column to video_renders table
ALTER TABLE public.video_renders 
ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_video_renders_user_id ON public.video_renders(user_id);

-- Drop old policies
DROP POLICY IF EXISTS "Users can view all video renders" ON public.video_renders;
DROP POLICY IF EXISTS "Users can insert video renders" ON public.video_renders;
DROP POLICY IF EXISTS "Users can update video renders" ON public.video_renders;

-- Create new user-specific policies
CREATE POLICY "Users can view own video renders"
  ON public.video_renders
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own video renders"
  ON public.video_renders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own video renders"
  ON public.video_renders
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own video renders"
  ON public.video_renders
  FOR DELETE
  USING (auth.uid() = user_id);