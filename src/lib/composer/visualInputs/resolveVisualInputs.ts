/**
 * resolveVisualInputs.ts — the ONLY decision instance of the
 * Visual-Continuity-System.
 *
 * CORE INVARIANT:
 *   Continuity darf niemals einen geschützten Identity- oder Sync-Anchor
 *   verdrängen.
 *
 * Provider adapters translate the returned plan, they never decide anything.
 * This function is pure: it never writes `referenceImageUrl` or
 * `lockReferenceUrl` and never touches the (frozen) lip-sync chain.
 */

import { budgetReferences } from './referenceBudget';
import { anchorStrategyFor, arbitrateSlots } from './slotArbitration';
import type {
  AnchorStrategy,
  ResolvedVisualPlan,
  ResolveVisualInputsArgs,
  VisualReference,
} from './types';

function byRole(refs: VisualReference[], role: VisualReference['role']): VisualReference[] {
  return refs.filter((r) => r.role === role);
}

export function resolveVisualInputs(args: ResolveVisualInputsArgs): ResolvedVisualPlan {
  const {
    sceneClass,
    requirements,
    profile,
    previousFrameUrl,
    previousClipUrl,
    endFrameUrl,
    references,
    continuityPreference = 'auto',
  } = args;

  const warnings: string[] = [];

  // Protected anchors: identity references in an identity-critical or
  // lip-sync scene can never be dropped or displaced.
  const candidates: VisualReference[] = references.map((ref) => ({
    ...ref,
    protected:
      ref.protected ??
      ((requirements.lipSync || requirements.identityCritical) && ref.role === 'character'),
  }));

  const hasProtectedAnchor = candidates.some((r) => r.protected);

  let strategy: AnchorStrategy = anchorStrategyFor(sceneClass, requirements);
  if (continuityPreference === 'seamless' && !hasProtectedAnchor) strategy = 'transition-priority';
  if (continuityPreference === 'identity') strategy = 'identity-priority';

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

  // Explicit user override — never allowed to break the invariant.
  if (continuityPreference === 'match-cut') {
    transition = 'match-cut';
    inputMode = profile.references.max > 0 ? 'references' : 'none';
  }
  if (continuityPreference === 'seamless' && transition === 'match-cut' && hasProtectedAnchor) {
    warnings.push('seamless_denied_protected_anchor');
  }

  // The previous clip enters the reference budget as a continuity reference.
  const budgetInput: VisualReference[] =
    transition === 'clip-reference' && previousClipUrl
      ? [
          ...candidates,
          {
            url: previousClipUrl,
            role: 'continuity',
            kind: 'video',
            sceneRelevance: 1,
            continuityImportance: 1,
            identityImportance: 1,
          },
        ]
      : candidates;

  const { selected, dropped } = budgetReferences(budgetInput, profile);
  if (dropped.length > 0) warnings.push(`references_trimmed:${dropped.length}`);

  const droppedProtected = dropped.filter((r) => r.protected);
  if (droppedProtected.length > 0) warnings.push('protected_reference_dropped');

  const useFirstFrame = transition === 'frame-chain' || transition === 'endframe-bridge';

  return {
    transition: {
      mode: transition,
      sourceFrameUrl: useFirstFrame ? previousFrameUrl : undefined,
      sourceClipUrl: transition === 'clip-reference' ? previousClipUrl : undefined,
    },
    anchors: {
      identity: byRole(selected, 'character'),
      product: byRole(selected, 'product'),
      location: byRole(selected, 'location'),
    },
    references: selected,
    firstFrameUrl: useFirstFrame ? previousFrameUrl : undefined,
    endFrameUrl: transition === 'endframe-bridge' ? endFrameUrl : undefined,
    inputMode,
    anchorStrategy: strategy,
    constraints: {
      identityProtected: hasProtectedAnchor,
      lipSyncProtected: requirements.lipSync,
    },
    warnings,
  };
}
