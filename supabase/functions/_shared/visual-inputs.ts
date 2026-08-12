// ============================================================================
// _shared/visual-inputs.ts — Visual-Continuity-System, render-path edition
// ----------------------------------------------------------------------------
// CORE INVARIANT:
//   Continuity darf niemals einen geschützten Identity- oder Sync-Anchor
//   verdrängen.
//
// This module is the ONLY place that decides which image/video inputs a
// provider receives. Provider branches translate the plan, they never pick an
// input themselves.
//
// Lip-sync contract (v400): `reference_image_url` is BOTH the i2v start image
// and the geometry anchor of the frozen lip-sync chain (T3/T5). This module
// therefore never writes it. For a scene with lip-sync intent the resolver
// returns exactly that URL as the first frame — not as a special case, but as
// the only possible outcome of the invariant above (a protected anchor cannot
// be displaced, so the transition degrades to `match-cut`, and `match-cut`
// means "anchor unchanged").
//
// Pure TypeScript, no Deno APIs — the frontend parity test imports this file.
// ============================================================================

import { isLipSyncIntentionalRow, type LipSyncSceneSnake } from "./lipSyncIntent.ts";

/* ────────────────────────────── Types ────────────────────────────────── */

export type VisualSceneClass = "environment" | "product" | "character";

export interface SceneVisualRequirements {
  lipSync: boolean;
  identityCritical: boolean;
  productCritical: boolean;
  locationContinuity: "none" | "medium" | "high";
}

export type VisualReferenceRole =
  | "character"
  | "product"
  | "location"
  | "style"
  | "continuity";

export interface VisualReference {
  url: string;
  role: VisualReferenceRole;
  kind?: "image" | "video";
  entityId?: string;
  sceneRelevance?: number;
  continuityImportance?: number;
  identityImportance?: number;
  protected?: boolean;
}

export type VisualInputMode =
  | "first-frame"
  | "first-last-frame"
  | "references"
  | "clip-reference";

export type VerificationStatus = "unverified" | "verified" | "failed";

export interface VisualInputProfile {
  mode: "exclusive" | "slots";
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
    supported: boolean;
    requiresIdentityReference?: boolean;
    conflictsWithFirstFrame?: boolean;
    verification: { status: VerificationStatus; testedAt?: string; testCase?: string };
  };
}

export type TransitionMode =
  | "frame-chain"
  | "clip-reference"
  | "endframe-bridge"
  | "match-cut";

export type AnchorStrategy =
  | "transition-priority"
  | "identity-priority"
  | "product-priority"
  | "balanced";

export type ContinuityPreference = "auto" | "seamless" | "identity" | "match-cut";

export interface ResolvedVisualPlan {
  transition: { mode: TransitionMode; sourceFrameUrl?: string; sourceClipUrl?: string };
  anchors: {
    identity: VisualReference[];
    product: VisualReference[];
    location: VisualReference[];
  };
  references: VisualReference[];
  /** The ONE image every provider branch must use as its i2v start image. */
  firstFrameUrl?: string;
  endFrameUrl?: string;
  inputMode: VisualInputMode | "none";
  anchorStrategy: AnchorStrategy;
  constraints: { identityProtected: boolean; lipSyncProtected: boolean };
  warnings: string[];
}

/* ───────────────── Capability facts per composer clip source ─────────── */

export interface SourceCapabilities {
  i2v?: boolean;
  v2v?: boolean;
  endFrame?: boolean;
  multiRef?: boolean;
  maxReferences?: number;
  maxReferenceVideos?: number;
  maxReferenceAudios?: number;
  anchorOnly?: boolean;
  refExclusive?: boolean;
}

/**
 * Mirrors `src/config/aiVideoModelRegistry.ts` for the models the composer can
 * actually dispatch. Kept in parity by
 * `src/lib/composer/__tests__/visualInputsBackendParity.test.ts`.
 */
