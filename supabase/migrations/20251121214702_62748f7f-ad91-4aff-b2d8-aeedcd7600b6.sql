-- Phase 18: Performance & Cost Optimization Tables

-- 1. Render Queue Management
CREATE TABLE render_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID REFERENCES content_projects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES video_templates(id) ON DELETE SET NULL,
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  estimated_cost INTEGER NOT NULL,
  estimated_duration_sec INTEGER,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  engine TEXT CHECK (engine IN ('remotion', 'shotstack', 'auto')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  config JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE render_queue_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  engine TEXT NOT NULL,
  total_jobs INTEGER DEFAULT 0,
  completed_jobs INTEGER DEFAULT 0,
  failed_jobs INTEGER DEFAULT 0,
  avg_duration_sec NUMERIC,
  peak_queue_size INTEGER DEFAULT 0,
  total_credits_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, engine)
);

CREATE INDEX idx_render_queue_status_priority ON render_queue(status, priority DESC, created_at);
CREATE INDEX idx_render_queue_user ON render_queue(user_id, created_at DESC);
CREATE INDEX idx_render_queue_engine ON render_queue(engine, status);

-- RLS Policies for render_queue
ALTER TABLE render_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own queue jobs"
  ON render_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own queue jobs"
  ON render_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own queue jobs"
  ON render_queue FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own queue jobs"
  ON render_queue FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for render_queue_stats
ALTER TABLE render_queue_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view queue stats"
  ON render_queue_stats FOR SELECT
  USING (true);

