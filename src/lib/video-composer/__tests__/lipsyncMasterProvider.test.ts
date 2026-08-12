import { describe, expect, it } from 'vitest';
import {
  clampDialogMasterDuration,
  resolveDialogMasterProvider,
} from '../lipsyncMasterProvider';

describe('dialog master provider routing', () => {
  it('keeps Seedance 2.5 and its selected duration', () => {
    const provider = resolveDialogMasterProvider('ai-seedance25');
    expect(provider).toBe('ai-seedance25');
    expect(clampDialogMasterDuration(provider, 24)).toBe(24);
  });

  it('clamps Seedance 2.5 to its 4–30 second range', () => {
    expect(clampDialogMasterDuration('ai-seedance25', 2)).toBe(4);
    expect(clampDialogMasterDuration('ai-seedance25', 35)).toBe(30);
  });

  it('falls back only for a provider outside the certified allowlist', () => {
    expect(resolveDialogMasterProvider('ai-veo')).toBe('ai-happyhorse');
  });
});