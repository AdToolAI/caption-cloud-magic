import { describe, it, expect } from 'vitest';
import { isLipSyncIntentional, isLipSyncIntentionalRow } from '../lipSyncIntent';

describe('isLipSyncIntentional', () => {
  it('empty scene is not intentional', () => {
    expect(isLipSyncIntentional({})).toBe(false);
  });

  it('explicit toggle wins', () => {
    expect(isLipSyncIntentional({ lipSyncWithVoiceover: true })).toBe(true);
  });

  it('engineOverride=cinematic-sync is opt-in', () => {
    expect(isLipSyncIntentional({ engineOverride: 'cinematic-sync' })).toBe(true);
  });

  it('dialogMode is opt-in', () => {
    expect(isLipSyncIntentional({ engineOverride: 'auto', dialogMode: true })).toBe(true);
  });

  it('toggle wins over broll override', () => {
    expect(isLipSyncIntentional({ engineOverride: 'broll', lipSyncWithVoiceover: true })).toBe(true);
  });

  it('regression: cast+dialog+hailuo without any flag is NOT intentional', () => {
    // Simulates the bug: dialog script + cast on Hailuo/HappyHorse used to
    // auto-force cinematic-sync. It must not.
    expect(isLipSyncIntentional({ engineOverride: 'auto' })).toBe(false);
  });
});

describe('isLipSyncIntentionalRow (snake_case)', () => {
  it('mirrors camelCase logic', () => {
    expect(isLipSyncIntentionalRow({ lip_sync_with_voiceover: true })).toBe(true);
    expect(isLipSyncIntentionalRow({ engine_override: 'sync-segments' })).toBe(true);
    expect(isLipSyncIntentionalRow({ engine_override: 'auto' })).toBe(false);
    expect(isLipSyncIntentionalRow(null)).toBe(false);
  });
});