-- 2. Cost Prediction & Estimation
CREATE TABLE render_cost_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine TEXT NOT NULL,
  base_cost INTEGER NOT NULL,
  cost_per_second NUMERIC NOT NULL,
  cost_per_mb NUMERIC NOT NULL,
  resolution_multiplier JSONB DEFAULT '{"720p": 1.0, "1080p": 1.5, "4k": 3.0}'::jsonb,
  complexity_multiplier JSONB DEFAULT '{"simple": 1.0, "medium": 1.5, "complex": 2.0}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE render_cost_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  render_id UUID,
  template_id UUID REFERENCES video_templates(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  engine TEXT,
  estimated_cost INTEGER,
  actual_cost INTEGER,
  duration_sec INTEGER,
  resolution TEXT,
  file_size_mb NUMERIC,
  complexity_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cost_history_template ON render_cost_history(template_id, created_at DESC);
CREATE INDEX idx_cost_history_engine ON render_cost_history(engine, created_at DESC);
CREATE INDEX idx_cost_history_user ON render_cost_history(user_id, created_at DESC);

-- RLS Policies for render_cost_factors
ALTER TABLE render_cost_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view cost factors"
  ON render_cost_factors FOR SELECT
  USING (true);

-- RLS Policies for render_cost_history
ALTER TABLE render_cost_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cost history"
  ON render_cost_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cost history"
  ON render_cost_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Insert default cost factors
INSERT INTO render_cost_factors (engine, base_cost, cost_per_second, cost_per_mb) VALUES
('remotion', 5, 0.1, 0.05),
('shotstack', 10, 0.15, 0.08);

-- 3. Quality Presets
CREATE TABLE video_quality_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_global BOOLEAN DEFAULT false,
  config JSONB NOT NULL,
  target_file_size_mb INTEGER,
  estimated_quality_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies for video_quality_presets
ALTER TABLE video_quality_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view global presets and own presets"
  ON video_quality_presets FOR SELECT
  USING (is_global = true OR auth.uid() = user_id);

CREATE POLICY "Users can create own presets"
  ON video_quality_presets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presets"
  ON video_quality_presets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own presets"
  ON video_quality_presets FOR DELETE
  USING (auth.uid() = user_id);

-- Insert system presets
INSERT INTO video_quality_presets (name, description, is_global, config, target_file_size_mb, estimated_quality_score) VALUES
('Instagram Reel (Optimiert)', 'Beste Balance für IG Reels', true, '{"resolution":"1080p","bitrate":4000,"fps":30,"quality":"high","codec":"h264","compression":"balanced"}'::jsonb, 50, 85),
('TikTok (Schnell)', 'Schnelle Uploads, gute Qualität', true, '{"resolution":"1080p","bitrate":3000,"fps":30,"quality":"medium","codec":"h264","compression":"fast"}'::jsonb, 40, 75),
('YouTube (Maximal)', 'Maximale Qualität für YT', true, '{"resolution":"1080p","bitrate":8000,"fps":60,"quality":"ultra","codec":"h264","compression":"slow"}'::jsonb, 100, 95),
('LinkedIn (Professionell)', 'Business-optimiert', true, '{"resolution":"720p","bitrate":3500,"fps":30,"quality":"high","codec":"h264","compression":"balanced"}'::jsonb, 35, 80),
('Twitter/X (Kompakt)', 'Kleine Dateigröße', true, '{"resolution":"720p","bitrate":2500,"fps":30,"quality":"medium","codec":"h264","compression":"fast"}'::jsonb, 25, 70);

-- 4. Caching System
CREATE TABLE render_asset_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT UNIQUE NOT NULL,
  template_id UUID REFERENCES video_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  engine TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_mb NUMERIC,
  duration_sec INTEGER,
  resolution TEXT,
  hit_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE cache_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name TEXT NOT NULL,
  max_cache_size_gb INTEGER DEFAULT 100,
  max_cache_age_days INTEGER DEFAULT 30,
  min_hit_count INTEGER DEFAULT 2,
  priority_templates UUID[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cache_content_hash ON render_asset_cache(content_hash);
CREATE INDEX idx_cache_template_accessed ON render_asset_cache(template_id, last_accessed_at DESC);
CREATE INDEX idx_cache_user ON render_asset_cache(user_id, last_accessed_at DESC);

-- RLS Policies for render_asset_cache
ALTER TABLE render_asset_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cache"
  ON render_asset_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cache"
  ON render_asset_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for cache_policies
ALTER TABLE cache_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view cache policies"
  ON cache_policies FOR SELECT
  USING (true);

-- Insert default cache policy
INSERT INTO cache_policies (policy_name, max_cache_size_gb, max_cache_age_days, min_hit_count, is_active) VALUES
('Default Cache Policy', 100, 30, 2, true);

-- 5. Usage Reports & Analytics
CREATE TABLE credit_usage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  report_period TEXT CHECK (report_period IN ('daily', 'weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_credits_used INTEGER DEFAULT 0,
  breakdown_by_feature JSONB DEFAULT '{}'::jsonb,
  breakdown_by_template JSONB DEFAULT '{}'::jsonb,
  breakdown_by_engine JSONB DEFAULT '{}'::jsonb,
  top_cost_drivers JSONB DEFAULT '[]'::jsonb,
  cost_savings_potential JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, period_start, period_end)
);

CREATE TABLE credit_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  feature_code TEXT NOT NULL,
  template_id UUID REFERENCES video_templates(id) ON DELETE SET NULL,
  credits_used INTEGER NOT NULL,
  engine TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_usage_events_user_time ON credit_usage_events(user_id, timestamp DESC);
CREATE INDEX idx_usage_events_feature ON credit_usage_events(feature_code, timestamp DESC);
CREATE INDEX idx_usage_reports_user_period ON credit_usage_reports(user_id, period_start DESC);

-- RLS Policies for credit_usage_reports
ALTER TABLE credit_usage_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage reports"
  ON credit_usage_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Workspace members can view workspace reports"
  ON credit_usage_reports FOR SELECT
  USING (
    workspace_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = credit_usage_reports.workspace_id
      AND workspace_members.user_id = auth.uid()
    )
  );

-- RLS Policies for credit_usage_events
ALTER TABLE credit_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage events"
  ON credit_usage_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage events"
  ON credit_usage_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update timestamp trigger for render_queue
CREATE OR REPLACE FUNCTION update_render_queue_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_render_queue_timestamp
  BEFORE UPDATE ON render_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_render_queue_timestamp();