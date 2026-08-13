import { describe, it, expect } from 'vitest';

import {
  PROVIDER_MATRIX,
  clampProviderDuration,
  getLipsyncProviders,
  getProviderDurations,
  getProviderLabel,
  providerHasNativeAudio,
  providerHasNativeLipSync,
  providerIsLipsyncCertified,
  providerMaxSpeakers,
  providerSupportedLanguages,
  providerSupportsLipsync,
  providerSupportsMultiSpeaker,
  snapDurationToProvider,
} from '../providerMatrix';
import { PROVIDER_MATRIX as BACKEND_MATRIX } from '../../../../supabase/functions/_shared/provider-matrix';
import { clampDialogMasterDuration, DIALOG_MASTER_PROVIDERS } from '@/lib/video-composer/lipsyncMasterProvider';
import { PROVIDER_CAPS, getProviderDurations as adapterDurations } from '@/lib/video-composer/providerCapabilities';

describe('providerMatrix — client/server parity', () => {
  it('mirrors exactly the same provider keys', () => {
    expect(Object.keys(BACKEND_MATRIX).sort()).toEqual(Object.keys(PROVIDER_MATRIX).sort());
  });

  it('mirrors every field for every provider', () => {
    for (const [src, entry] of Object.entries(PROVIDER_MATRIX)) {
      expect({ source: src, ...JSON.parse(JSON.stringify(BACKEND_MATRIX[src])) }).toEqual({
        source: src,
        ...JSON.parse(JSON.stringify(entry)),
      });
    }
  });
});

describe('providerMatrix — semantic regression (pre-v430 values)', () => {
  it('keeps the known duration buckets', () => {
    expect(getProviderDurations('ai-happyhorse')).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(getProviderDurations('ai-seedance25')).toEqual([4, 5, 8, 10, 12, 15, 20, 25, 30]);
    expect(getProviderDurations('ai-veo')).toEqual([4, 6, 8]);
    // unknown source falls back to the default provider buckets
    expect(getProviderDurations('ai-unknown')).toEqual(getProviderDurations('ai-hailuo'));
    expect(getProviderDurations(null)).toEqual(getProviderDurations('ai-hailuo'));
  });

  it('keeps labels and speaker caps', () => {
    expect(getProviderLabel('ai-seedance25')).toBe('Seedance 2.5');
    expect(getProviderLabel(null)).toBe('Hailuo');
    expect(getProviderLabel('ai-nonexistent')).toBe('ai-nonexistent');
    expect(providerMaxSpeakers('ai-kling-omni')).toBe(2);
    expect(providerMaxSpeakers('ai-hailuo')).toBe(Infinity);
    expect(providerMaxSpeakers(null)).toBe(Infinity);
  });

  it('keeps native audio / native lip-sync / language flags', () => {
    expect(providerHasNativeLipSync('ai-kling-omni')).toBe(true);
    expect(providerHasNativeAudio('ai-kling-omni')).toBe(true);
    expect(providerSupportedLanguages('ai-kling-omni')).toEqual(['de', 'en', 'es']);
    expect(providerHasNativeLipSync('ai-hailuo')).toBe(false);
    expect(providerSupportedLanguages('ai-hailuo')).toEqual([]);
  });

  it('keeps multi-speaker flags', () => {
    expect(providerSupportsMultiSpeaker('ai-hailuo')).toBe(true);
    expect(providerSupportsMultiSpeaker('ai-happyhorse')).toBe(true);
    expect(providerSupportsMultiSpeaker('ai-veo')).toBe(false);
    expect(providerSupportsMultiSpeaker(null)).toBe(false);
  });
});

describe('providerMatrix — lip-sync capability (v425 fail-closed)', () => {
  it('only HappyHorse and Hailuo are certified master plates', () => {
    expect(getLipsyncProviders().filter((s) => providerIsLipsyncCertified(s)).sort()).toEqual(
      ['ai-hailuo', 'ai-happyhorse'],
    );
    expect([...DIALOG_MASTER_PROVIDERS].sort()).toEqual(['ai-hailuo', 'ai-happyhorse']);
  });

  it('rejects every non-certified provider', () => {
    for (const src of ['ai-seedance25', 'ai-seedance', 'ai-kling', 'ai-wan', 'ai-luma', 'ai-veo', 'ai-runway']) {
      expect(providerIsLipsyncCertified(src)).toBe(false);
    }
    expect(providerIsLipsyncCertified(null)).toBe(false);
    expect(providerIsLipsyncCertified('nonsense')).toBe(false);
  });

  it('native one-call lip-sync is a capability, not a certification', () => {
    expect(providerSupportsLipsync('ai-kling-omni')).toBe(true);
    expect(providerIsLipsyncCertified('ai-kling-omni')).toBe(false);
  });

  it('exposes no pipeline-mode or plate-source semantics', () => {
    for (const entry of Object.values(PROVIDER_MATRIX)) {
      expect(entry).not.toHaveProperty('pipelineMode');
      expect(entry).not.toHaveProperty('lipsyncPlateSource');
    }
  });
});

describe('providerMatrix — duration clamping', () => {
  it('keeps the Hailuo 6/10 buckets', () => {
    for (const [input, expected] of [
      [1, 6],
      [5, 6],
      [6, 6],
      [7, 6],
      [9, 6],
      [9.2, 10],
      [10, 10],
      [13, 10],
    ] as const) {
      expect(clampProviderDuration('ai-hailuo', input)).toBe(expected);
    }
  });

  it('keeps the HappyHorse 3–15 range', () => {
    expect(clampProviderDuration('ai-happyhorse', 1)).toBe(3);
    expect(clampProviderDuration('ai-happyhorse', 7.2)).toBe(8);
    expect(clampProviderDuration('ai-happyhorse', 30)).toBe(15);
  });

  it('matches the legacy clampDialogMasterDuration exactly', () => {
    for (const provider of DIALOG_MASTER_PROVIDERS) {
      for (let d = 0; d <= 32; d += 0.5) {
        expect(clampProviderDuration(provider, d)).toBe(clampDialogMasterDuration(provider, d));
      }
    }
  });

  it('snaps other providers into their bucket list', () => {
    expect(snapDurationToProvider(7, 'ai-veo')).toEqual({ duration: 8, changed: true });
    expect(snapDurationToProvider(8, 'ai-veo')).toEqual({ duration: 8, changed: false });
    expect(snapDurationToProvider(60, 'ai-seedance25')).toEqual({ duration: 30, changed: true });
    expect(snapDurationToProvider(1, 'ai-seedance25')).toEqual({ duration: 4, changed: true });
  });
});

describe('providerCapabilities adapter', () => {
  it('is a pure view onto the matrix', () => {
    expect(PROVIDER_CAPS).toBe(PROVIDER_MATRIX);
    expect(adapterDurations('ai-veo')).toEqual(getProviderDurations('ai-veo'));
  });

  it('matrix entries are frozen (no mutation side effects)', () => {
    expect(Object.isFrozen(PROVIDER_MATRIX)).toBe(true);
    expect(Object.isFrozen(PROVIDER_MATRIX['ai-hailuo'])).toBe(true);
  });
});
