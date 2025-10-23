-- Add state column to oauth_states table for LinkedIn OAuth flow
ALTER TABLE oauth_states ADD COLUMN state TEXT;

-- Create index for efficient state lookups
CREATE INDEX idx_oauth_states_state ON oauth_states(state);