export const CLIP_SOURCE_CAPABILITIES: Record<string, SourceCapabilities> = {
  "ai-hailuo": { i2v: true },
  "ai-kling": {
    i2v: true,
    v2v: true,
    anchorOnly: true,
    multiRef: true,
    maxReferences: 7,
  },
  "ai-kling-omni": {
    i2v: true,
    v2v: true,
    anchorOnly: true,
    multiRef: true,
    maxReferences: 7,
  },
  "ai-wan": { i2v: true },
  "ai-seedance": { i2v: true, endFrame: true },
  "ai-seedance25": {
    i2v: true,
    v2v: true,
    endFrame: true,
    multiRef: true,
    maxReferences: 30,
    maxReferenceVideos: 10,
    maxReferenceAudios: 10,
    refExclusive: true,
  },
  "ai-luma": { i2v: true, endFrame: true },
  "ai-veo": { i2v: true, multiRef: true, maxReferences: 3 },
  "ai-happyhorse": { i2v: true },
  "ai-vidu": { i2v: true, endFrame: true },
  "ai-runway": { v2v: true, multiRef: true, maxReferences: 1 },
  "ai-pika": { i2v: true },
  "ai-sora": { i2v: true },
  "ai-grok": { i2v: true },
  "ai-ltx": { i2v: true },
};

/**
 * Certified lip-sync master-plate providers — mirrors `LIPSYNC_PROVIDERS` in
 * `compose-video-clips/index.ts`. `ai-seedance25` was certified in v418
 * (Phase 3a) and is gated at dispatch time by the feature flag
 * `composer.feature.seedance25_lipsync`.
 */
export const LIPSYNC_CERTIFIED_SOURCES = new Set([
  "ai-happyhorse",
  "ai-hailuo",
  "ai-kling",
  "ai-wan",
  "ai-seedance",
  "ai-seedance25",
  "ai-luma",
]);


export function deriveProfileFromCapabilities(
  caps: SourceCapabilities,
  lipSyncSupported: boolean,
): VisualInputProfile {
  const maxRefs = caps.multiRef ? (caps.maxReferences ?? 1) : 0;
  const videos = caps.maxReferenceVideos ?? (caps.v2v ? 1 : 0);

  if (caps.refExclusive === true) {
    const modes: VisualInputMode[] = [];
    if (caps.i2v) modes.push("first-frame");
    if (caps.endFrame || caps.i2v) modes.push("first-last-frame");
    if (maxRefs > 0) modes.push("references");
    return {
      mode: "exclusive",
      modes,
      firstFrame: { supported: caps.i2v === true, slot: "visual-input" },
      endFrame: {
        supported: caps.i2v === true,
        slot: "visual-input",
        requiresFirstFrame: true,
      },
      references: {
        max: maxRefs,
        slot: "visual-input",
        videos,
        audios: caps.maxReferenceAudios ?? 0,
        character: true,
        product: true,
        location: true,
      },
      lipSync: {
        supported: lipSyncSupported,
        requiresIdentityReference: true,
        conflictsWithFirstFrame: true,
        verification: { status: "unverified" },
      },
    };
  }

  const separateReferenceSlot = caps.anchorOnly === true;
  return {
    mode: "slots",
    firstFrame: { supported: caps.i2v === true, slot: "image-input" },
    endFrame: {
      supported: caps.endFrame === true,
      slot: caps.endFrame ? "end-image" : undefined,
      requiresFirstFrame: false,
    },
    references: {
      max: maxRefs,
      slot: separateReferenceSlot ? "references" : "image-input",
      videos,
      audios: caps.maxReferenceAudios ?? 0,
      character: true,
      product: true,
      location: true,
    },
    lipSync: {
      supported: lipSyncSupported,
      requiresIdentityReference: true,
      conflictsWithFirstFrame: !separateReferenceSlot,
      verification: { status: "unverified" },
    },
  };
}

/** Unknown sources fall back to "plain i2v, no references" — never to a
 *  capability the provider might not have. */
export function getVisualInputProfileForSource(clipSource: string | null | undefined): VisualInputProfile {
  const key = String(clipSource ?? "");
  const caps = CLIP_SOURCE_CAPABILITIES[key] ?? { i2v: true };
  return deriveProfileFromCapabilities(caps, LIPSYNC_CERTIFIED_SOURCES.has(key));
}

/* ───────────────────────── Scene classification ──────────────────────── */

export interface ClassifiableSceneRow extends LipSyncSceneSnake {
  scene_class?: VisualSceneClass | null;
  character_shots?: unknown[] | null;
  product_references?: { url: string }[] | null;
  location_references?: { url: string }[] | null;
  continuity_locked?: boolean | null;
  lock_reference_url?: string | null;
}

