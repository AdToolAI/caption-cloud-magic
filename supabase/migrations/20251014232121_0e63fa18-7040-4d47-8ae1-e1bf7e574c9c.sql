-- Drop the old combined unique constraint
ALTER TABLE public.calendar_integrations 
DROP CONSTRAINT IF EXISTS calendar_integrations_workspace_id_brand_kit_id_key;

-- Add a unique constraint only on workspace_id
ALTER TABLE public.calendar_integrations 
ADD CONSTRAINT calendar_integrations_workspace_id_key UNIQUE (workspace_id);