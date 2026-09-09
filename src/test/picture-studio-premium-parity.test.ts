import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PICTURE_FALLBACK_ENHANCE_MODEL,
  PICTURE_FALLBACK_TIER,
  PICTURE_PREMIUM_ENHANCE_MODELS,
  PICTURE_SPECIALIST_TIERS,
  isPremiumEnhanceModel,
  isSpecialistTier,
} from '@/lib/pictureStudio/premium';

const server = readFileSync('supabase/functions/_shared/picture-studio-premium.ts', 'utf8');

const listFromServer = (name: string): string[] => {
  const block = server.split(`export const ${name} = [`)[1]?.split('] as const')[0] ?? '';
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

describe('Picture Studio premium parity', () => {
  it('specialist tiers match the server list', () => {
    expect(listFromServer('PICTURE_SPECIALIST_TIERS')).toEqual([...PICTURE_SPECIALIST_TIERS]);
  });

  it('premium enhance models match the server list', () => {
    expect(listFromServer('PICTURE_PREMIUM_ENHANCE_MODELS')).toEqual([...PICTURE_PREMIUM_ENHANCE_MODELS]);
  });

  it('fallbacks match the server constants', () => {
    expect(server).toContain(`PICTURE_FALLBACK_TIER = "${PICTURE_FALLBACK_TIER}"`);
    expect(server).toContain(`PICTURE_FALLBACK_ENHANCE_MODEL = "${PICTURE_FALLBACK_ENHANCE_MODEL}"`);
  });

  it('core models and Clarity stay free', () => {
    for (const tier of ['standard', 'gptimage', 'ideogram', 'recraft', 'qwen']) {
      expect(isSpecialistTier(tier)).toBe(false);
    }
    expect(isPremiumEnhanceModel('clarity-pro')).toBe(false);
    expect(isPremiumEnhanceModel('topaz-image-upscale')).toBe(true);
  });
});
