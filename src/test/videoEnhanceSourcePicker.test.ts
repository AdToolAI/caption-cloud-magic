import { describe, expect, it } from 'vitest';
import {
  canonicalStorageKey,
  dedupeCanonicalAssets,
  fromCreationRow,
  fromGenerationRow,
  mergeCanonicalAssets,
  sortByRecency,
} from '@/lib/videoEnhance/canonicalVideoAsset';

const generation = (over: Record<string, unknown> = {}) =>
  fromGenerationRow({
    id: 'gen-1',
    video_url: 'https://x.supabase.co/storage/v1/object/public/ai-videos/a.mp4?token=1',
    prompt: 'Office scene',
    model: 'seedance-2.5',
    resolution: '720p',
    duration_seconds: 8,
    created_at: '2026-09-01T10:00:00Z',
    ...over,
  })!;

const creation = (over: Record<string, unknown> = {}) =>
  fromCreationRow({
    id: 'cre-1',
    output_url: 'https://x.supabase.co/storage/v1/object/public/ai-videos/a.mp4?token=2',
    framerate: 24,
    metadata: { generation_id: 'gen-1', title: 'Office scene' },
    created_at: '2026-09-02T10:00:00Z',
    ...over,
  })!;

describe('canonical video assets', () => {
  it('normalises storage keys independent of signature/query', () => {
    expect(canonicalStorageKey('https://x.co/storage/v1/object/public/b/c.mp4?token=abc')).toBe(
      'b/c.mp4',
    );
  });

  it('prefers the persisted creation over the raw generation', () => {
    const merged = mergeCanonicalAssets([generation()], [creation()]);
    expect(merged).toHaveLength(1);
    expect(merged[0].assetType).toBe('creation');
    expect(merged[0].assetId).toBe('cre-1');
  });

  it('deduplicates via storage key when no lineage id exists', () => {
    const merged = dedupeCanonicalAssets([
      generation(),
      creation({ metadata: { title: 'Office scene' } }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].assetType).toBe('creation');
  });

  it('keeps distinct videos apart', () => {
    const other = creation({
      id: 'cre-2',
      output_url: 'https://x.supabase.co/storage/v1/object/public/ai-videos/b.mp4',
      metadata: { source: 'upload', title: 'Upload' },
    });
    const merged = mergeCanonicalAssets([generation()], [creation(), other]);
    expect(merged).toHaveLength(2);
  });

  it('marks uploads as unverified display metadata', () => {
    const upload = creation({
      id: 'cre-up',
      output_url: 'https://x.supabase.co/storage/v1/object/public/composer-uploads/u/v.mp4',
      metadata: { source: 'upload', width: 1280, height: 720, metadata_verified: false },
    });
    expect(upload.origin).toBe('uploaded');
    expect(upload.metadataVerified).toBe(false);
  });

  it('sorts newest first with a stable tiebreaker', () => {
    const a = generation({ id: 'gen-a', created_at: '2026-09-03T00:00:00Z' });
    const b = generation({
      id: 'gen-b',
      video_url: 'https://x.supabase.co/storage/v1/object/public/ai-videos/b.mp4',
      created_at: '2026-09-03T00:00:00Z',
    });
    const c = generation({
      id: 'gen-c',
      video_url: 'https://x.supabase.co/storage/v1/object/public/ai-videos/c.mp4',
      created_at: '2026-09-05T00:00:00Z',
    });
    const sorted = sortByRecency([a, b, c]).map((x) => x.assetId);
    expect(sorted).toEqual(['gen-c', 'gen-a', 'gen-b']);
  });
});
