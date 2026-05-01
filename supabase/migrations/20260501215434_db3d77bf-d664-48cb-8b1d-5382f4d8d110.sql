-- 1. Neuer privater Storage-Bucket für Support-Anhänge
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  false,
  26214400, -- 25 MB
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. RLS-Policies für support-attachments (User ID als erster Pfadabschnitt)
CREATE POLICY "Users can upload their own support attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can read their own support attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own support attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can read all support attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- 3. support_tickets erweitern
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS affected_module text,
  ADD COLUMN IF NOT EXISTS browser_info jsonb,
  ADD COLUMN IF NOT EXISTS expected_result text,
  ADD COLUMN IF NOT EXISTS actual_result text,
  ADD COLUMN IF NOT EXISTS reproduction_steps text;

-- 4. severity-CHECK
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_severity_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_severity_check
  CHECK (severity = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'blocking'::text]));

-- 5. category-CHECK erweitern (mit den neuen Werten)
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_category_check
  CHECK (category = ANY (ARRAY[
    'bug'::text, 'rendering'::text, 'publishing'::text,
    'account'::text, 'billing'::text, 'feature'::text,
    'technical'::text, 'other'::text
  ]));