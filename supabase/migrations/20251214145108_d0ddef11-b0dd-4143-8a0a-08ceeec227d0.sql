-- Drop alte CHECK-Constraints
ALTER TABLE universal_audio_assets 
DROP CONSTRAINT IF EXISTS universal_audio_assets_source_check;

ALTER TABLE universal_audio_assets 
DROP CONSTRAINT IF EXISTS universal_audio_assets_type_check;

-- Neue Constraints mit erweiterten Werten für VoicePro
ALTER TABLE universal_audio_assets 
ADD CONSTRAINT universal_audio_assets_source_check 
CHECK (source = ANY (ARRAY['upload'::text, 'stock'::text, 'generated'::text, 'voicepro'::text]));

ALTER TABLE universal_audio_assets 
ADD CONSTRAINT universal_audio_assets_type_check 
CHECK (type = ANY (ARRAY['music'::text, 'sound_effect'::text, 'voiceover'::text, 'enhanced'::text]));