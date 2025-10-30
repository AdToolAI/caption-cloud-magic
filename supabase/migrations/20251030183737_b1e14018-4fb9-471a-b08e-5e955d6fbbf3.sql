-- Add valid_until column
ALTER TABLE public.promo_codes 
ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

-- Insert affiliate promo codes
INSERT INTO public.promo_codes (code, stripe_promo_id, discount_percent, duration_months, max_redemptions, valid_until, active)
VALUES 
  ('ADTOOLAI30', 'promo_1SO0b2DRu4kfSFxjiyyi5Wo1', 30, 3, NULL, '2025-12-31 23:59:59+00', true),
  ('INFLUENCER30', 'promo_1SO0b2DRu4kfSFxjiyyi5Wo1', 30, 3, NULL, '2025-12-31 23:59:59+00', true),
  ('BLACKFRIDAY30', 'promo_1SO0b2DRu4kfSFxjiyyi5Wo1', 30, 3, 100, '2025-11-30 23:59:59+00', true),
  ('RABATT30', 'promo_1SO0b2DRu4kfSFxjiyyi5Wo1', 30, 3, NULL, '2026-10-31 23:59:59+00', true),
  ('SOCIALMEDIA30', 'promo_1SO0b2DRu4kfSFxjiyyi5Wo1', 30, 3, NULL, '2026-12-31 23:59:59+00', true)
ON CONFLICT (code) DO NOTHING;