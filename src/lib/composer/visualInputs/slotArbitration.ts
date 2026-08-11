/**
 * slotArbitration.ts — decides WHICH input mode / slot combination a model can
 * serve for a given intent.
 *
 * CORE INVARIANT: continuity never displaces a protected identity or sync
 * anchor. When a first frame and a protected anchor collide in the same slot,
 * the anchor wins and the transition degrades to `match-cut`.
 */

import type {
  AnchorStrategy,
  SceneVisualRequirements,
  TransitionMode,
  VisualInputMode,
  VisualInputProfile,
  VisualSceneClass,
} from './types';

export function anchorStrategyFor(
  sceneClass: VisualSceneClass,
  req: SceneVisualRequirements,
): AnchorStrategy {
  if (req.lipSync || (sceneClass === 'character' && req.identityCritical)) return 'identity-priority';
  if (sceneClass === 'product' && req.productCritical) return 'product-priority';
  if (sceneClass === 'environment') return 'transition-priority';
  return 'balanced';
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

export interface ArbitrationResult {
  transition: TransitionMode;
  inputMode: VisualInputMode | 'none';
  warnings: string[];
}

/** Do the first frame and the references compete for one provider slot? */
export function slotsCollide(profile: VisualInputProfile): boolean {
  if (profile.mode === 'exclusive') return true;
  const frameSlot = profile.firstFrame.slot;
  const refSlot = profile.references.slot;
  return Boolean(frameSlot && refSlot && frameSlot === refSlot);
}

export function arbitrateSlots(input: ArbitrationInput): ArbitrationResult {
  const { profile, requirements, strategy, hasProtectedAnchor } = input;
  const warnings: string[] = [];
  const collide = slotsCollide(profile);
  const canClipReference =
    input.hasPreviousClip &&
    (profile.references.videos ?? 0) > 0 &&
    (profile.mode !== 'exclusive' || (profile.modes ?? []).includes('references'));

  // 1. Protected anchor (identity / lip-sync) always keeps its slot.
  if (hasProtectedAnchor && collide) {
    // Reference-video continuity lives in the SAME reference budget, so it is
    // the one continuity option that does not displace the anchor.
    if (canClipReference && !requirements.lipSync) {
      return { transition: 'clip-reference', inputMode: 'references', warnings };
    }
    if (requirements.lipSync) {
      warnings.push('lipsync_anchor_protected_match_cut');
    } else {
      warnings.push('identity_anchor_protected_match_cut');
    }
    return { transition: 'match-cut', inputMode: 'references', warnings };
  }

  // 2. Lip-sync without slot collision still requires a certified + verified
  //    provider before continuity may touch the first frame.
  if (requirements.lipSync) {
    const verified = profile.lipSync.supported && profile.lipSync.verification.status === 'verified';
    if (!verified) {
      warnings.push('lipsync_capability_unverified_match_cut');
      return { transition: 'match-cut', inputMode: 'references', warnings };
    }
  }

  // 3. Explicit end-frame target.
  if (input.hasEndFrame && profile.endFrame.supported) {
    const mode: VisualInputMode =
      profile.mode === 'exclusive' ? 'first-last-frame' : 'first-last-frame';
    if (profile.endFrame.requiresFirstFrame && !input.hasPreviousFrame) {
      warnings.push('endframe_requires_first_frame');
    } else {
      return { transition: 'endframe-bridge', inputMode: mode, warnings };
    }
  }

  // 4. Reference-video continuity beats a still frame when available: motion
  //    and grading carry over instead of a single frame.
  if (canClipReference && strategy !== 'transition-priority') {
    return { transition: 'clip-reference', inputMode: 'references', warnings };
  }

  // 5. Plain frame chaining.
  if (input.hasPreviousFrame && profile.firstFrame.supported) {
    return { transition: 'frame-chain', inputMode: 'first-frame', warnings };
  }

  if (canClipReference) {
    return { transition: 'clip-reference', inputMode: 'references', warnings };
  }

  if (input.hasPreviousFrame && !profile.firstFrame.supported) {
    warnings.push('model_has_no_first_frame_slot');
  }

  return { transition: 'match-cut', inputMode: 'references', warnings };
}
