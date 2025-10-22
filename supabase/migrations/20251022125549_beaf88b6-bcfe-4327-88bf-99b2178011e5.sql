-- Add PKCE columns to oauth_states table for X OAuth 2.0
ALTER TABLE public.oauth_states
ADD COLUMN IF NOT EXISTS code_verifier TEXT,
ADD COLUMN IF NOT EXISTS code_challenge TEXT,
ADD COLUMN IF NOT EXISTS code_challenge_method TEXT;