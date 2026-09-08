import { describe, expect, it } from 'vitest';
import {
  describePreflightViolation,
  preflightVideoRequest,
  promptCharLimit,
} from '@/lib/ai-video/requestPreflight';

const long = (n: number) => 'a'.repeat(n);

describe('video request preflight — prompt length', () => {
  it('knows the documented Replicate/ModelArk Seedance limit', () => {
    expect(promptCharLimit('seedance-pro')).toBe(4000);
    expect(promptCharLimit('seedance-2-5')).toBe(4000);
    expect(promptCharLimit('veo-3')).toBeNull();
  });

  it('accepts exactly the limit and refuses one character more', () => {
    expect(preflightVideoRequest({ modelId: 'seedance-pro', prompt: long(4000) }).ok).toBe(true);
    const over = preflightVideoRequest({ modelId: 'seedance-pro', prompt: long(4001) });
    expect(over.ok).toBe(false);
    expect(over.code).toBe('PROMPT_TOO_LONG');
    expect(over.violation).toEqual({ kind: 'prompt_too_long', length: 4001, limit: 4000 });
  });

  it('never blocks a model without a documented limit', () => {
    expect(preflightVideoRequest({ modelId: 'veo-3', prompt: long(9000) }).ok).toBe(true);
  });
});

describe('video request preflight — exclusive input slots', () => {
  it('refuses a start frame together with reference media on Seedance 2.5', () => {
    const res = preflightVideoRequest({
      modelId: 'seedance-2-5',
      prompt: 'hi',
      startImageUrl: 'https://x/a.png',
      referenceImageUrls: ['https://x/b.png'],
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('INCOMPATIBLE_INPUT_COMBINATION');
  });

  it('refuses an end frame together with a reference clip', () => {
    const res = preflightVideoRequest({
      modelId: 'seedance-2-5',
      prompt: 'hi',
      endImageUrl: 'https://x/a.png',
      referenceVideoUrls: ['https://x/c.mp4'],
    });
    expect(res.ok).toBe(false);
  });

  it('allows each input on its own', () => {
    expect(preflightVideoRequest({ modelId: 'seedance-2-5', prompt: 'hi', startImageUrl: 'u' }).ok).toBe(true);
    expect(
      preflightVideoRequest({ modelId: 'seedance-2-5', prompt: 'hi', referenceImageUrls: ['u'] }).ok,
    ).toBe(true);
  });

  it('does not invent the rule for routes that allow the combination', () => {
    expect(
      preflightVideoRequest({
        modelId: 'seedance-pro',
        prompt: 'hi',
        startImageUrl: 'u',
        referenceImageUrls: ['v'],
      }).ok,
    ).toBe(true);
  });
});

describe('video request preflight — wording', () => {
  it('explains both refusals in every language without raw provider text', () => {
    for (const lang of ['en', 'de', 'es'] as const) {
      const a = describePreflightViolation({ kind: 'prompt_too_long', length: 4200, limit: 4000 }, lang, 'Seedance');
      const b = describePreflightViolation({ kind: 'frame_and_reference_media' }, lang, 'Seedance 2.5');
      expect(a).toContain('4000');
      expect(a).not.toContain('{');
      expect(b.length).toBeGreaterThan(30);
    }
    const de = describePreflightViolation({ kind: 'frame_and_reference_media' }, 'de', 'Seedance 2.5');
    const en = describePreflightViolation({ kind: 'frame_and_reference_media' }, 'en', 'Seedance 2.5');
    expect(de).not.toBe(en);
  });
});
