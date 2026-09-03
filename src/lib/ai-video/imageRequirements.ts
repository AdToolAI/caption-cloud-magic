/**
 * Client mirror of the shared video input-image contract. The rules live in
 * `supabase/functions/_shared/videoImageRequirements.ts` — this module only
 * re-exports them and adds the browser-side measurement helper.
 */
export {
  imageRequirementsFor,
  checkImageDimensions,
  describeImageViolation,
  describeProviderImageError,
  parseImageSize,
  type ImageRequirements,
  type ImageDimensions,
  type ImageCheckResult,
  type ImageViolation,
  type ImageLocale,
} from '../../../supabase/functions/_shared/videoImageRequirements';

import {
  checkImageDimensions,
  describeImageViolation,
  imageRequirementsFor,
  type ImageLocale,
} from '../../../supabase/functions/_shared/videoImageRequirements';

/** Reads the pixel dimensions of a local File in the browser. */
export function measureImageFile(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image_unreadable'));
    };
    img.src = url;
  });
}

/**
 * Validates a picked file against the active model. Returns null when the
 * file is fine, or a localized message explaining why it was rejected.
 * Unreadable files pass through — the provider stays the final authority.
 */
export async function validateImageForModel(
  file: File,
  opts: { modelId?: string; family?: string; modelLabel?: string; locale?: ImageLocale },
): Promise<string | null> {
  const requirements = imageRequirementsFor(opts.modelId, opts.family);
  let dims: { width: number; height: number };
  try {
    dims = await measureImageFile(file);
  } catch {
    return null;
  }
  const result = checkImageDimensions({ ...dims, bytes: file.size }, requirements);
  if (result.ok) return null;
  return describeImageViolation(result, opts.locale ?? 'en', opts.modelLabel ?? 'This model');
}
