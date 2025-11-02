-- ============================================================
-- WEEK 3: Exactly-Once Guarantees + Resilience
-- ============================================================

-- 1. Add content_hash to calendar_events for deduplication
ALTER TABLE calendar_events 
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Create unique index to prevent duplicate content
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_content_hash
  ON calendar_events(workspace_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- 2. Add unique constraint to publish_results for idempotent publishing
CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_results_unique
  ON publish_results(job_id, provider)
  WHERE job_id IS NOT NULL AND provider IS NOT NULL;

-- 3. Add circuit_breaker_state tracking table
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
  service_name TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
  failure_count INTEGER DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_state_change TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on circuit_breaker_state
ALTER TABLE circuit_breaker_state ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage circuit breaker state
CREATE POLICY "Service role can manage circuit breaker state"
  ON circuit_breaker_state
  FOR ALL
  USING (true);

-- 4. Function to compute content hash
CREATE OR REPLACE FUNCTION public.compute_content_hash(
  p_caption TEXT,
  p_platforms TEXT[],
  p_media_urls TEXT[]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content TEXT;
BEGIN
  -- Concatenate all content fields
  v_content := COALESCE(p_caption, '') || 
               COALESCE(array_to_string(p_platforms, ','), '') || 
               COALESCE(array_to_string(p_media_urls, ','), '');
  
  -- Return MD5 hash
  RETURN md5(v_content);
END;
$$;

-- 5. Trigger to auto-compute content_hash on insert/update
CREATE OR REPLACE FUNCTION public.set_content_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only compute hash if caption or media changed
  IF TG_OP = 'INSERT' OR 
     OLD.caption IS DISTINCT FROM NEW.caption OR
     OLD.media_urls IS DISTINCT FROM NEW.media_urls THEN
    
    NEW.content_hash := compute_content_hash(
      NEW.caption,
      NEW.platforms::TEXT[],
      NEW.media_urls
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply trigger to calendar_events
DROP TRIGGER IF EXISTS trigger_set_content_hash ON calendar_events;
CREATE TRIGGER trigger_set_content_hash
  BEFORE INSERT OR UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION set_content_hash();