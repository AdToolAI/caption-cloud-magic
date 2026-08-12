import { describe, expect, it } from 'vitest';
import {
  DIALOG_MASTER_PROVIDERS,
  clampDialogMasterDuration,
  isLipsyncCertifiedProvider,
  resolveDialogMasterProvider,
} from '../lipsyncMasterProvider';

describe('dialog master provider routing (v425)', () => {
  it('certifies only HappyHorse and Hailuo', () => {
    expect([...DIALOG_MASTER_PROVIDERS]).toEqual(['ai-happyhorse', 'ai-hailuo']);
    expect(isLipsyncCertifiedProvider('ai-seedance25')).toBe(false);
    expect(isLipsyncCertifiedProvider('ai-kling')).toBe(false);
  });

  it('keeps a certified provider and clamps its duration', () => {
    expect(resolveDialogMasterProvider('ai-hailuo')).toBe('ai-hailuo');
    expect(clampDialogMasterDuration('ai-hailuo', 24)).toBe(10);
    expect(clampDialogMasterDuration('ai-happyhorse', 24)).toBe(15);
    expect(clampDialogMasterDuration('ai-happyhorse', 2)).toBe(3);
  });

  it('falls back to HappyHorse for any non-certified provider', () => {
    expect(resolveDialogMasterProvider('ai-veo')).toBe('ai-happyhorse');
    expect(resolveDialogMasterProvider('ai-seedance25')).toBe('ai-happyhorse');
  });
});
