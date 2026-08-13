/**
 * v428 — Anchor-Kohärenz für Lip-Sync-Szenen.
 *
 * Behaviour tests, not name checks. The contract under test:
 *
 *   Für eine Szene mit Lip-Sync-Absicht ist der Plate-Input IMMER
 *   `reference_image_url` — dasselbe Bild, auf dem die eingefrorene Kette
 *   später die Gesichtsgeometrie misst. Kein Continuity-Frame, kein
 *   End-Frame, keine Clip-Referenz, kein `lock_reference_url`.
 *
 * Ein Bruch dieser Tests bedeutet: die Kette kann wieder eine Plate aus Bild B
 * erzeugen, während die Geometrie auf Bild A gemessen wird (Anchor-Mismatch
 * vom Juli 2026).
 */
import { describe, it, expect } from 'vitest';
import {
  planSceneVisualInputs,
  getVisualInputProfileForSource,
  deriveRequirementsFromRow,
  classifySceneRow,
  resolveVisualInputs,
  CLIP_SOURCE_CAPABILITIES,
  type ResolvedVisualPlan,
} from '../../../../supabase/functions/_shared/visual-inputs.ts';

const A = 'https://cdn.test/anchor-A.png'; // reference_image_url
const B = 'https://cdn.test/lock-B.png'; // lock_reference_url
const C = 'https://cdn.test/lock-C.png';
const PREV_FRAME = 'https://cdn.test/prev-frame.png';
const PREV_CLIP = 'https://cdn.test/prev-clip.mp4';
const END_FRAME = 'https://cdn.test/end-frame.png';

const ALL_SOURCES = Object.keys(CLIP_SOURCE_CAPABILITIES);

function planFor(
  source: string,
  overrides: Record<string, unknown> = {},
  ctx: Record<string, unknown> = {},
): ResolvedVisualPlan {
  return planSceneVisualInputs(
    {
      lip_sync_with_voiceover: true,
      character_shots: [{ characterId: 'c1', shotType: 'medium' }],
      ...overrides,
    } as never,
    {
      clipSource: source,
      anchorImageUrl: A,
      previousFrameUrl: PREV_FRAME,
      previousClipUrl: PREV_CLIP,
      references: [
        { url: 'https://cdn.test/cast-1.png', role: 'character', kind: 'image' },
      ],
      ...ctx,
    } as never,
  );
}

/** Everything a provider payload could carry as an image/video input. */
function payloadInputs(plan: ResolvedVisualPlan): string[] {
  return [
    plan.firstFrameUrl,
    plan.endFrameUrl,
    plan.transition.sourceFrameUrl,
    plan.transition.sourceClipUrl,
    ...plan.references.map((r) => r.url),
  ].filter((u): u is string => typeof u === 'string');
}

describe('v428 lip-sync anchor coherence — every provider profile', () => {
  for (const source of ALL_SOURCES) {
    describe(source, () => {
      const variants: Array<[string, Record<string, unknown>]> = [
        ['with previous frame + clip', {}],
        ['without continuity at all', { previousFrameUrl: undefined, previousClipUrl: undefined }],
        ['with an explicit end frame', { endFrameUrl: END_FRAME }],
        ['with only a previous clip', { previousFrameUrl: undefined }],
        ['with only a previous frame', { previousClipUrl: undefined }],
        ['with seamless preference', { continuityPreference: 'seamless' }],
        ['with identity preference', { continuityPreference: 'identity' }],
      ];

      for (const [label, ctx] of variants) {
        it(`keeps the anchor as plate input — ${label}`, () => {
          const plan = planFor(source, {}, ctx);
          expect(plan.constraints.lipSyncProtected).toBe(true);
          expect(plan.transition.mode).toBe('match-cut');
          expect(plan.warnings).toContain('lipsync_continuity_disabled');

          // Either the anchor IS the first frame, or the provider has no
          // anchor-faithful image input and the plan fails closed.
          if (plan.warnings.includes('lipsync_anchor_input_unsupported')) {
            expect(plan.inputMode).toBe('none');
          } else {
            expect(plan.firstFrameUrl).toBe(A);
            expect(plan.inputMode).toBe('first-frame');
          }

          const inputs = payloadInputs(plan);
          expect(inputs).not.toContain(PREV_FRAME);
          expect(inputs).not.toContain(PREV_CLIP);
          expect(inputs).not.toContain(END_FRAME);
          expect(inputs).not.toContain(B);
          expect(inputs).not.toContain(C);
          expect(plan.transition.sourceFrameUrl).toBeUndefined();
          expect(plan.transition.sourceClipUrl).toBeUndefined();
        });
      }
    });
  }
});

