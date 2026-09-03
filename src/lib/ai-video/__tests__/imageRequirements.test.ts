import { describe, it, expect } from 'vitest';
import {
  checkImageDimensions,
  describeImageViolation,
  describeProviderImageError,
  imageRequirementsFor,
} from '../imageRequirements';

const seedance = imageRequirementsFor('seedance-2-5');

describe('video input-image contract', () => {
  it('rejects the exact production failure (152×515)', () => {
    const r = checkImageDimensions({ width: 152, height: 515 }, seedance);
    expect(r.ok).toBe(false);
    expect(r.violation).toBe('too_small');
    expect(describeImageViolation(r, 'de', 'Seedance 2.5')).toContain('152×515');
  });

  it('enforces the 300 px width boundary', () => {
    expect(checkImageDimensions({ width: 299, height: 400 }, seedance).ok).toBe(false);
    expect(checkImageDimensions({ width: 400, height: 400 }, seedance).ok).toBe(true);
  });

  it('enforces the aspect band 0.40 – 2.50', () => {
    const narrow = checkImageDimensions({ width: 300, height: 1000 }, seedance);
    expect(narrow.ok).toBe(false);
    expect(narrow.violation).toBe('aspect_out_of_range');
    expect(checkImageDimensions({ width: 400, height: 1000 }, seedance).ok).toBe(true);
    expect(checkImageDimensions({ width: 1000, height: 400 }, seedance).ok).toBe(true);
    expect(checkImageDimensions({ width: 1000, height: 380 }, seedance).ok).toBe(false);
  });

  it('flags oversized files', () => {
    const r = checkImageDimensions({ width: 800, height: 800, bytes: 20 * 1024 * 1024 }, seedance);
    expect(r.violation).toBe('too_large');
  });

  it('kling-omni shares the same band', () => {
    const kling = imageRequirementsFor('kling-omni', 'kling');
    expect(checkImageDimensions({ width: 152, height: 515 }, kling).ok).toBe(false);
  });

  it('maps raw provider errors to readable sentences', () => {
    const raw = 'ModelArk create failed (400): {"error":{"code":"InvalidParameter","message":"expected the width to be at least 300px","param":"image_url"}}';
    const de = describeProviderImageError(raw, 'de');
    expect(de).not.toContain('InvalidParameter');
    expect(de.toLowerCase()).toContain('bild');
    expect(describeProviderImageError('output video may be related to copyright restrictions', 'en'))
      .toContain('copyright');
    expect(describeProviderImageError('boom', 'en')).toContain('refunded');
  });
});