export function classifySceneRow(row: ClassifiableSceneRow | null | undefined): VisualSceneClass {
  if (!row) return "environment";
  if (row.scene_class) return row.scene_class;
  const hasCast = Array.isArray(row.character_shots) && row.character_shots.length > 0;
  if (hasCast || isLipSyncIntentionalRow(row)) return "character";
  if ((row.product_references?.length ?? 0) > 0) return "product";
  return "environment";
}

export function deriveRequirementsFromRow(
  row: ClassifiableSceneRow | null | undefined,
  sceneClass: VisualSceneClass = classifySceneRow(row),
): SceneVisualRequirements {
  const lipSync = isLipSyncIntentionalRow(row ?? undefined);
  const identityCritical = lipSync ||
    (sceneClass === "character" &&
      (Boolean(row?.continuity_locked) ||
        Boolean(row?.lock_reference_url) ||
        (row?.character_shots?.length ?? 0) > 0));
  const productCritical = sceneClass === "product" &&
    (row?.product_references?.length ?? 0) > 0;
  const locationRefs = row?.location_references?.length ?? 0;
  const locationContinuity: SceneVisualRequirements["locationContinuity"] = locationRefs > 1
    ? "high"
    : locationRefs === 1
    ? "medium"
    : "none";

  return { lipSync, identityCritical, productCritical, locationContinuity };
}

/* ─────────────────────────── Reference budget ────────────────────────── */

const clamp01 = (n: number | undefined, fallback = 1): number => {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.min(1, Math.max(0, n));
};

export function providerCompatibility(ref: VisualReference, profile: VisualInputProfile): number {
  if (ref.kind === "video") return (profile.references.videos ?? 0) > 0 ? 1 : 0;
  if (ref.role === "character") return profile.references.character === false ? 0.2 : 1;
  if (ref.role === "product") return profile.references.product === false ? 0.2 : 1;
  if (ref.role === "location") return profile.references.location === false ? 0.2 : 1;
  return 1;
}

export function referenceScore(ref: VisualReference, profile: VisualInputProfile): number {
  return clamp01(ref.sceneRelevance) *
    clamp01(ref.continuityImportance) *
    clamp01(ref.identityImportance) *
    providerCompatibility(ref, profile);
}

