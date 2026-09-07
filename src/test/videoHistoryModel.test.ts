import { describe, expect, it } from 'vitest';

import {
  enhanceRunToHistoryItem,
  generationToHistoryItem,
  mergeHistory,
} from '@/lib/videoHistory/model';

const enhanceRow = (status: string) => ({
  id: `run-${status}`,
  model_id: 'topaz-video-upscale',
  status,
  output_url: null,
  error_message: null,
  source_duration_seconds: 12,
  user_price_eur: '4.20',
  created_at: '2026-09-07T10:00:00.000Z',
});

describe('video history model', () => {
  it('never presents a run that is still being saved as failed', () => {
    for (const status of ['provider_output_ready', 'asset_staging', 'asset_persisting', 'asset_persist_failed']) {
      expect(enhanceRunToHistoryItem(enhanceRow(status), 'Upscale').status).toBe('processing');
    }
  });

  it('keeps a run under review visible as running, not lost', () => {
    expect(enhanceRunToHistoryItem(enhanceRow('manual_review'), 'Upscale').status).toBe('processing');
  });

  it('maps terminal states', () => {
    expect(enhanceRunToHistoryItem(enhanceRow('completed'), 'Upscale').status).toBe('completed');
    expect(enhanceRunToHistoryItem(enhanceRow('provider_failed'), 'Upscale').status).toBe('failed');
  });

  it('merges both pipelines newest first', () => {
    const generation = generationToHistoryItem({
      id: 'gen-1',
      prompt: 'a cat',
      model: 'sora-2-pro',
      status: 'completed',
      video_url: 'https://example.com/v.mp4',
      error_message: null,
      duration_seconds: 8,
      total_cost_euros: 2,
      created_at: '2026-09-07T12:00:00.000Z',
    });
    const merged = mergeHistory([enhanceRunToHistoryItem(enhanceRow('completed'), 'Upscale'), generation]);
    expect(merged.map((i) => i.kind)).toEqual(['generation', 'enhancement']);
  });
});
