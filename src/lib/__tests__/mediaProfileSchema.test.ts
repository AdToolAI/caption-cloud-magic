import { describe, it, expect } from 'vitest';
import { mediaProfileConfigSchema } from '../mediaProfileSchema';

describe('mediaProfileConfigSchema', () => {
  it('should validate correct config', () => {
    const config = {
      aspect: '16:9',
      width: 1920,
      height: 1080,
      fitMode: 'cover',
      sizeLimitMb: 100,
      type: 'image'
    };
    
    const result = mediaProfileConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject mismatched aspect ratio', () => {
    const config = {
      aspect: '16:9',
      width: 1000,
      height: 1000,
      fitMode: 'cover',
      sizeLimitMb: 100,
      type: 'image'
    };
    
    const result = mediaProfileConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should require video config for video type', () => {
    const config = {
      aspect: '9:16',
      width: 1080,
      height: 1920,
      fitMode: 'cover',
      sizeLimitMb: 200,
      type: 'video'
    };
    
    const result = mediaProfileConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should validate video config', () => {
    const config = {
      aspect: '9:16',
      width: 1080,
      height: 1920,
      fitMode: 'cover',
      sizeLimitMb: 200,
      type: 'video',
      video: {
        maxDurationSec: 60,
        minDurationSec: 3,
        targetFps: 30,
        targetBitrateMbps: 8,
        codec: 'h264',
        audioCodec: 'aac',
        audioKbps: 128
      }
    };
    
    const result = mediaProfileConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
