/**
 * Seedance 2.5 semantic reference binding — invariants.
 *
 *  1. UI order = backend order = provider content[N]
 *  2. roles survive the full path (UI slot → bound slot → prompt text)
 *  3. duplicate image handling (URL and content-hash)
 *  4. rejected content[2] highlights image 2 (UI index 1)
 *  5. binding is stable after reload/resume (serialize → parse → identical)
 *  6. client re-export === shared implementation (no fork)
 */
import { describe, it, expect } from 'vitest';
import * as shared from '../../supabase/functions/_shared/referenceBinding';
import * as client from '@/lib/ai-video/referenceBinding';
import {
  bindReferenceSlots,
  buildReferenceInstructions,
  composeReferencePrompt,
  findDuplicateReferences,
  parseModelArkContentIndex,
  resolveRejectedReference,
  contentIndexToReferenceSlot,
} from '@/lib/ai-video/referenceBinding';

const URLS = [
  'https://cdn.example/u/ref-a.png',
  'https://cdn.example/u/ref-b.png',
  'https://cdn.example/u/ref-c.png',
];
const ROLES = ['character', 'product', 'location'];

/** Mirrors `createSeedance25Task` content assembly (text first, then images in order). */
function providerContent(prompt: string, urls: string[]) {
  return [
    { type: 'text', text: prompt },
    ...urls.map((u) => ({ type: 'image_url', image_url: { url: u }, role: 'reference_image' })),
  ];
}

describe('UI order = backend order = provider content[N]', () => {
  it('keeps slot i at content[i+1] and labels it @Image i+1', () => {
    const slots = bindReferenceSlots(URLS, ROLES);
    const content = providerContent(composeReferencePrompt('p', slots), slots.map((s) => s.url));
    slots.forEach((s, i) => {
      expect(s.uiIndex).toBe(i);
      expect(s.imageNumber).toBe(i + 1);
      expect(s.contentIndex).toBe(i + 1);
      expect((content[s.contentIndex] as any).image_url.url).toBe(URLS[i]);
    });
    expect(content[0].type).toBe('text');
    expect(content).toHaveLength(URLS.length + 1); // no hidden extra images
  });

  it('never reorders or drops non-empty urls', () => {
    const slots = bindReferenceSlots(['b', 'a', '', 'c']);
    expect(slots.map((s) => s.url)).toEqual(['b', 'a', 'c']);
  });

  it('refuses more roles than images (index ambiguity)', () => {
    expect(() => bindReferenceSlots(['a'], ['character', 'product'])).toThrow();
  });
});

describe('roles survive the full path', () => {
  it('writes each role with its stable image index into the prompt', () => {
    const slots = bindReferenceSlots(URLS, ROLES);
    const text = buildReferenceInstructions(slots);
    expect(text).toMatch(/@Image 1 is the main character/);
    expect(text).toMatch(/@Image 2 is the product/);
    expect(text).toMatch(/@Image 3 is the location/);
    expect(text).not.toMatch(/@ref-/);
  });

  it('falls back to a neutral anchor line for missing/unknown roles', () => {
    const slots = bindReferenceSlots(URLS, ['style', null, 'banana']);
    expect(slots.map((s) => s.role)).toEqual(['style', null, null]);
    const text = buildReferenceInstructions(slots);
    expect(text).toMatch(/@Image 1 defines the visual style/);
    expect(text).toMatch(/@Image 2 is a reference/);
    expect(text).toMatch(/@Image 3 is a reference/);
  });

  it('appends instructions after the user prompt and leaves T2V prompts untouched', () => {
    expect(composeReferencePrompt('  hello  ', [])).toBe('hello');
    const out = composeReferencePrompt('hello', bindReferenceSlots(URLS.slice(0, 1), ['product']));
    expect(out.startsWith('hello\n\n[REFERENCES] 1 reference image')).toBe(true);
  });
});

describe('duplicate image handling', () => {
  it('detects the same URL (ignoring query strings) and points at the first occurrence', () => {
    const d = findDuplicateReferences([
      { url: URLS[0] },
      { url: URLS[1] },
      { url: `${URLS[0]}?t=123` },
    ]);
    expect(d).toEqual([{ uiIndex: 2, duplicateOf: 0, by: 'url' }]);
  });

  it('detects the same picture uploaded twice via content hash', () => {
    const d = findDuplicateReferences([
      { url: 'https://x/1.png', hash: 'abc' },
      { url: 'https://x/2.png', hash: 'ABC' },
    ]);
    expect(d).toEqual([{ uiIndex: 1, duplicateOf: 0, by: 'hash' }]);
  });

  it('reports nothing for distinct images', () => {
    expect(findDuplicateReferences(URLS.map((url, i) => ({ url, hash: `h${i}` })))).toEqual([]);
  });
});

describe('rejected content[2] highlights image 2', () => {
  const RAW = 'ModelArk create failed (400): {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input image content[2] may contain real person."}}';

  it('parses the provider index', () => {
    expect(parseModelArkContentIndex(RAW)).toBe(2);
    expect(parseModelArkContentIndex('no index here')).toBeNull();
  });

  it('maps content[2] → UI index 1 / image 2 with its role', () => {
    const slots = bindReferenceSlots(URLS, ROLES);
    const r = resolveRejectedReference(RAW, slots);
    expect(r).toEqual({ contentIndex: 2, uiIndex: 1, imageNumber: 2, role: 'product' });
  });

  it('never maps the text block or out-of-range indices to a thumbnail', () => {
    const slots = bindReferenceSlots(URLS, ROLES);
    expect(contentIndexToReferenceSlot(0, slots)).toBeNull();
    expect(contentIndexToReferenceSlot(4, slots)).toBeNull();
    expect(resolveRejectedReference('content[0] bad', slots)).toBeNull();
  });
});

describe('binding is stable after reload/resume', () => {
  it('serialize → parse → identical order, roles and prompt', () => {
    const draft = URLS.map((url, i) => ({ url, role: ROLES[i], hash: `h${i}` }));
    const restored = JSON.parse(JSON.stringify({ viduReferences: draft })).viduReferences as typeof draft;
    const before = bindReferenceSlots(draft.map((s) => s.url), draft.map((s) => s.role));
    const after = bindReferenceSlots(restored.map((s) => s.url), restored.map((s) => s.role));
    expect(after).toEqual(before);
    expect(composeReferencePrompt('scene', after)).toBe(composeReferencePrompt('scene', before));
    expect(resolveRejectedReference('content[3]', after)).toEqual(resolveRejectedReference('content[3]', before));
  });
});

describe('client mirror is the shared implementation', () => {
  it('re-exports the identical functions', () => {
    for (const k of ['bindReferenceSlots', 'buildReferenceInstructions', 'composeReferencePrompt', 'findDuplicateReferences', 'parseModelArkContentIndex', 'resolveRejectedReference'] as const) {
      expect((client as any)[k]).toBe((shared as any)[k]);
    }
  });
});
