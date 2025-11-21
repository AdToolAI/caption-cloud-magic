-- Phase 16: AI-Powered Features - Database Tables

-- 1. Post Optimization System
CREATE TABLE IF NOT EXISTS post_optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES post_drafts(id) ON DELETE CASCADE,
  original_data JSONB NOT NULL,
  suggested_improvements JSONB NOT NULL,
  applied_improvements TEXT[],
  performance_before JSONB,
  performance_after JSONB,
  optimization_score INTEGER CHECK (optimization_score >= 0 AND optimization_score <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  applied_at TIMESTAMPTZ
);

CREATE INDEX idx_post_optimizations_user ON post_optimizations(user_id);
CREATE INDEX idx_post_optimizations_post ON post_optimizations(post_id);
CREATE INDEX idx_post_optimizations_draft ON post_optimizations(draft_id);
CREATE INDEX idx_post_optimizations_created ON post_optimizations(created_at DESC);

-- RLS Policies for post_optimizations
ALTER TABLE post_optimizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own optimizations"
  ON post_optimizations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own optimizations"
  ON post_optimizations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own optimizations"
  ON post_optimizations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own optimizations"
  ON post_optimizations FOR DELETE
  USING (auth.uid() = user_id);


-- 2. Custom Voices & Translations
CREATE TABLE IF NOT EXISTS custom_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  elevenlabs_voice_id TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  sample_urls TEXT[],
  voice_characteristics JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_custom_voices_user ON custom_voices(user_id);
CREATE INDEX idx_custom_voices_active ON custom_voices(is_active) WHERE is_active = true;

-- RLS Policies for custom_voices
ALTER TABLE custom_voices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own voices"
  ON custom_voices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own voices"
  ON custom_voices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own voices"
  ON custom_voices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own voices"
  ON custom_voices FOR DELETE
  USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS voice_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  original_language TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  target_language TEXT NOT NULL,
  voiceover_url TEXT,
  voice_id UUID REFERENCES custom_voices(id) ON DELETE SET NULL,
  duration_sec NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_voice_translations_user ON voice_translations(user_id);
CREATE INDEX idx_voice_translations_voice ON voice_translations(voice_id);
CREATE INDEX idx_voice_translations_created ON voice_translations(created_at DESC);

-- RLS Policies for voice_translations
ALTER TABLE voice_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own translations"
  ON voice_translations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own translations"
  ON voice_translations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own translations"
  ON voice_translations FOR DELETE
  USING (auth.uid() = user_id);


-- 3. Generated Templates from Posts
CREATE TABLE IF NOT EXISTS generated_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  source_url TEXT,
  template_id UUID REFERENCES content_templates(id) ON DELETE CASCADE,
  generation_metadata JSONB,
  analysis_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_generated_templates_user ON generated_templates(user_id);
CREATE INDEX idx_generated_templates_template ON generated_templates(template_id);
CREATE INDEX idx_generated_templates_created ON generated_templates(created_at DESC);

-- RLS Policies for generated_templates
ALTER TABLE generated_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own generated templates"
  ON generated_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own generated templates"
  ON generated_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own generated templates"
  ON generated_templates FOR DELETE
  USING (auth.uid() = user_id);


-- 4. User Behavior Events for ML
CREATE TABLE IF NOT EXISTS user_behavior_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  template_id UUID REFERENCES content_templates(id) ON DELETE SET NULL,
  content_type TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_behavior_user ON user_behavior_events(user_id);
CREATE INDEX idx_user_behavior_type ON user_behavior_events(event_type);
CREATE INDEX idx_user_behavior_template ON user_behavior_events(template_id);
CREATE INDEX idx_user_behavior_created ON user_behavior_events(created_at DESC);
CREATE INDEX idx_user_behavior_session ON user_behavior_events(session_id);

-- RLS Policies for user_behavior_events
ALTER TABLE user_behavior_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own behavior events"
  ON user_behavior_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own behavior events"
  ON user_behavior_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- Update trigger for custom_voices
CREATE OR REPLACE FUNCTION update_custom_voices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_custom_voices_updated_at
  BEFORE UPDATE ON custom_voices
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_voices_updated_at();