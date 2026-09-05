/**
 * Picture Studio — intent hints (CLIENT view).
 *
 * Re-export of the shared module so UI recommendations and any server-side
 * check use exactly the same detection.
 */

export {
  detectTransparencyWish,
  detectEditIntent,
} from '../../supabase/functions/_shared/pictureIntentHints';

export type { PictureHintKind } from '../../supabase/functions/_shared/pictureIntentHints';
