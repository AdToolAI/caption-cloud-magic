-- Sora 2 Long-Form Feature-Kosten hinzufügen
-- Standard: €0.25/sec = 25 Credits pro Sekunde
-- Pro: €0.53/sec = 53 Credits pro Sekunde
INSERT INTO feature_costs (feature_code, credits_per_use, description) VALUES
  ('sora_longform_standard', 25, 'Sora 2 Long-Form Standard (pro Sekunde)'),
  ('sora_longform_pro', 53, 'Sora 2 Long-Form Pro (pro Sekunde)')
ON CONFLICT (feature_code) DO UPDATE SET
  credits_per_use = EXCLUDED.credits_per_use,
  description = EXCLUDED.description;