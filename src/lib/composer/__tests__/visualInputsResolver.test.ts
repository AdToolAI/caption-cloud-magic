import { describe, expect, it } from 'vitest';

import { AI_VIDEO_TOOLKIT_MODELS } from '@/config/aiVideoModelRegistry';
import {
  budgetReferences,
  classifyScene,
  deriveRequirements,
  deriveVisualInputProfile,
  getVisualInputProfileByModelId,
  resolveVisualInputs,
  slotsCollide,
  type SceneVisualRequirements,
  type VisualInputProfile,
  type VisualReference,
} from '../visualInputs';

const seedance25 = getVisualInputProfileByModelId('seedance-2-5')!;

const slotModel: VisualInputProfile = {
  mode: 'slots',
  firstFrame: { supported: true, slot: 'first-frame' },
  endFrame: { supported: true, slot: 'end-image' },
  references: { max: 3, slot: 'references', videos: 0, character: true, product: true, location: true },
  lipSync: {
    supported: true,
    requiresIdentityReference: true,
    conflictsWithFirstFrame: false,
    verification: { status: 'unverified' },
  },
};

const req = (over: Partial<SceneVisualRequirements> = {}): SceneVisualRequirements => ({
  lipSync: false,
  identityCritical: false,
  productCritical: false,
  locationContinuity: 'none',
  ...over,
});

const characterRef: VisualReference = {
  url: 'https://x/face.png',
  role: 'character',
  sceneRelevance: 1,
  continuityImportance: 1,
  identityImportance: 1,
};

describe('classification', () => {
  it('treats a cast scene as character and lip-sync as identity-critical', () => {
    const scene = { characterShots: [{}], lipSyncWithVoiceover: true };
    const cls = classifyScene(scene);
    expect(cls).toBe('character');
    const r = deriveRequirements(scene, cls);
    expect(r.lipSync).toBe(true);
    expect(r.identityCritical).toBe(true);
  });

  it('treats a plain scene as environment', () => {
    expect(classifyScene({})).toBe('environment');
    expect(deriveRequirements({}).lipSync).toBe(false);
  });
});

describe('core invariant — continuity never displaces a protected anchor', () => {
  it('degrades to match-cut on an exclusive-slot model with lip-sync', () => {
    const plan = resolveVisualInputs({
      sceneClass: 'character',
      requirements: req({ lipSync: true, identityCritical: true }),
      profile: seedance25,
      previousFrameUrl: 'https://x/prev.jpg',
      references: [characterRef],
    });
    expect(plan.transition.mode).toBe('match-cut');
    expect(plan.firstFrameUrl).toBeUndefined();
    expect(plan.references).toContainEqual(expect.objectContaining({ role: 'character' }));
    expect(plan.constraints.lipSyncProtected).toBe(true);
  });

  it('never honours a seamless override against a protected anchor', () => {
    const plan = resolveVisualInputs({
      sceneClass: 'character',
      requirements: req({ lipSync: true, identityCritical: true }),
      profile: seedance25,
      previousFrameUrl: 'https://x/prev.jpg',
      references: [characterRef],
      continuityPreference: 'seamless',
    });
    expect(plan.transition.mode).toBe('match-cut');
    expect(plan.warnings).toContain('seamless_denied_protected_anchor');
  });

  it('keeps lip-sync on match-cut while the capability is unverified', () => {
    const plan = resolveVisualInputs({
      sceneClass: 'character',
      requirements: req({ lipSync: true, identityCritical: true }),
      profile: slotModel,
      previousFrameUrl: 'https://x/prev.jpg',
      references: [characterRef],
    });
    expect(plan.transition.mode).toBe('match-cut');
    expect(plan.warnings).toContain('lipsync_capability_unverified_match_cut');
  });

  it('allows frame-chain with lip-sync only on separate slots AND verified', () => {
    const verified: VisualInputProfile = {
      ...slotModel,
      lipSync: { ...slotModel.lipSync, verification: { status: 'verified' } },
    };
    const plan = resolveVisualInputs({
      sceneClass: 'character',
      requirements: req({ lipSync: true, identityCritical: true }),
      profile: verified,
      previousFrameUrl: 'https://x/prev.jpg',
      references: [characterRef],
    });
    expect(plan.transition.mode).toBe('frame-chain');
    expect(plan.firstFrameUrl).toBe('https://x/prev.jpg');
    expect(plan.anchors.identity).toHaveLength(1);
  });
});

