/**
 * visualInputs/types.ts — Phase 1 of the Visual-Continuity-System.
 *
 * CORE INVARIANT (asserted by the guard tests):
 *
 *   Continuity darf niemals einen geschützten Identity- oder Sync-Anchor
 *   verdrängen.
 *
 * Everything in this folder is pure logic. Nothing here writes to the
 * database, calls a provider or touches `referenceImageUrl` /
 * `lockReferenceUrl` — those stay owned by the (frozen) lip-sync chain.
 */

import type { PersistedVisualSource, VisualSourceDecision } from './visualSource';



/** What the scene is fundamentally about. Lip-sync is NOT a class. */
export type VisualSceneClass = 'environment' | 'product' | 'character';

export interface SceneVisualRequirements {
  lipSync: boolean;
  identityCritical: boolean;
  productCritical: boolean;
  locationContinuity: 'none' | 'medium' | 'high';
}

export type VisualReferenceRole = 'character' | 'product' | 'location' | 'style' | 'continuity';

export interface VisualReference {
  url: string;
  role: VisualReferenceRole;
  /** Media kind — `video` requires a model with reference-video support. */
  kind?: 'image' | 'video';
  /** Stable id of the underlying entity (character id, product id, …). */
  entityId?: string;
  /** 0..1 — how present this entity is in THIS scene. */
  sceneRelevance?: number;
  /** 0..1 — how much cross-scene continuity depends on it. */
  continuityImportance?: number;
  /** 0..1 — how identity-defining it is (faces high, props low). */
  identityImportance?: number;
  /** True when this reference is a protected identity/sync anchor. */
  protected?: boolean;
}

/* ─────────────── Model capability profile (slot topology) ─────────────── */

export type VisualInputMode = 'first-frame' | 'first-last-frame' | 'references' | 'clip-reference';

export type VerificationStatus = 'unverified' | 'verified' | 'failed';

export interface CapabilityVerification {
  status: VerificationStatus;
  testedAt?: string;
  testCase?: string;
}

export interface VisualInputProfile {
  /**
   * `exclusive` → the model accepts exactly ONE of `modes` per request
   * (Seedance 2.5 / ModelArk). `slots` → inputs live in named slots and
   * coexist when the slot names differ.
   */
  mode: 'exclusive' | 'slots';
  /** Only for `mode: 'exclusive'`. */
  modes?: VisualInputMode[];
  firstFrame: { supported: boolean; slot?: string };
  endFrame: { supported: boolean; slot?: string; requiresFirstFrame?: boolean };
  references: {
    max: number;
    slot?: string;
    videos?: number;
    audios?: number;
    character?: boolean;
    product?: boolean;
    location?: boolean;
  };
  lipSync: {
    /** Certified as a lip-sync master-plate provider (backend allowlist). */
    supported: boolean;
    requiresIdentityReference?: boolean;
    /** True when a first frame and the identity anchor fight over one slot. */
    conflictsWithFirstFrame?: boolean;
    verification: CapabilityVerification;
  };
}

/* ─────────────────────────── Resolver output ─────────────────────────── */

export type TransitionMode = 'frame-chain' | 'clip-reference' | 'endframe-bridge' | 'match-cut';

export type AnchorStrategy =
  | 'transition-priority'
  | 'identity-priority'
  | 'product-priority'
  | 'balanced';

export interface ResolvedVisualPlan {
  transition: { mode: TransitionMode; sourceFrameUrl?: string; sourceClipUrl?: string };
  anchors: {
    identity: VisualReference[];
    product: VisualReference[];
    location: VisualReference[];
  };
  /** Already budgeted and clipped to the model maximum. */
  references: VisualReference[];
  firstFrameUrl?: string;
  endFrameUrl?: string;
  /** Which of the model's exclusive input modes the adapter must use. */
  inputMode: VisualInputMode | 'none';
  anchorStrategy: AnchorStrategy;
  constraints: { identityProtected: boolean; lipSyncProtected: boolean };
  /**
   * v430 Step 3 — requested vs. effective visual-input strategy.
   * `requested: null` = legacy/unmigrated scene (never re-interpreted).
   */
  visualSource: VisualSourceDecision;
  warnings: string[];
}


/* ─────────────────────────── Resolver input ──────────────────────────── */

export interface ResolveVisualInputsArgs {
  sceneClass: VisualSceneClass;
  requirements: SceneVisualRequirements;
  profile: VisualInputProfile;
  /**
   * The scene's identity/geometry anchor (`referenceImageUrl`). Read-only:
   * it is the first frame for every non-continuity outcome, which is what
   * keeps the frozen lip-sync chain byte-identical.
   */
  anchorImageUrl?: string;
  /** Last usable continuity frame of the previous scene, if any. */
  previousFrameUrl?: string;
  /** Rendered clip of the previous scene, for `clip-reference` transitions. */
  previousClipUrl?: string;
  /** Explicit end-frame target for this scene. */
  endFrameUrl?: string;
  /** All candidate references before budgeting. */
  references: VisualReference[];
  /** User override from the UI. */
  continuityPreference?: 'auto' | 'seamless' | 'identity' | 'match-cut';
  /**
   * v430 Step 3 — persisted `composer_scenes.visual_source`.
   * `null`/omitted = legacy scene: arbitration stays pre-v430.
   */
  requestedVisualSource?: PersistedVisualSource;
}
