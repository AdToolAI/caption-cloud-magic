-- Update maxLength for SALE_TEXT field in Sale & Discount template
UPDATE video_templates 
SET customizable_fields = jsonb_set(
  customizable_fields,
  '{2}',
  jsonb_build_object(
    'key', 'SALE_TEXT',
    'label', 'Sale Description',
    'type', 'text',
    'required', true,
    'maxLength', 1000
  )
)
WHERE name = 'Sale & Discount';