export function budgetReferences(
  references: VisualReference[],
  profile: VisualInputProfile,
): { selected: VisualReference[]; dropped: VisualReference[] } {
  const maxImages = Math.max(0, profile.references.max ?? 0);
  const maxVideos = Math.max(0, profile.references.videos ?? 0);

  const scored = references
    .map((ref, index) => ({ ref, index, score: referenceScore(ref, profile) }))
    .sort((a, b) => {
      if (a.ref.protected !== b.ref.protected) return a.ref.protected ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

  const selected: VisualReference[] = [];
  const dropped: VisualReference[] = [];
  let images = 0;
  let videos = 0;

  for (const { ref, score } of scored) {
    const isVideo = ref.kind === "video";
    const capReached = isVideo ? videos >= maxVideos : images >= maxImages;
    if (capReached || (score === 0 && !ref.protected)) {
      dropped.push(ref);
      continue;
    }
    selected.push(ref);
    if (isVideo) videos += 1;
    else images += 1;
  }

  return { selected, dropped };
}

/* ─────────────────────────── Slot arbitration ────────────────────────── */

export function anchorStrategyFor(
  sceneClass: VisualSceneClass,
  req: SceneVisualRequirements,
): AnchorStrategy {
  if (req.lipSync || (sceneClass === "character" && req.identityCritical)) {
    return "identity-priority";
  }
  if (sceneClass === "product" && req.productCritical) return "product-priority";
  if (sceneClass === "environment") return "transition-priority";
  return "balanced";
}

export function slotsCollide(profile: VisualInputProfile): boolean {
  if (profile.mode === "exclusive") return true;
  const frameSlot = profile.firstFrame.slot;
  const refSlot = profile.references.slot;
  return Boolean(frameSlot && refSlot && frameSlot === refSlot);
}

export interface ArbitrationInput {
  profile: VisualInputProfile;
  requirements: SceneVisualRequirements;
  strategy: AnchorStrategy;
  hasProtectedAnchor: boolean;
  hasPreviousFrame: boolean;
  hasPreviousClip: boolean;
  hasEndFrame: boolean;
}

export function arbitrateSlots(
  input: ArbitrationInput,
): { transition: TransitionMode; inputMode: VisualInputMode | "none"; warnings: string[] } {
  const { profile, requirements, strategy, hasProtectedAnchor } = input;
  const warnings: string[] = [];
  const collide = slotsCollide(profile);
  const canClipReference = input.hasPreviousClip &&
    (profile.references.videos ?? 0) > 0 &&
    (profile.mode !== "exclusive" || (profile.modes ?? []).includes("references"));

  if (hasProtectedAnchor && collide) {
    if (canClipReference && !requirements.lipSync) {
      return { transition: "clip-reference", inputMode: "references", warnings };
    }
    // Exclusive-slot providers (Seedance 2.5) can carry EITHER a first frame
    // OR references — never both. With a protected anchor the anchor wins the
    // slot: it is the composed, identity-verified plate every other provider
    // gets as its i2v start image. Sending the raw cast portraits instead is
    // what makes ModelArk reject the task with
    // `InputImageSensitiveContentDetected.PrivacyInformation`.
    const anchorTakesSlot = Boolean(input.hasAnchorImage) && profile.firstFrame.supported;
    warnings.push(
      requirements.lipSync
        ? "lipsync_anchor_protected_match_cut"
        : "identity_anchor_protected_match_cut",
    );
    if (anchorTakesSlot) {
      warnings.push("anchor_takes_exclusive_slot");
      return { transition: "match-cut", inputMode: "first-frame", warnings };
    }
    return { transition: "match-cut", inputMode: "references", warnings };
  }


  if (requirements.lipSync) {
    const verified = profile.lipSync.supported &&
      profile.lipSync.verification.status === "verified";
    if (!verified) {
      warnings.push("lipsync_capability_unverified_match_cut");
      return { transition: "match-cut", inputMode: "references", warnings };
    }
  }

  if (input.hasEndFrame && profile.endFrame.supported) {
    if (profile.endFrame.requiresFirstFrame && !input.hasPreviousFrame) {
      warnings.push("endframe_requires_first_frame");
    } else {
      return { transition: "endframe-bridge", inputMode: "first-last-frame", warnings };
    }
  }

  if (canClipReference && strategy !== "transition-priority") {
    return { transition: "clip-reference", inputMode: "references", warnings };
  }

  if (input.hasPreviousFrame && profile.firstFrame.supported) {
    return { transition: "frame-chain", inputMode: "first-frame", warnings };
  }

  if (canClipReference) {
    return { transition: "clip-reference", inputMode: "references", warnings };
  }

  if (input.hasPreviousFrame && !profile.firstFrame.supported) {
    warnings.push("model_has_no_first_frame_slot");
  }

  return { transition: "match-cut", inputMode: "references", warnings };
}

/* ──────────────────────────── The resolver ───────────────────────────── */

export interface ResolveVisualInputsArgs {
  sceneClass: VisualSceneClass;
  requirements: SceneVisualRequirements;
  profile: VisualInputProfile;
  /**
   * The identity/geometry anchor of the scene (`reference_image_url`).
   * Read-only here. When it exists it is the fallback first frame for every
   * non-continuity outcome, which is what keeps the lip-sync chain identical.
   */
  anchorImageUrl?: string;
  previousFrameUrl?: string;
  previousClipUrl?: string;
  endFrameUrl?: string;
  references: VisualReference[];
  continuityPreference?: ContinuityPreference;
}

function byRole(refs: VisualReference[], role: VisualReferenceRole): VisualReference[] {
  return refs.filter((r) => r.role === role);
}

export function resolveVisualInputs(args: ResolveVisualInputsArgs): ResolvedVisualPlan {
  const {
    sceneClass,
    requirements,
    profile,
    anchorImageUrl,
    previousFrameUrl,
    previousClipUrl,
    endFrameUrl,
    references,
    continuityPreference = "auto",
  } = args;

  const warnings: string[] = [];

  const candidates: VisualReference[] = references.map((ref) => ({
    ...ref,
    protected: ref.protected ??
      ((requirements.lipSync || requirements.identityCritical) && ref.role === "character"),
  }));

  // An anchor image on an identity-critical scene is itself protected, even
  // when no explicit character reference was passed in.
  const hasProtectedAnchor = candidates.some((r) => r.protected) ||
    (Boolean(anchorImageUrl) && (requirements.lipSync || requirements.identityCritical));

  let strategy: AnchorStrategy = anchorStrategyFor(sceneClass, requirements);
  if (continuityPreference === "seamless" && !hasProtectedAnchor) strategy = "transition-priority";
  if (continuityPreference === "identity") strategy = "identity-priority";

  let { transition, inputMode, warnings: slotWarnings } = arbitrateSlots({
    profile,
    requirements,
    strategy,
    hasProtectedAnchor,
    hasPreviousFrame: Boolean(previousFrameUrl),
    hasPreviousClip: Boolean(previousClipUrl),
    hasEndFrame: Boolean(endFrameUrl),
  });
  warnings.push(...slotWarnings);

  if (continuityPreference === "match-cut") {
    transition = "match-cut";
    inputMode = profile.references.max > 0 ? "references" : "none";
  }
  if (continuityPreference === "seamless" && transition === "match-cut" && hasProtectedAnchor) {
    warnings.push("seamless_denied_protected_anchor");
  }

  const budgetInput: VisualReference[] = transition === "clip-reference" && previousClipUrl
    ? [
      ...candidates,
      {
        url: previousClipUrl,
        role: "continuity" as const,
        kind: "video" as const,
        sceneRelevance: 1,
        continuityImportance: 1,
        identityImportance: 1,
      },
    ]
    : candidates;

  const { selected, dropped } = budgetReferences(budgetInput, profile);
  if (dropped.length > 0) warnings.push(`references_trimmed:${dropped.length}`);
  if (dropped.some((r) => r.protected)) warnings.push("protected_reference_dropped");

  const useContinuityFrame = transition === "frame-chain" || transition === "endframe-bridge";

  // The anchor stays the first frame for every non-continuity outcome. For a
  // lip-sync scene the transition is always `match-cut`, so this is always the
  // anchor — byte-identical to the pre-resolver behaviour.
  const firstFrameUrl = useContinuityFrame ? previousFrameUrl : anchorImageUrl;

  return {
    transition: {
      mode: transition,
      sourceFrameUrl: useContinuityFrame ? previousFrameUrl : undefined,
      sourceClipUrl: transition === "clip-reference" ? previousClipUrl : undefined,
    },
    anchors: {
      identity: byRole(selected, "character"),
      product: byRole(selected, "product"),
      location: byRole(selected, "location"),
    },
    references: selected,
    firstFrameUrl: firstFrameUrl || undefined,
    endFrameUrl: transition === "endframe-bridge" ? endFrameUrl : undefined,
    inputMode,
    anchorStrategy: strategy,
    constraints: {
      identityProtected: hasProtectedAnchor,
      lipSyncProtected: requirements.lipSync,
    },
    warnings,
  };
}

/* ─────────────────── One-call entry point for the render path ────────── */

export interface SceneVisualContext {
  clipSource?: string | null;
  /** `reference_image_url` — the anchor. Never written by this module. */
  anchorImageUrl?: string | null;
  /** Explicit end-frame target of THIS scene (`end_reference_image_url`). */
  endFrameUrl?: string | null;
  /** Last usable continuity frame of the PREVIOUS scene. */
  previousFrameUrl?: string | null;
  /** Rendered clip of the PREVIOUS scene (reference-video continuity). */
  previousClipUrl?: string | null;
  references?: VisualReference[];
  continuityPreference?: ContinuityPreference | null;
}

export function planSceneVisualInputs(
  row: ClassifiableSceneRow,
  ctx: SceneVisualContext,
): ResolvedVisualPlan {
  const sceneClass = classifySceneRow(row);
  const requirements = deriveRequirementsFromRow(row, sceneClass);
  const profile = getVisualInputProfileForSource(ctx.clipSource);

  return resolveVisualInputs({
    sceneClass,
    requirements,
    profile,
    anchorImageUrl: ctx.anchorImageUrl ?? undefined,
    endFrameUrl: ctx.endFrameUrl ?? undefined,
    previousFrameUrl: ctx.previousFrameUrl ?? undefined,
    previousClipUrl: ctx.previousClipUrl ?? undefined,
    references: ctx.references ?? [],
    continuityPreference: ctx.continuityPreference ?? "auto",
  });
}
