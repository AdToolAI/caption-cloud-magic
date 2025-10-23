-- Add Composer feature to feature_registry
INSERT INTO public.feature_registry (
  id,
  route, 
  category, 
  titles_json, 
  description_json, 
  icon, 
  plan, 
  enabled, 
  "order"
) VALUES (
  gen_random_uuid(),
  '/composer',
  'create',
  '{"de": "Composer", "en": "Composer"}',
  '{"de": "Multi-Channel Publishing", "en": "Multi-Channel Publishing"}',
  'Send',
  'free',
  true,
  100
)
ON CONFLICT (route) DO NOTHING;