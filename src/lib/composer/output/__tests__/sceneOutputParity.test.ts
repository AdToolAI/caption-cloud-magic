import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveSceneOutput, resolveSceneSourcePlate } from '../resolveSceneOutput';

/**
 * v430 Step 1 — output semantics contract.
 * The resolver stays pure and byte-identical across client and server.
 */
describe('resolveSceneOutput contract', () => {
  it('client and server mirror are byte-identical', () => {
    const root = process.cwd();
    const client = readFileSync(resolve(root, 'src/lib/composer/output/resolveSceneOutput.ts'), 'utf8');
    const server = readFileSync(resolve(root, 'supabase/functions/_shared/resolve-scene-output.ts'), 'utf8');
    expect(server).toBe(client);
  });

  it('stays strictly pure (no supabase, no fetch, no writes)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/composer/output/resolveSceneOutput.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"].*supabase/i);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
  });

  it('prefers the processed output when lip-sync ran', () => {
    const out = resolveSceneOutput({
      base_video_url: 'plate.mp4',
      processed_video_url: 'muxed.mp4',
      clip_url: 'muxed.mp4',
      lip_sync_status: 'applied',
    });
    expect(out.effectiveUrl).toBe('muxed.mp4');
    expect(out.baseUrl).toBe('plate.mp4');
    expect(out.source).toBe('processed');
    expect(out.isLipsynced).toBe(true);
  });

  it('falls back to the plate when no lip-sync happened', () => {
    const out = resolveSceneOutput({ base_video_url: 'plate.mp4', clip_url: 'plate.mp4' });
    expect(out.effectiveUrl).toBe('plate.mp4');
    expect(out.processedUrl).toBeNull();
    expect(out.isLipsynced).toBe(false);
  });

  it('migrates legacy rows: applied scene with only clip_url', () => {
    const out = resolveSceneOutput({ clip_url: 'legacy-muxed.mp4', lip_sync_status: 'applied' });
    expect(out.processedUrl).toBe('legacy-muxed.mp4');
    expect(out.effectiveUrl).toBe('legacy-muxed.mp4');
    expect(out.isLipsynced).toBe(true);
  });

  it('migrates legacy rows: plate in lip_sync_source_clip_url', () => {
    const out = resolveSceneOutput({
      clip_url: 'muxed.mp4',
      lip_sync_source_clip_url: 'plate.mp4',
      lip_sync_status: 'applied',
    });
    expect(out.baseUrl).toBe('plate.mp4');
    expect(out.processedUrl).toBe('muxed.mp4');
    expect(resolveSceneSourcePlate({
      clip_url: 'muxed.mp4',
      lip_sync_source_clip_url: 'plate.mp4',
      lip_sync_status: 'applied',
    })).toBe('plate.mp4');
  });

  it('legacy non-lipsync row: clip_url is the plate', () => {
    expect(resolveSceneSourcePlate({ clip_url: 'plate.mp4' })).toBe('plate.mp4');
  });

  it('falls back to the upload for uploaded scenes', () => {
    const out = resolveSceneOutput({ upload_url: 'user.mp4' });
    expect(out.effectiveUrl).toBe('user.mp4');
    expect(out.source).toBe('upload');
  });

  it('handles empty / null scenes', () => {
    expect(resolveSceneOutput(null).source).toBe('none');
    expect(resolveSceneOutput({ clip_url: '   ' }).effectiveUrl).toBeNull();
  });

  it('accepts the camelCase client scene model', () => {
    const out = resolveSceneOutput({ processedVideoUrl: 'p.mp4', baseVideoUrl: 'b.mp4' });
    expect(out.effectiveUrl).toBe('p.mp4');
    expect(out.baseUrl).toBe('b.mp4');
  });
});
