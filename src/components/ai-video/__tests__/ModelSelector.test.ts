import { describe, expect, it } from 'vitest';
import { AI_VIDEO_TOOLKIT_MODELS } from '@/config/aiVideoModelRegistry';
import { includeSelectedModel } from '../ModelSelector';

describe('ModelSelector controlled selection', () => {
  it('keeps Seedance 2.5 visible when a filtered list temporarily omits it', () => {
    const filtered = AI_VIDEO_TOOLKIT_MODELS.filter((model) => model.id !== 'seedance-2-5');
    const list = includeSelectedModel(filtered, 'seedance-2-5');

    expect(list.find((model) => model.id === 'seedance-2-5')?.name).toBe('Seedance 2.5');
  });

  it('does not duplicate a selected model already present', () => {
    const list = includeSelectedModel(AI_VIDEO_TOOLKIT_MODELS, 'seedance-2-5');
    expect(list.filter((model) => model.id === 'seedance-2-5')).toHaveLength(1);
  });
});