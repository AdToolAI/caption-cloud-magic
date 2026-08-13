import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  continuityPreferenceForSource,
  isLegacyVisualSource,
  parseVisualSource,
  resolveVisualSource,
  VISUAL_SOURCE_STRATEGIES,
} from '@/lib/composer/visualInputs/visualSource';
import { resolveVisualInputs } from '@/lib/composer/visualInputs/resolveVisualInputs';
import { getVisualInputProfileByModelId } from '@/lib/composer/visualInputs/modelProfiles';
import type { ResolveVisualInputsArgs } from '@/lib/composer/visualInputs/types';

const anchor = 'https://cdn.test/anchor.jpg';
const prevFrame = 'https://cdn.test/prev-frame.jpg';

const profileFor = (modelId: string) => {
  const profile = getVisualInputProfileByModelId(modelId);
  if (!profile) throw new Error(`missing profile for ${modelId}`);
  return profile;
};

function baseArgs(overrides: Partial<ResolveVisualInputsArgs> = {}): ResolveVisualInputsArgs {
  return {
    sceneClass: 'character',
    profile: profileFor('seedance-2-5'),
    requirements: {
      lipSync: false,
      identityCritical: true,
      productCritical: false,
      locationContinuity: 'medium',
    },
    anchorImageUrl: anchor,
    previousFrameUrl: prevFrame,
    references: [],
    ...overrides,
  } as ResolveVisualInputsArgs;
}

describe('v430 Step 3 — visual_source strategy', () => {
  it('is a strategy enum, never an asset', () => {
    expect(VISUAL_SOURCE_STRATEGIES).toEqual([
      'auto',
      'character_anchor',
      'previous_final_frame',
      'uploaded_reference',
      'generated_still',
    ]);
    for (const s of VISUAL_SOURCE_STRATEGIES) {
      expect(s).not.toMatch(/https?:|url/i);
    }
  });

  it('treats NULL as legacy, not as auto', () => {
    expect(parseVisualSource(null)).toBeNull();
    expect(parseVisualSource('nonsense')).toBeNull();
    expect(isLegacyVisualSource(null)).toBe(true);
    expect(isLegacyVisualSource('auto')).toBe(false);
    const decision = resolveVisualSource(null, {
      profile: profileFor('seedance-2-5'),
      lipSync: false,
      hasAnchorImage: true,
      hasPreviousFrame: true,
      hasPreviousClip: false,
    });
    expect(decision).toEqual({ requested: null, effective: 'auto', overridden: false });
  });

  it('reports requested vs effective on an invalid combination instead of rewriting it', () => {
    const decision = resolveVisualSource('previous_final_frame', {
      profile: profileFor('seedance-2-5'),
      lipSync: true,
      hasAnchorImage: true,
      hasPreviousFrame: true,
      hasPreviousClip: false,
    });
    expect(decision.requested).toBe('previous_final_frame');
    expect(decision.effective).toBe('character_anchor');
    expect(decision.overridden).toBe(true);
    expect(decision.reason).toBe('lipsync_continuity_disabled');
  });

  it('falls back when there is no previous scene or no anchor', () => {
    const profile = profileFor('seedance-2-5');
    expect(
      resolveVisualSource('previous_final_frame', {
        profile,
        lipSync: false,
        hasAnchorImage: true,
        hasPreviousFrame: false,
        hasPreviousClip: false,
      }).reason,
    ).toBe('no_previous_scene');
    expect(
      resolveVisualSource('character_anchor', {
        profile,
        lipSync: false,
        hasAnchorImage: false,
        hasPreviousFrame: false,
        hasPreviousClip: false,
      }),
    ).toEqual({
      requested: 'character_anchor',
      effective: 'auto',
      overridden: true,
      reason: 'no_anchor_image',
    });
  });

  it('maps effective strategies onto the existing continuity knob', () => {
    expect(continuityPreferenceForSource('previous_final_frame')).toBe('seamless');
    expect(continuityPreferenceForSource('character_anchor')).toBe('identity');
    expect(continuityPreferenceForSource('uploaded_reference')).toBe('identity');
    expect(continuityPreferenceForSource('generated_still')).toBe('identity');
    expect(continuityPreferenceForSource('auto')).toBe('auto');
  });
});

