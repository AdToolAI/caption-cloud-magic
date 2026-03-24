ALTER TABLE public.publish_jobs ADD COLUMN content_hash TEXT;

CREATE INDEX idx_publish_jobs_content_hash ON public.publish_jobs (user_id, content_hash, created_at);