/**
 * Picture Studio — format resolution (CLIENT view).
 *
 * Re-export of the shared module so UI and Edge Function resolve a requested
 * format identically. Never fork this logic.
 */

export {
  SOURCE_FORMAT,
  ratioOfLabel,
  formatRatioLabel,
  supportsExactSize,
  nearestSupportedLabel,
  hasUsableSource,
  resolveRequestedFormat,
} from '../../supabase/functions/_shared/pictureFormatResolution';

export type {
  SourceDimensions,
  FormatAdjustment,
  ResolvedFormat,
} from '../../supabase/functions/_shared/pictureFormatResolution';
