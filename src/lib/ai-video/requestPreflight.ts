/**
 * Client mirror of the shared video request contract. The rules live in
 * `supabase/functions/_shared/videoRequestPreflight.ts` — this module only
 * re-exports them so frontend and backend refuse the exact same request.
 */
export {
  PROMPT_CHAR_LIMITS,
  FRAME_REFERENCE_EXCLUSIVE,
  promptCharLimit,
  preflightVideoRequest,
  describePreflightViolation,
  type PreflightInput,
  type PreflightLocale,
  type PreflightResult,
  type PreflightViolation,
} from '../../../supabase/functions/_shared/videoRequestPreflight';
