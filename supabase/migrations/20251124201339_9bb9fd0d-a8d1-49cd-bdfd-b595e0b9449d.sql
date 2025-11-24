-- Add 'universal' to content_type constraint
ALTER TABLE content_projects 
DROP CONSTRAINT IF EXISTS content_projects_content_type_check;

ALTER TABLE content_projects 
ADD CONSTRAINT content_projects_content_type_check 
CHECK (content_type = ANY (ARRAY['ad'::text, 'story'::text, 'reel'::text, 'tutorial'::text, 'testimonial'::text, 'news'::text, 'universal'::text]));