import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  ORDER_REJECTION_CODES,
  enhanceErrorKeyForCode,
  engineErrorText,
  toEnhanceLang,
} from '@/lib/videoEnhance/engineErrors';

const read = (path: string) => readFileSync(path, 'utf8');

describe('video enhance — engine rejections read as sentences, in the user language', () => {
  it('maps the upscale gate to a localized sentence and honours the reason', () => {
    for (const lang of ['en', 'de', 'es'] as const) {
      const noOp = engineErrorText('VIDEO_ENHANCE_NOT_AN_UPSCALE', 'raw', lang, 'no_op');
      const down = engineErrorText('VIDEO_ENHANCE_NOT_AN_UPSCALE', 'raw', lang, 'downscale');
      expect(noOp).not.toBe('raw');
      expect(down).not.toBe('raw');
      expect(noOp).not.toBe(down);
    }
  });

  it('never shows raw JSON or English to a German or Spanish user for known codes', () => {
    const codes = [
      'VIDEO_ENHANCE_NOT_AN_UPSCALE',
      'TARGET_FRAME_UNREACHABLE',
      'MODEL_LOCKED',
      'INSUFFICIENT_CREDITS',
      'PROVIDER_REJECTED',
      'RUN_CONFLICT',
      'UNPRICEABLE',
      'SOURCE_UNREADABLE',
    ];
    for (const code of codes) {
      const en = engineErrorText(code, '{"error":"x"}', 'en');
      const de = engineErrorText(code, '{"error":"x"}', 'de');
      const es = engineErrorText(code, '{"error":"x"}', 'es');
      expect(en).not.toContain('{');
      expect(de).not.toBe(en);
      expect(es).not.toBe(en);
    }
  });

  it('falls back to the server text only for unknown codes', () => {
    expect(enhanceErrorKeyForCode('SOMETHING_NEW')).toBeNull();
    expect(engineErrorText('SOMETHING_NEW', 'server said so', 'de')).toBe('server said so');
    expect(engineErrorText(null, 'plain failure', 'es')).toBe('plain failure');
  });

  it('treats a refused order as a reason to keep the start button disabled', () => {
    expect(ORDER_REJECTION_CODES.has('VIDEO_ENHANCE_NOT_AN_UPSCALE')).toBe(true);
    expect(ORDER_REJECTION_CODES.has('TARGET_FRAME_UNREACHABLE')).toBe(true);
    // A transient provider hiccup is NOT an order rejection — retry is allowed.
    expect(ORDER_REJECTION_CODES.has('PROVIDER_REJECTED')).toBe(false);
  });

  it('defaults to English for unknown UI languages', () => {
    expect(toEnhanceLang('fr')).toBe('en');
    expect(toEnhanceLang('de')).toBe('de');
    expect(toEnhanceLang(undefined)).toBe('en');
  });
});

describe('video enhance — every surface goes through the same copy', () => {
  const surfaces = [
    'src/components/ai-video/EnhanceVideoPanel.tsx',
    'src/components/directors-cut/features/AIVideoUpscaling.tsx',
  ];

  it('renders engine errors through the shared mapper, never the raw string alone', () => {
    for (const file of surfaces) {
      const source = read(file);
      expect(source).toContain("from '@/lib/videoEnhance/engineErrors'");
      expect(source).toMatch(/engineErrorText\(errorCode,\s*error,\s*lang,\s*errorReason\)/);
      expect(source).not.toMatch(/<span className="text-sm">\{error\}<\/span>/);
    }
  });

  it('shows source → target frame before the run and the delivered frame after', () => {
    for (const file of surfaces) {
      const source = read(file);
      expect(source).toContain('resolveTargetFrame(');
      expect(source).toContain('evaluateUpscale(');
      expect(source).toContain('actual_width');
      expect(source).toContain('actual_height');
    }
  });

  it('never hardcodes one language for model labels', () => {
    for (const file of surfaces) {
      expect(read(file)).not.toMatch(/\.label\.de\b/);
    }
  });

  it('keeps the measured source facts on a refused order', () => {
    const hook = read('src/hooks/useEnhanceVideo.ts');
    expect(hook).toContain('errorReason');
    expect(hook).toMatch(/failure\.source/);
    const server = read('supabase/functions/video-enhance/index.ts');
    // The refusal payload carries the full measured source, not just w×h.
    expect(server).toMatch(/code:\s*"VIDEO_ENHANCE_NOT_AN_UPSCALE",\s*reason:\s*upscale\.reason,\s*source:\s*source\.meta/);
  });
});