describe('Seedance 2.5 specifics', () => {
  it('has one exclusive visual-input slot', () => {
    expect(seedance25.mode).toBe('exclusive');
    expect(slotsCollide(seedance25)).toBe(true);
    expect(seedance25.references.videos).toBe(10);
  });

  it('is a certified lip-sync plate provider (v418, flag-gated at dispatch)', () => {
    expect(seedance25.lipSync.supported).toBe(true);
    expect(seedance25.lipSync.verification.status).toBe('verified');
  });


  it('uses the previous clip as continuity reference instead of a frame', () => {
    const plan = resolveVisualInputs({
      sceneClass: 'character',
      requirements: req({ identityCritical: true }),
      profile: seedance25,
      previousFrameUrl: 'https://x/prev.jpg',
      previousClipUrl: 'https://x/prev.mp4',
      references: [characterRef],
    });
    expect(plan.transition.mode).toBe('clip-reference');
    expect(plan.inputMode).toBe('references');
    expect(plan.transition.sourceClipUrl).toBe('https://x/prev.mp4');
    expect(plan.references.some((r) => r.kind === 'video')).toBe(true);
    expect(plan.anchors.identity).toHaveLength(1);
  });

  it('chains frames for a plain environment scene', () => {
    const plan = resolveVisualInputs({
      sceneClass: 'environment',
      requirements: req(),
      profile: seedance25,
      previousFrameUrl: 'https://x/prev.jpg',
      references: [],
    });
    expect(plan.transition.mode).toBe('frame-chain');
    expect(plan.inputMode).toBe('first-frame');
  });
});

describe('reference budget', () => {
  it('drops scene-irrelevant references and respects the model maximum', () => {
    const refs: VisualReference[] = [
      { ...characterRef, entityId: 'a' },
      { url: 'b', role: 'character', entityId: 'b', sceneRelevance: 0, continuityImportance: 1, identityImportance: 1 },
      { url: 'c', role: 'location', entityId: 'c', sceneRelevance: 1, continuityImportance: 0.5, identityImportance: 0.5 },
      { url: 'd', role: 'product', entityId: 'd', sceneRelevance: 1, continuityImportance: 0.4, identityImportance: 0.4 },
    ];
    const { selected } = budgetReferences(refs, { ...slotModel, references: { ...slotModel.references, max: 2 } });
    expect(selected).toHaveLength(2);
    expect(selected.map((r) => r.entityId)).toEqual(['a', 'c']);
  });

  it('never exceeds the model maximum for any registry model', () => {
    for (const model of AI_VIDEO_TOOLKIT_MODELS) {
      const profile = deriveVisualInputProfile(model);
      const many: VisualReference[] = Array.from({ length: 40 }, (_, i) => ({
        url: `u${i}`,
        role: 'character' as const,
      }));
      const { selected } = budgetReferences(many, profile);
      expect(selected.length).toBeLessThanOrEqual(profile.references.max);
    }
  });
});

describe('registry coverage', () => {
  it('produces a profile for every model', () => {
    for (const model of AI_VIDEO_TOOLKIT_MODELS) {
      const profile = deriveVisualInputProfile(model);
      expect(profile.mode === 'exclusive' || profile.mode === 'slots').toBe(true);
      expect(profile.lipSync.verification.status).toBe('unverified');
    }
  });

  it('resolves without a first frame when the model has no i2v slot', () => {
    const t2vOnly: VisualInputProfile = {
      ...slotModel,
      firstFrame: { supported: false },
      references: { ...slotModel.references, max: 0 },
    };
    const plan = resolveVisualInputs({
      sceneClass: 'environment',
      requirements: req(),
      profile: t2vOnly,
      previousFrameUrl: 'https://x/prev.jpg',
      references: [],
    });
    expect(plan.transition.mode).toBe('match-cut');
    expect(plan.warnings).toContain('model_has_no_first_frame_slot');
  });
});
