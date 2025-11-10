-- Add new event types for edge function monitoring (step 1)
ALTER TYPE app_event_type ADD VALUE IF NOT EXISTS 'edge_fn.call';
ALTER TYPE app_event_type ADD VALUE IF NOT EXISTS 'edge_fn.error';
ALTER TYPE app_event_type ADD VALUE IF NOT EXISTS 'edge_fn.timeout';