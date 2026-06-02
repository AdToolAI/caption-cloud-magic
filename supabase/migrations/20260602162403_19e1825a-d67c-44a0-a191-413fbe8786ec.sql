-- Recovery: reset two stuck dialog-lipsync scenes after the 3-speaker
-- face-gate + stitch-loop hardening.

-- 1) afbfd804…/88fcd40d… were the actively failing 3-speaker scenes whose
--    Sync.so calls returned the opaque "unknown error" because the plate
--    cropped the male heads out of frame. Reset to pristine pending so the
--    user can re-render the clip and retry lipsync with the new target-face
--    gate active.
UPDATE public.composer_scenes
SET
  lip_sync_status = NULL,
  twoshot_stage = NULL,
  clip_error = NULL,
  dialog_shots = NULL,
  updated_at = now()
WHERE id IN (
  'afbfd804-0b01-4557-bba2-3ac4e2b7a1a0',
  '88fcd40d-e7d7-4ece-8173-c0009642fc14'
);

-- 2) 95f7e7a2… is a legacy v4 scene that was stuck in the
--    render-dialog-stitch 409 loop because its 3rd turn was degraded=true
--    without an output_url. Mark it terminally failed so the new
--    poll-dialog-shots multi-speaker gate doesn't keep dispatching it.
UPDATE public.composer_scenes
SET
  lip_sync_status = 'failed',
  twoshot_stage = 'failed',
  clip_error = 'multi_speaker_degraded_without_output_url: bitte Szene neu rendern',
  updated_at = now()
WHERE id = '95f7e7a2-5ed1-4f09-9e6f-d65c46c2e44b';