-- Add workspace_id column to media_profiles
ALTER TABLE media_profiles 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Migrate existing data: Create default workspace for users without one, then link profiles
DO $$
DECLARE
  profile_row RECORD;
  user_workspace_id UUID;
BEGIN
  FOR profile_row IN SELECT DISTINCT user_id FROM media_profiles WHERE workspace_id IS NULL LOOP
    -- Get or create workspace for user
    SELECT id INTO user_workspace_id 
    FROM workspaces 
    WHERE owner_id = profile_row.user_id 
    LIMIT 1;
    
    -- Update profiles with workspace_id
    IF user_workspace_id IS NOT NULL THEN
      UPDATE media_profiles 
      SET workspace_id = user_workspace_id 
      WHERE user_id = profile_row.user_id AND workspace_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- Make workspace_id NOT NULL after migration
ALTER TABLE media_profiles ALTER COLUMN workspace_id SET NOT NULL;

-- Add unique constraint for name per workspace
ALTER TABLE media_profiles 
DROP CONSTRAINT IF EXISTS unique_profile_name_per_workspace;

ALTER TABLE media_profiles 
ADD CONSTRAINT unique_profile_name_per_workspace 
UNIQUE (workspace_id, name);

-- Update RLS policies
DROP POLICY IF EXISTS "Users can manage own profiles" ON media_profiles;

CREATE POLICY "Workspace members can view profiles"
  ON media_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = media_profiles.workspace_id
      AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace editors can manage profiles"
  ON media_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = media_profiles.workspace_id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role IN ('owner', 'admin', 'editor')
    )
  );

-- Add type column for image/video distinction
ALTER TABLE media_profiles 
ADD COLUMN IF NOT EXISTS type TEXT;

ALTER TABLE media_profiles 
DROP CONSTRAINT IF EXISTS media_profiles_type_check;

ALTER TABLE media_profiles 
ADD CONSTRAINT media_profiles_type_check 
CHECK (type IN ('image', 'video'));

-- Set default value for existing rows
UPDATE media_profiles SET type = 'image' WHERE type IS NULL;

ALTER TABLE media_profiles 
ALTER COLUMN type SET DEFAULT 'image';

-- Rename provider to platform for consistency
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'media_profiles' AND column_name = 'provider'
  ) THEN
    ALTER TABLE media_profiles RENAME COLUMN provider TO platform;
  END IF;
END $$;

-- Update indexes
DROP INDEX IF EXISTS idx_mp_provider;
CREATE INDEX IF NOT EXISTS idx_mp_platform ON media_profiles(platform);
CREATE INDEX IF NOT EXISTS idx_mp_workspace ON media_profiles(workspace_id);