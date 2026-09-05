import { describe, it, expect } from 'vitest';
import {
  SOURCE_FORMAT,
  resolveRequestedFormat,
} from '@/config/pictureFormatResolution';
import { detectTransparencyWish, detectEditIntent } from '@/config/pictureIntentHints';
import { buildPictureRequest } from '@/config/picturePromptBuilder';

/**
 * Invariants of the Picture Studio "Generate" contract.
 * The customer's stated intent is never silently rewritten.
 */
describe('requested vs. resolved format', () => {
  it('keeps the requested value untouched even when the model needs an approximation', () => {
    const built = buildPictureRequest({
      tier: 'fast',
      mode: 'create',
      prompt: 'a red bicycle',
      style: 'realistic',
      requestedFormat: SOURCE_FORMAT,
      source: { width: 1234, height: 567 },
      subjectRefs: ['https://example.com/a.png'],
      styleRefs: [],
    });
    expect(built.requestedFormat).toBe(SOURCE_FORMAT);
    expect(built.resolvedFormat.aspectRatio).not.toBe(SOURCE_FORMAT);
  });

  it('flags an adjustment whenever resolved differs from requested', () => {
    const resolved = resolveRequestedFormat('fast', SOURCE_FORMAT, { width: 1234, height: 567 });
    if (resolved.adjustment) {
      expect(resolved.adjustment.from).not.toBe(resolved.adjustment.to);
      expect(resolved.adjustment.to).toBe(resolved.aspectRatio);
    } else {
      // No adjustment means the source proportions survived exactly.
      expect(resolved.width! / resolved.height!).toBeCloseTo(1234 / 567, 2);
    }
  });


  it('reports source as unavailable instead of inventing a size', () => {
    const resolved = resolveRequestedFormat('fast', SOURCE_FORMAT, null);
    expect(resolved.sourceUnavailable).toBe(true);
    expect(resolved.aspectRatio).not.toBe(SOURCE_FORMAT);
  });

  it('passes a plain ratio through unchanged when the model supports it', () => {
    const resolved = resolveRequestedFormat('fast', '1:1', null);
    expect(resolved.aspectRatio).toBe('1:1');
    expect(resolved.adjustment).toBeUndefined();
  });
});

describe('prompt purity', () => {
  it('never adds a hidden photorealism modifier the user did not ask for', () => {
    const built = buildPictureRequest({
      tier: 'fast',
      mode: 'create',
      prompt: 'flat vector logo, two colours',
      style: 'none',
      requestedFormat: '1:1',
      subjectRefs: [],
      styleRefs: [],
    });
    expect(built.prompt.toLowerCase()).not.toContain('photorealistic');
    expect(built.appliedModifiers.every((m) => m.source !== 'style')).toBe(true);
  });

  it('lists every applied modifier for the disclosure panel', () => {
    const built = buildPictureRequest({
      tier: 'fast',
      mode: 'create',
      prompt: 'a cat',
      style: 'realistic',
      requestedFormat: '16:9',
      subjectRefs: [],
      styleRefs: [],
    });
    expect(built.appliedModifiers.length).toBeGreaterThan(0);
    for (const mod of built.appliedModifiers) {
      expect(typeof mod.id).toBe('string');
      expect(mod.id.length).toBeGreaterThan(0);
    }
  });
});

describe('intent detection is a hint, never an action', () => {
  it('spots a transparency wish in all three languages', () => {
    expect(detectTransparencyWish('transparenter hintergrund bitte').matched).toBe(true);
    expect(detectTransparencyWish('on a transparent background').matched).toBe(true);
    expect(detectTransparencyWish('con fondo transparente').matched).toBe(true);
  });

  it('does not fire on unrelated prompts', () => {
    expect(detectTransparencyWish('a blue background wall').matched).toBe(false);
    expect(detectEditIntent('a photo of a mountain').matched).toBe(false);
  });

  it('spots a targeted edit request', () => {
    expect(detectEditIntent('entferne die Person links').matched).toBe(true);
    expect(detectEditIntent('remove the logo from the shirt').matched).toBe(true);
  });
});