describe('v428 differential test — lock_reference_url is irrelevant', () => {
  it('plate input stays on image A regardless of the lock image', () => {
    const withB = planFor('ai-hailuo', { lock_reference_url: B });
    const withC = planFor('ai-hailuo', { lock_reference_url: C });

    expect(withB.firstFrameUrl).toBe(A);
    expect(withC.firstFrameUrl).toBe(A);
    expect(payloadInputs(withB)).not.toContain(B);
    expect(payloadInputs(withC)).not.toContain(C);
    expect(withB.transition.mode).toBe(withC.transition.mode);
    expect(withB.inputMode).toBe(withC.inputMode);
  });

  it('the certified lip-sync providers both resolve to the anchor', () => {
    for (const source of ['ai-hailuo', 'ai-happyhorse']) {
      const plan = planFor(source, { lock_reference_url: B });
      expect(plan.firstFrameUrl).toBe(A);
      expect(plan.inputMode).toBe('first-frame');
      expect(plan.warnings).not.toContain('lipsync_anchor_input_unsupported');
    }
  });
});

describe('v428 lip-sync intent is recognised on every entry point', () => {
  const entryPoints: Array<[string, Record<string, unknown>]> = [
    ['manual toggle', { lip_sync_with_voiceover: true }],
    ['multi-speaker dialog', {
      lip_sync_with_voiceover: null,
      dialog_mode: true,
      character_shots: [
        { characterId: 'c1', shotType: 'medium' },
        { characterId: 'c2', shotType: 'medium' },
      ],
    }],
    ['single-speaker dialog', {
      lip_sync_with_voiceover: null,
      dialog_mode: true,
      character_shots: [{ characterId: 'c1', shotType: 'medium' }],
    }],
    ['engine override cinematic-sync (replay / regeneration)', {
      lip_sync_with_voiceover: null,
      engine_override: 'cinematic-sync',
    }],
    ['engine override sync-segments (watchdog recovery)', {
      lip_sync_with_voiceover: null,
      engine_override: 'sync-segments',
    }],
    ['engine override native-dialogue (autopilot)', {
      lip_sync_with_voiceover: null,
      engine_override: 'native-dialogue',
    }],
    ['existing scene, new run (lock present, toggle on)', {
      lip_sync_with_voiceover: true,
      lock_reference_url: B,
      continuity_locked: true,
    }],
  ];

  for (const [label, row] of entryPoints) {
    it(`${label} → lipSync requirement true, continuity disabled`, () => {
      const requirements = deriveRequirementsFromRow(row as never);
      expect(requirements.lipSync).toBe(true);

      const plan = planFor('ai-hailuo', row);
      expect(plan.constraints.lipSyncProtected).toBe(true);
      expect(plan.transition.mode).toBe('match-cut');
      expect(plan.firstFrameUrl).toBe(A);
      expect(payloadInputs(plan)).not.toContain(PREV_FRAME);
    });
  }
});

describe('v428 does not restrict non-lip-sync scenes', () => {
  const plainRow = {
    lip_sync_with_voiceover: null,
    dialog_mode: null,
    engine_override: null,
    character_shots: [],
  };

  it('continuity still works for an environment scene', () => {
    const plan = planSceneVisualInputs(plainRow as never, {
      clipSource: 'ai-hailuo',
      anchorImageUrl: undefined,
      previousFrameUrl: PREV_FRAME,
      references: [],
    } as never);
    expect(plan.constraints.lipSyncProtected).toBe(false);
    expect(plan.transition.mode).toBe('frame-chain');
    expect(plan.firstFrameUrl).toBe(PREV_FRAME);
  });

  it('classification is unchanged for plain scenes', () => {
    expect(classifySceneRow(plainRow as never)).toBe('environment');
  });
});

describe('v428 rule sits in front of every other arbitration branch', () => {
  it('an unverified profile still ends on the anchor, not on references', () => {
    const profile = getVisualInputProfileForSource('ai-hailuo');
    const plan = resolveVisualInputs({
      sceneClass: 'character',
      requirements: {
        lipSync: true,
        identityCritical: true,
        productCritical: false,
        locationContinuity: 'none',
      },
      profile: {
        ...profile,
        lipSync: { ...profile.lipSync, verification: { status: 'unverified' } },
      },
      anchorImageUrl: A,
      previousFrameUrl: PREV_FRAME,
      previousClipUrl: PREV_CLIP,
      endFrameUrl: END_FRAME,
      references: [],
      continuityPreference: 'seamless',
    } as never);

    expect(plan.transition.mode).toBe('match-cut');
    expect(plan.firstFrameUrl).toBe(A);
    expect(plan.warnings).toContain('lipsync_continuity_disabled');
  });

  it('fails closed when the provider has no first-frame slot', () => {
    const profile = getVisualInputProfileForSource('ai-runway'); // v2v only
    expect(profile.firstFrame.supported).toBe(false);

    const plan = resolveVisualInputs({
      sceneClass: 'character',
      requirements: {
        lipSync: true,
        identityCritical: true,
        productCritical: false,
        locationContinuity: 'none',
      },
      profile,
      anchorImageUrl: A,
      previousFrameUrl: PREV_FRAME,
      references: [],
      continuityPreference: 'auto',
    } as never);

    expect(plan.warnings).toContain('lipsync_anchor_input_unsupported');
    expect(plan.inputMode).toBe('none');
    expect(payloadInputs(plan)).not.toContain(PREV_FRAME);
  });
});
