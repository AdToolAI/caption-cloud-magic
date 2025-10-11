-- Enable the free Design & Visuals feature
UPDATE public.feature_registry 
SET enabled = true 
WHERE id = 'image_caption';