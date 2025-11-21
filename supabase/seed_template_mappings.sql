-- Example: Seed template field mappings for existing templates
-- This shows how to connect templates to Remotion components

-- First, update existing templates with remotion_component_id
-- (Adjust UUIDs to match your actual template IDs)

-- Example: Update a ProductAd template
UPDATE content_templates
SET remotion_component_id = 'ProductAd'
WHERE name ILIKE '%product%ad%' 
  AND remotion_component_id IS NULL
LIMIT 1;

-- Example: Update an InstagramStory template
UPDATE content_templates
SET remotion_component_id = 'InstagramStory'
WHERE name ILIKE '%instagram%story%' 
  AND remotion_component_id IS NULL
LIMIT 1;

-- Example: Update a TikTokReel template
UPDATE content_templates
SET remotion_component_id = 'TikTokReel'
WHERE name ILIKE '%tiktok%' 
  AND remotion_component_id IS NULL
LIMIT 1;

-- =====================================================
-- Example Field Mappings for ProductAd Component
-- =====================================================
-- Assuming ProductAd Remotion component expects:
-- - imageUrl (product image)
-- - productName (product title)
-- - tagline (product description)
-- - ctaText (call to action button)

-- Get the first ProductAd template ID
DO $$
DECLARE
  template_id_var UUID;
BEGIN
  SELECT id INTO template_id_var
  FROM content_templates
  WHERE remotion_component_id = 'ProductAd'
  LIMIT 1;

  IF template_id_var IS NOT NULL THEN
    -- Insert field mappings
    INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function)
    VALUES
      (template_id_var, 'PRODUCT_IMAGE', 'imageUrl', NULL),
      (template_id_var, 'PRODUCT_NAME', 'productName', NULL),
      (template_id_var, 'TAGLINE', 'tagline', NULL),
      (template_id_var, 'CTA_TEXT', 'ctaText', NULL)
    ON CONFLICT (template_id, field_key) DO NOTHING;
    
    RAISE NOTICE 'Created field mappings for ProductAd template: %', template_id_var;
  END IF;
END $$;

-- =====================================================
-- Example Field Mappings for InstagramStory Component
-- =====================================================
-- InstagramStory expects:
-- - backgroundUrl (background image/video)
-- - headline (main title)
-- - text (body text)

DO $$
DECLARE
  template_id_var UUID;
BEGIN
  SELECT id INTO template_id_var
  FROM content_templates
  WHERE remotion_component_id = 'InstagramStory'
  LIMIT 1;

  IF template_id_var IS NOT NULL THEN
    INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function)
    VALUES
      (template_id_var, 'BACKGROUND_URL', 'backgroundUrl', NULL),
      (template_id_var, 'HEADLINE', 'headline', NULL),
      (template_id_var, 'TEXT', 'text', NULL)
    ON CONFLICT (template_id, field_key) DO NOTHING;
    
    RAISE NOTICE 'Created field mappings for InstagramStory template: %', template_id_var;
  END IF;
END $$;

-- =====================================================
-- Example Field Mappings for TikTokReel Component
-- =====================================================
-- TikTokReel expects:
-- - videoUrl (background video)
-- - overlayText (main text overlay)
-- - hashtags (hashtag string)

DO $$
DECLARE
  template_id_var UUID;
BEGIN
  SELECT id INTO template_id_var
  FROM content_templates
  WHERE remotion_component_id = 'TikTokReel'
  LIMIT 1;

  IF template_id_var IS NOT NULL THEN
    INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function)
    VALUES
      (template_id_var, 'VIDEO_URL', 'videoUrl', NULL),
      (template_id_var, 'OVERLAY_TEXT', 'overlayText', NULL),
      (template_id_var, 'HASHTAGS', 'hashtags', NULL)
    ON CONFLICT (template_id, field_key) DO NOTHING;
    
    RAISE NOTICE 'Created field mappings for TikTokReel template: %', template_id_var;
  END IF;
END $$;

-- =====================================================
-- Example with Transformation Function
-- =====================================================
-- Demonstration of using transformation functions

DO $$
DECLARE
  template_id_var UUID;
BEGIN
  -- Find any template for demonstration
  SELECT id INTO template_id_var
  FROM content_templates
  WHERE remotion_component_id IS NOT NULL
  LIMIT 1;

  IF template_id_var IS NOT NULL THEN
    -- Example: Color field that needs hex conversion
    INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function)
    VALUES
      (template_id_var, 'TEXT_COLOR', 'textColor', 'color_to_hex'),
      (template_id_var, 'BG_COLOR', 'backgroundColor', 'color_to_hex')
    ON CONFLICT (template_id, field_key) DO NOTHING;
    
    RAISE NOTICE 'Created example color mappings with transformations';
  END IF;
END $$;

-- =====================================================
-- Query to verify mappings
-- =====================================================
SELECT 
  ct.name as template_name,
  ct.remotion_component_id,
  tfm.field_key,
  tfm.remotion_prop_name,
  tfm.transformation_function,
  COUNT(*) OVER (PARTITION BY ct.id) as total_mappings
FROM content_templates ct
LEFT JOIN template_field_mappings tfm ON tfm.template_id = ct.id
WHERE ct.remotion_component_id IS NOT NULL
ORDER BY ct.name, tfm.field_key;

-- =====================================================
-- Notes:
-- =====================================================
-- 1. This seed file is IDEMPOTENT - safe to run multiple times
-- 2. Adjust field_key names to match your actual customizable_fields
-- 3. Add more mappings as needed for your templates
-- 4. Available transformation functions:
--    - color_to_hex: Converts color to hex format
--    - to_number: Converts to number
--    - to_string: Converts to string
--    - to_array: Converts comma-separated string to array
--    - url_encode: URL encodes the value
-- 5. To add new Remotion components:
--    a. Create component in src/remotion/templates/
--    b. Add to COMPONENT_REGISTRY in DynamicCompositionLoader.tsx
--    c. Add composition settings in getCompositionSettings()
--    d. Create template in DB with remotion_component_id
--    e. Add field mappings using this pattern
