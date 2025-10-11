-- Add new performance event types to app_event_type enum
ALTER TYPE app_event_type ADD VALUE IF NOT EXISTS 'performance.account.disconnected';
ALTER TYPE app_event_type ADD VALUE IF NOT EXISTS 'performance.csv.uploaded';
ALTER TYPE app_event_type ADD VALUE IF NOT EXISTS 'performance.insights.generated';