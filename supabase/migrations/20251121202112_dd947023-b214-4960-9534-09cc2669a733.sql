-- ============================================
-- Phase 10: Batch Video Generator
-- ============================================

-- Create batch_jobs table for tracking batch video generation
CREATE TABLE IF NOT EXISTS batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES video_templates(id) ON DELETE CASCADE NOT NULL,
  
  -- Job metadata
  job_name TEXT NOT NULL,
  total_videos INT NOT NULL DEFAULT 0,
  completed_videos INT NOT NULL DEFAULT 0,
  failed_videos INT NOT NULL DEFAULT 0,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  
  -- Data storage
  csv_data JSONB NOT NULL, -- Original CSV data (array of objects)
  error_log JSONB DEFAULT '[]'::jsonb, -- Array of error objects { video_index, error_message }
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for batch_jobs
CREATE INDEX idx_batch_jobs_user_id ON batch_jobs(user_id);
CREATE INDEX idx_batch_jobs_status ON batch_jobs(status);
CREATE INDEX idx_batch_jobs_created_at ON batch_jobs(created_at DESC);

-- Enable RLS for batch_jobs
ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for batch_jobs
CREATE POLICY "Users can view their own batch jobs"
  ON batch_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own batch jobs"
  ON batch_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own batch jobs"
  ON batch_jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own batch jobs"
  ON batch_jobs FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_batch_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER batch_jobs_updated_at_trigger
  BEFORE UPDATE ON batch_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_jobs_updated_at();

-- Enable realtime for batch_jobs (for progress tracking)
ALTER PUBLICATION supabase_realtime ADD TABLE batch_jobs;