describe('v430 Step 3 — legacy parity (hard regression)', () => {
  const cases: Array<[string, Partial<ResolveVisualInputsArgs>]> = [
    ['seedance auto', {}],
    ['seedance seamless', { continuityPreference: 'seamless' }],
    ['seedance identity', { continuityPreference: 'identity' }],
    ['seedance match-cut', { continuityPreference: 'match-cut' }],
    [
      'hailuo lipsync',
      {
        profile: profileFor('hailuo-standard'),
        requirements: {
          lipSync: true,
          identityCritical: true,
          productCritical: false,
          locationContinuity: 'high',
        },
      },
    ],
    ['no anchor', { anchorImageUrl: undefined }],
    ['no previous frame', { previousFrameUrl: undefined }],
  ];

  for (const [name, overrides] of cases) {
    it(`${name}: visual_source = NULL is byte-identical to omitting it`, () => {
      const withoutField = resolveVisualInputs(baseArgs(overrides));
      const withNull = resolveVisualInputs(
        baseArgs({ ...overrides, requestedVisualSource: null }),
      );
      const strip = (p: unknown) => {
        const clone = JSON.parse(JSON.stringify(p));
        delete clone.visualSource;
        return clone;
      };
      expect(strip(withNull)).toEqual(strip(withoutField));
      expect(withNull.visualSource).toEqual({
        requested: null,
        effective: 'auto',
        overridden: false,
      });
    });
  }

  it('an explicit character_anchor on a lip-sync scene never displaces the anchor', () => {
    const plan = resolveVisualInputs(
      baseArgs({
        profile: profileFor('hailuo-standard'),
        requestedVisualSource: 'previous_final_frame',
        requirements: {
          lipSync: true,
          identityCritical: true,
          productCritical: false,
          locationContinuity: 'high',
        },
      }),
    );
    expect(plan.firstFrameUrl).toBe(anchor);
    expect(plan.transition.mode).toBe('match-cut');
    expect(plan.visualSource.overridden).toBe(true);
  });

  it('does not turn visual_source into an asset field', () => {
    const plan = resolveVisualInputs(baseArgs({ requestedVisualSource: 'character_anchor' }));
    expect(plan.visualSource.effective).toBe('character_anchor');
    expect(JSON.stringify(plan.visualSource)).not.toContain('http');
  });
});

describe('v430 Step 3 — client/backend parity', () => {
  const client = readFileSync(
    resolve(process.cwd(), 'src/lib/composer/visualInputs/visualSource.ts'),
    'utf8',
  );
  const backend = readFileSync(
    resolve(process.cwd(), 'supabase/functions/_shared/visual-source.ts'),
    'utf8',
  );

  const normalize = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/["']/g, '"')
      .replace(/\s+/g, ' ')
      // formatting-insensitive: trailing commas and spacing must not fail parity
      .replace(/,\s*([)\]}])/g, '$1')
      .replace(/\s*([(),{}\[\]:;?])\s*/g, '$1')
      .trim();

  it('mirrors the strategy list and the resolution logic', () => {
    for (const marker of [
      'previous_final_frame',
      'lipsync_continuity_disabled',
      'provider_slot_unsupported',
      'no_previous_scene',
      'no_anchor_image',
    ]) {
      expect(normalize(backend)).toContain(marker);
      expect(normalize(client)).toContain(marker);
    }
    const body = (src: string) =>
      normalize(src).slice(normalize(src).indexOf('export function resolveVisualSource'));
    expect(body(backend).replace(/ as VisualSourceDecision/g, '')).toBe(
      body(client)
        .replace(/ as VisualSourceDecision/g, '')
        .replace(/\.\/types/g, './visual-inputs.ts'),
    );
  });

  it('the migration keeps NULL as the default', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260813210230_8982305a-1f5f-4ba0-b0c1-c0846b767759.sql',
      ),
      'utf8',
    );
    expect(migration).toMatch(/visual_source text DEFAULT NULL/);
    expect(migration).toMatch(/visual_source IS NULL OR visual_source IN/);
    expect(migration).not.toMatch(/UPDATE\s+public\.composer_scenes/i);
  });
});
