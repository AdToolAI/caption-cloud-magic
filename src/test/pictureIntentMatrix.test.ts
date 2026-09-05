import { describe, it, expect } from 'vitest';
import {
  SOURCE_FORMAT,
  resolveRequestedFormat,
} from '@/config/pictureFormatResolution';
import { detectTransparencyWish, detectEditIntent } from '@/config/pictureIntentHints';
import { buildPictureRequest } from '@/config/picturePromptBuilder';
import { PICTURE_MODEL_CAPABILITIES } from '@/config/pictureModelCapabilities';

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

/* ------------------------------------------------------------------ */
/* Full model invariant matrix — every active model, every invariant.  */
/* ------------------------------------------------------------------ */

const TIERS = Object.keys(PICTURE_MODEL_CAPABILITIES) as (keyof typeof PICTURE_MODEL_CAPABILITIES)[];

describe('model invariant matrix (all active models)', () => {
  it('covers every model offered in the studio', () => {
    expect(TIERS.length).toBeGreaterThanOrEqual(9);
  });

  for (const tier of TIERS) {
    const cap = PICTURE_MODEL_CAPABILITIES[tier];
    const canReference = cap.references.subject > 0;

    describe(`${tier} — ${cap.model}`, () => {
      it('Auto/no style → no style modifier is injected', () => {
        const built = buildPictureRequest({
          tier,
          mode: 'create',
          prompt: 'a wooden chair in an empty room',
          style: 'none',
          requestedFormat: cap.aspectRatios[0],
          subjectRefs: [],
          styleRefs: [],
        });
        expect(built.appliedModifiers.some((m) => m.source === 'style')).toBe(false);
        expect(built.prompt).toContain('a wooden chair in an empty room');
      });

      it('no reference → no strength/guidance value in the payload', () => {
        const built = buildPictureRequest({
          tier,
          mode: 'create',
          prompt: 'a wooden chair',
          style: 'none',
          strength: 80,
          requestedFormat: cap.aspectRatios[0],
          subjectRefs: [],
          styleRefs: [],
        });
        expect(built.strengthValue).toBeUndefined();
        expect(built.strengthField).toBeUndefined();
      });

      if (canReference) {
        it('reference + transform → exactly one strength mechanism, matching the capability row', () => {
          const built = buildPictureRequest({
            tier,
            mode: 'transform',
            prompt: 'make it evening light',
            style: 'none',
            strength: 30,
            requestedFormat: cap.aspectRatios[0],
            subjectRefs: ['https://example.com/ref1.png'],
            styleRefs: [],
          });
          if (cap.strengthField) {
            // native parameter: value present, no prompt sentence
            expect(built.strengthField).toBe(cap.strengthField);
            expect(typeof built.strengthValue).toBe('number');
            expect(built.appliedModifiers.some((m) => m.source === 'intent')).toBe(false);
          } else {
            // prompt-guided: sentence present, no numeric parameter
            expect(built.strengthValue).toBeUndefined();
            expect(built.appliedModifiers.some((m) => m.source === 'intent')).toBe(true);
          }
        });
      }

      it('Source → never a silent 1:1, always a visible resolution', () => {
        const built = buildPictureRequest({
          tier,
          mode: 'transform',
          prompt: 'keep it as is, brighter',
          style: 'none',
          requestedFormat: SOURCE_FORMAT,
          source: { width: 1800, height: 1200 },
          subjectRefs: ['https://example.com/ref1.png'],
          styleRefs: [],
        });
        expect(built.requestedFormat).toBe(SOURCE_FORMAT);
        const r = built.resolvedFormat;
        const landscapeOk = r.width && r.height
          ? r.width > r.height
          : r.aspectRatio !== '1:1' || cap.aspectRatios.every((a) => a === '1:1');
        expect(landscapeOk).toBe(true);
        if (r.aspectRatio !== SOURCE_FORMAT && !r.width) {
          // approximation must be disclosed
          expect(r.adjustment ?? r.sourceUnavailable).toBeTruthy();
        }
      });

      it('unsupported ratio → nearest supported ratio plus a visible adjustment', () => {
        const built = buildPictureRequest({
          tier,
          mode: 'create',
          prompt: 'a wide landscape',
          style: 'none',
          requestedFormat: '21:9',
          subjectRefs: [],
          styleRefs: [],
        });
        expect(built.requestedFormat).toBe('21:9');
        if (!cap.aspectRatios.includes('21:9')) {
          expect(built.resolvedFormat.adjustment).toBeDefined();
          expect(built.resolvedFormat.adjustment!.to).toBe(built.resolvedFormat.aspectRatio);
        }
      });
    });
  }
});

describe('model switch keeps the semantic choice', () => {
  const source = { width: 1800, height: 1200 };

  it('Source survives A -> B and B resolves from the real source, not from A result', () => {
    const a = buildPictureRequest({
      tier: 'gptimage', mode: 'transform', prompt: 'brighter',
      style: 'none', requestedFormat: SOURCE_FORMAT, source,
      subjectRefs: ['https://example.com/ref1.png'], styleRefs: [],
    });
    expect(a.requestedFormat).toBe(SOURCE_FORMAT);
    expect(a.resolvedFormat.aspectRatio).toBe('3:2');

    // switching to a model with exact sizing must re-resolve from `source`
    const b = buildPictureRequest({
      tier: 'fast', mode: 'transform', prompt: 'brighter',
      style: 'none', requestedFormat: SOURCE_FORMAT, source,
      subjectRefs: ['https://example.com/ref1.png'], styleRefs: [],
    });
    expect(b.requestedFormat).toBe(SOURCE_FORMAT);
    expect(b.resolvedFormat.width! / b.resolvedFormat.height!).toBeCloseTo(1800 / 1200, 2);
  });

  it('regenerates provider values on switch instead of carrying them over', () => {
    const promptGuided = buildPictureRequest({
      tier: 'ultra', mode: 'transform', prompt: 'brighter', style: 'none', strength: 30,
      requestedFormat: '1:1', subjectRefs: ['https://example.com/ref1.png'], styleRefs: [],
    });
    const native = buildPictureRequest({
      tier: 'flux', mode: 'transform', prompt: 'brighter', style: 'none', strength: 30,
      requestedFormat: '1:1', subjectRefs: ['https://example.com/ref1.png'], styleRefs: [],
    });
    expect(promptGuided.strengthValue).toBeUndefined();
    expect(native.strengthField).toBe(PICTURE_MODEL_CAPABILITIES.flux.strengthField);
    expect(typeof native.strengthValue).toBe('number');
  });
});

describe('source is bound to reference #1', () => {
  it('additional references never change the resolved format', () => {
    const withOne = buildPictureRequest({
      tier: 'fast', mode: 'mix', prompt: 'combine them', style: 'none',
      requestedFormat: SOURCE_FORMAT, source: { width: 1000, height: 2000 },
      subjectRefs: ['https://example.com/a.png'], styleRefs: [],
    });
    const withThree = buildPictureRequest({
      tier: 'fast', mode: 'mix', prompt: 'combine them', style: 'none',
      requestedFormat: SOURCE_FORMAT, source: { width: 1000, height: 2000 },
      subjectRefs: ['https://example.com/a.png', 'https://example.com/b.png', 'https://example.com/c.png'],
      styleRefs: [],
    });
    expect(withThree.resolvedFormat).toEqual(withOne.resolvedFormat);
  });
});
