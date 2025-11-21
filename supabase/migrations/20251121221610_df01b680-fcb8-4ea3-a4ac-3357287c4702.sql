-- Phase 21: Template Data Migration - Map all templates to Remotion components

-- 1. Update all templates with remotion_component_id
UPDATE content_templates SET remotion_component_id = 'ProductAd'
WHERE id = '78c7ecc4-7a6c-4b3c-bd39-822ddd908a8f'; -- Produkt-Showcase Video

UPDATE content_templates SET remotion_component_id = 'InstagramStory'
WHERE id = 'be547f95-588a-47cf-984d-13fe9de56fa7'; -- Instagram Story Basic

UPDATE content_templates SET remotion_component_id = 'TikTokReel'
WHERE id = '73e19da1-069b-44c7-84c0-724b15e39cee'; -- TikTok Reel Trend

UPDATE content_templates SET remotion_component_id = 'Testimonial'
WHERE id = 'd134a7d2-85f8-46b3-9f81-27f13741a449'; -- Testimonial Reel

UPDATE content_templates SET remotion_component_id = 'Tutorial'
WHERE id = '41d5f33e-772b-4f52-89b7-bad9182a6094'; -- Tutorial Reel

UPDATE content_templates SET remotion_component_id = 'InstagramStory'
WHERE id = 'e83096ef-56b2-4a55-a57a-a289dc239282'; -- Behind-the-Scenes Story

UPDATE content_templates SET remotion_component_id = 'UniversalVideo'
WHERE id = 'f519cd1d-b90e-4230-85e2-a7f45085aa61'; -- Brand Story Ad

UPDATE content_templates SET remotion_component_id = 'ProductAd'
WHERE id = 'a7d83522-ac44-415c-a6b4-e02395a596e4'; -- Sale-Promotion Ad

UPDATE content_templates SET remotion_component_id = 'InstagramStory'
WHERE id = '64792417-12d6-45a3-9a63-c91a233d30d6'; -- Story mit Countdown

UPDATE content_templates SET remotion_component_id = 'Tutorial'
WHERE id = '4377f2f3-ba73-4c67-a81a-8936fa6ffabc'; -- Quick Tip Reel

-- 2. Create field mappings for each template

-- Produkt-Showcase Video → ProductAd
INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function) VALUES
  ('78c7ecc4-7a6c-4b3c-bd39-822ddd908a8f', 'productName', 'productName', NULL),
  ('78c7ecc4-7a6c-4b3c-bd39-822ddd908a8f', 'productImage', 'imageUrl', NULL),
  ('78c7ecc4-7a6c-4b3c-bd39-822ddd908a8f', 'headline', 'tagline', NULL),
  ('78c7ecc4-7a6c-4b3c-bd39-822ddd908a8f', 'price', 'ctaText', NULL);

-- Instagram Story Basic → InstagramStory
INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function) VALUES
  ('be547f95-588a-47cf-984d-13fe9de56fa7', 'backgroundImage', 'backgroundUrl', NULL),
  ('be547f95-588a-47cf-984d-13fe9de56fa7', 'headline', 'headline', NULL),
  ('be547f95-588a-47cf-984d-13fe9de56fa7', 'subtitle', 'text', NULL);

-- TikTok Reel Trend → TikTokReel
INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function) VALUES
  ('73e19da1-069b-44c7-84c0-724b15e39cee', 'clips', 'videoUrl', NULL),
  ('73e19da1-069b-44c7-84c0-724b15e39cee', 'headline', 'overlayText', NULL),
  ('73e19da1-069b-44c7-84c0-724b15e39cee', 'musicStyle', 'hashtags', NULL);

-- Testimonial Reel → Testimonial
INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function) VALUES
  ('d134a7d2-85f8-46b3-9f81-27f13741a449', 'customerName', 'customerName', NULL),
  ('d134a7d2-85f8-46b3-9f81-27f13741a449', 'testimonialText', 'testimonialText', NULL),
  ('d134a7d2-85f8-46b3-9f81-27f13741a449', 'customerImage', 'customerImage', NULL),
  ('d134a7d2-85f8-46b3-9f81-27f13741a449', 'rating', 'rating', 'to_number');

-- Tutorial Reel → Tutorial
INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function) VALUES
  ('41d5f33e-772b-4f52-89b7-bad9182a6094', 'title', 'title', NULL),
  ('41d5f33e-772b-4f52-89b7-bad9182a6094', 'steps', 'steps', 'to_array'),
  ('41d5f33e-772b-4f52-89b7-bad9182a6094', 'videoClips', 'videoUrl', NULL);

-- Behind-the-Scenes Story → InstagramStory
INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function) VALUES
  ('e83096ef-56b2-4a55-a57a-a289dc239282', 'clips', 'backgroundUrl', NULL),
  ('e83096ef-56b2-4a55-a57a-a289dc239282', 'caption', 'text', NULL);

-- Brand Story Ad → UniversalVideo
INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function) VALUES
  ('f519cd1d-b90e-4230-85e2-a7f45085aa61', 'brandName', 'title', NULL),
  ('f519cd1d-b90e-4230-85e2-a7f45085aa61', 'story', 'description', NULL),
  ('f519cd1d-b90e-4230-85e2-a7f45085aa61', 'logo', 'imageUrl', NULL);

-- Sale-Promotion Ad → ProductAd
INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function) VALUES
  ('a7d83522-ac44-415c-a6b4-e02395a596e4', 'productName', 'productName', NULL),
  ('a7d83522-ac44-415c-a6b4-e02395a596e4', 'productImage', 'imageUrl', NULL),
  ('a7d83522-ac44-415c-a6b4-e02395a596e4', 'salePercentage', 'tagline', NULL),
  ('a7d83522-ac44-415c-a6b4-e02395a596e4', 'newPrice', 'ctaText', NULL);

-- Story mit Countdown → InstagramStory
INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function) VALUES
  ('64792417-12d6-45a3-9a63-c91a233d30d6', 'eventName', 'headline', NULL),
  ('64792417-12d6-45a3-9a63-c91a233d30d6', 'eventDate', 'text', NULL),
  ('64792417-12d6-45a3-9a63-c91a233d30d6', 'backgroundImage', 'backgroundUrl', NULL);

-- Quick Tip Reel → Tutorial
INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function) VALUES
  ('4377f2f3-ba73-4c67-a81a-8936fa6ffabc', 'tipTitle', 'title', NULL),
  ('4377f2f3-ba73-4c67-a81a-8936fa6ffabc', 'tipSteps', 'steps', 'to_array');