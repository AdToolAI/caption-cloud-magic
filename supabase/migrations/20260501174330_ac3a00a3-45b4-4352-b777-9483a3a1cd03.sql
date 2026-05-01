UPDATE public.qa_bug_reports
SET status = 'resolved', resolved_at = now()
WHERE id IN (
  '861dc976-0fd9-48bd-8960-013b1dfdd0e2',
  '944cf407-293c-4f8c-8137-45f23389ca0b',
  'e578d06b-3366-4f50-9bd2-5d4cd4b3c8e2'
);