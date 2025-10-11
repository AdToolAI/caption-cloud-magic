-- Enable Auto-Brand Kit and Carousel Generator in the Design & Visuals category
UPDATE feature_registry 
SET enabled = true, "order" = 1
WHERE id = 'brand_kit';

UPDATE feature_registry 
SET enabled = true, "order" = 2
WHERE id = 'carousel_generator';