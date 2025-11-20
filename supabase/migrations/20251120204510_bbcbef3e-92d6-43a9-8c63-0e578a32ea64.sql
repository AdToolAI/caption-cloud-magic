-- Create content_projects table for Content Studio
CREATE TABLE content_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Template reference (can be NULL for custom projects without template)
  template_id UUID REFERENCES content_templates(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('ad', 'story', 'reel', 'tutorial', 'testimonial', 'news')),
  
  -- Project basics
  project_name TEXT NOT NULL,
  brief TEXT,
  
  -- Customizations & Export
  customizations JSONB NOT NULL DEFAULT '{}',
  export_formats JSONB DEFAULT '{"mp4": true}',
  export_aspect_ratios TEXT[] DEFAULT ARRAY['9:16'],
  
  -- Rendering
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'rendering', 'completed', 'failed')),
  render_engine TEXT DEFAULT 'shotstack' CHECK (render_engine IN ('shotstack', 'remotion')),
  render_id TEXT,
  output_urls JSONB DEFAULT '{}',
  
  -- Credits
  credits_used INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Collaboration (for later)
  shared_with UUID[] DEFAULT ARRAY[]::UUID[],
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_content_projects_user ON content_projects(user_id);
CREATE INDEX idx_content_projects_status ON content_projects(status);
CREATE INDEX idx_content_projects_template ON content_projects(template_id);
CREATE INDEX idx_content_projects_content_type ON content_projects(content_type);

-- Enable RLS
ALTER TABLE content_projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own projects"
  ON content_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own projects"
  ON content_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON content_projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON content_projects FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER set_content_projects_updated_at
  BEFORE UPDATE ON content_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();