/**
 * Picture Studio — provider capability matrix (CLIENT view).
 *
 * Deliberately a re-export of the server module so UI and Edge Function can
 * never drift: `supabase/functions/_shared/pictureModelCapabilities.ts` is the
 * single source of truth (pure data + helpers, no Deno APIs).
 */

export {
  PICTURE_MODEL_CAPABILITIES,
  capabilityFor,
  acceptsReferences,
  closestAspectRatioFor,
  clampExact,
  resolveSize,
} from '../../supabase/functions/_shared/pictureModelCapabilities';

export type {
  PictureTier,
  ReferenceField,
  ExactSizeRange,
  PictureModelCapability,
  ResolvedSize,
} from '../../supabase/functions/_shared/pictureModelCapabilities';
