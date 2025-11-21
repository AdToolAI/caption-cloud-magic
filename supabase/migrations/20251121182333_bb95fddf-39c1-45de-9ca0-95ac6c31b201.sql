-- Make user_id nullable for system-wide content templates
ALTER TABLE content_templates 
ALTER COLUMN user_id DROP NOT NULL;

-- Add check to ensure either user_id exists OR template is public
ALTER TABLE content_templates
ADD CONSTRAINT content_templates_user_or_public_check 
CHECK (user_id IS NOT NULL OR is_public = true);