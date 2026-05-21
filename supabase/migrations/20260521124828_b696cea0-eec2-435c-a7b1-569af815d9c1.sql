-- Reset Two-Shot Scene 88d3a20f for re-render with the new per-turn lip-sync windows
-- + remove stale TTS audio that contained the appended " ..." text artifact.
UPDATE public.composer_scenes
SET
  clip_url = COALESCE(lip_sync_source_clip_url, clip_url),
  lip_sync_status = 'pending',
  lip_sync_applied_at = NULL,
  twoshot_stage = NULL,
  clip_error = NULL,
  replicate_prediction_id = NULL,
  audio_plan = audio_plan - 'twoshot',
  character_audio_url = NULL,
  updated_at = now()
WHERE id = '88d3a20f-f177-47a9-a84f-8fca1e58e51b';

-- Drop the merged voiceover so compose-twoshot-audio regenerates without the
-- appended " ..." artifact on short utterances.
DELETE FROM public.scene_audio_clips
WHERE scene_id = '88d3a20f-f177-47a9-a84f-8fca1e58e51b'
  AND kind = 'voiceover';

-- Refund the 144 credits previously charged for the broken two-pass run.
UPDATE public.wallets
SET balance = COALESCE(balance, 0) + 144,
    updated_at = now()
WHERE user_id = '8948d3d9-2c5e-4405-9e9c-1624448e7189';