import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { premiumCapabilityRequired, isPremiumErrorCode } from '@/lib/videoEnhance/premium';

/**
 * The client mirror only powers badges and the upgrade modal — the server
 * enforces the same rules authoritatively. Both must classify identically,
 * otherwise a customer sees an unlocked control and gets a 403.
 */
describe('Video Enhance premium capability mirror', () => {
  it('leaves vCube Standard at 24/30/60 fps ungated', () => {
    for (const fps of [24, 30, 60, null]) {
      expect(premiumCapabilityRequired({ provider: 'replicate', tier: 'standard', fps })).toBeNull();
    }
  });

  it('gates vCube Pro with a Standard fallback', () => {
    expect(premiumCapabilityRequired({ provider: 'replicate', tier: 'pro', fps: 30 })).toEqual({
      code: 'VCUBE_PRO_PREMIUM_REQUIRED',
      fallbackTier: 'standard',
    });
  });

  it('gates vCube 120 fps with a 60 fps fallback', () => {
    expect(premiumCapabilityRequired({ provider: 'replicate', tier: 'standard', fps: 120 })).toEqual({
      code: 'VCUBE_120FPS_PREMIUM_REQUIRED',
      fallbackFps: 60,
    });
  });

  it('keeps Topaz gated as a whole engine', () => {
    expect(premiumCapabilityRequired({ provider: 'topaz', tier: 'standard', fps: 30 })).toEqual({
      code: 'TOPAZ_PREMIUM_REQUIRED',
      fallbackModelId: 'bytedance-vcube',
    });
  });

  it('recognises exactly the three server error codes', () => {
    expect(isPremiumErrorCode('VCUBE_PRO_PREMIUM_REQUIRED')).toBe(true);
    expect(isPremiumErrorCode('VCUBE_120FPS_PREMIUM_REQUIRED')).toBe(true);
    expect(isPremiumErrorCode('TOPAZ_PREMIUM_REQUIRED')).toBe(true);
    expect(isPremiumErrorCode('INSUFFICIENT_CREDITS')).toBe(false);
    expect(isPremiumErrorCode(undefined)).toBe(false);
  });

  it('uses the same premium rule set as the server helper', () => {
    const server = readFileSync('supabase/functions/_shared/video-enhance-premium.ts', 'utf8');
    for (const code of [
      'TOPAZ_PREMIUM_REQUIRED',
      'VCUBE_PRO_PREMIUM_REQUIRED',
      'VCUBE_120FPS_PREMIUM_REQUIRED',
    ]) {
      expect(server).toContain(code);
    }
    expect(server).toContain('PREMIUM_FPS_THRESHOLD = 60');
    // No second premium system: only the one entitlement helper decides.
    expect(server).not.toMatch(/isPremium\b/);
  });
});
