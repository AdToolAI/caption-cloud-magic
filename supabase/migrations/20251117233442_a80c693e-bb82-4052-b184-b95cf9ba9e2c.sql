-- Update Event Announcement template to support multiple images
UPDATE video_templates 
SET 
  customizable_fields = jsonb_set(
    customizable_fields,
    '{0}', 
    jsonb_build_object(
      'key', 'EVENT_IMAGE',
      'label', 'Event Images/Photos',
      'required', true,
      'type', 'images',
      'min_count', 1,
      'max_count', 5
    )
  ),
  supports_multiple_images = true,
  max_image_count = 5
WHERE name = 'Event Announcement';

-- Update Sale & Discount template to support multiple product images
UPDATE video_templates 
SET 
  customizable_fields = jsonb_set(
    customizable_fields,
    '{0}', 
    jsonb_build_object(
      'key', 'PRODUCT_IMAGE',
      'label', 'Product Images',
      'required', false,
      'type', 'images',
      'min_count', 0,
      'max_count', 5
    )
  ),
  supports_multiple_images = true,
  max_image_count = 5
WHERE name = 'Sale & Discount';

-- Update Service Promo template to support multiple service icons/images
UPDATE video_templates 
SET 
  customizable_fields = jsonb_set(
    customizable_fields,
    '{0}', 
    jsonb_build_object(
      'key', 'SERVICE_ICON',
      'label', 'Service Icons/Images',
      'required', true,
      'type', 'images',
      'min_count', 1,
      'max_count', 3
    )
  ),
  supports_multiple_images = true,
  max_image_count = 3
WHERE name = 'Service Promo';