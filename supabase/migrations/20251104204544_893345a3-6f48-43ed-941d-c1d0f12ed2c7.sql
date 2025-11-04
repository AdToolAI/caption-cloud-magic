-- Add foreign key relationship between workspace_members and profiles
ALTER TABLE workspace_members
ADD CONSTRAINT fk_workspace_members_user_id
FOREIGN KEY (user_id) 
REFERENCES profiles(id)
ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id 
ON workspace_members(user_id);