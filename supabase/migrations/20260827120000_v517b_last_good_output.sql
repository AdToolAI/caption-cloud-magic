-- ═══════════════════════════════════════════════════════════════════════════
-- V517-B — LAST-KNOWN-GOOD DISPLAY POINTER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Starting a rerender clears the current-run output triple and, for a run that
-- then pauses at `awaiting_manual_face_map` or fails, leaves the scene card
-- with nothing to show. The previous successful result still exists — after
-- V518 it lives at an immutable, generation-scoped key that the new generation
-- cannot address — but nothing points at it.
--
-- These two columns are that pointer, and nothing more:
--
--   · DISPLAY ONLY. They are never read by readiness, by the provider
--     planners, by `resolveSceneOutput` or by any pipeline-state derivation.
--     A contract test enforces that; the whole defect this fixes came from one
--     concept (current output) carrying two meanings.
--   · Written by exactly ONE writer, the rerender path of `hardResetScene`.
--     No callback writes them, so a stale generation-14 callback arriving
--     after generation 15 has started cannot corrupt the pointer.
--
-- `last_good_output_generation` is provenance for the UI ("previous result,
-- generation 14") and for cleanup. It is NOT an authority: the URL alone is
-- what gets displayed.
--
-- Additive, nullable, no backfill. Existing scenes gain a fallback at their
-- first post-V518 rerender rather than retroactively — a pre-V518 output has
-- no provable durable home and is deliberately never promoted.

ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS last_good_output_url        text,
  ADD COLUMN IF NOT EXISTS last_good_output_generation integer;

COMMENT ON COLUMN public.composer_scenes.last_good_output_url IS
  'V517-B: display-only fallback to the previous run''s durable output. Never current-run authority, never a provider input.';
COMMENT ON COLUMN public.composer_scenes.last_good_output_generation IS
  'V517-B: the generation that produced last_good_output_url, parsed from its durable key.';
