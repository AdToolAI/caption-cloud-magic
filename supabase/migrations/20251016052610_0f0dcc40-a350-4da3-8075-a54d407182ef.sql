-- Add account_metadata column to social_connections table
-- This will store account type (business/personal) and other metadata
ALTER TABLE social_connections 
ADD COLUMN IF NOT EXISTS account_metadata JSONB DEFAULT '{}'::jsonb;

-- Add comment to explain the column
COMMENT ON COLUMN social_connections.account_metadata IS 'Stores account-specific metadata like account_type (business/personal), features, etc.';