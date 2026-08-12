/**
 * modelProfiles.ts — turns registry capabilities into a slot topology.
 *
 * A model may declare `visualInputs` explicitly in the registry; everything
 * else is derived from the existing `capabilities` flags so the topology
 * covers ALL models without hand-maintaining 30 duplicate blocks.
 *
 * `supported` means "per provider docs". `verified` is set ONLY by the
 * administrative capability test — never by production traffic.
 */

import { AI_VIDEO_TOOLKIT_MODELS, type ToolkitModel } from '@/config/aiVideoModelRegistry';
import type { VisualInputProfile } from './types';

/**
 * Lip-sync certification is owned by the v425 provider contract
 * (`lipsyncMasterProvider.ts`) and mirrored backend-side in
 * `supabase/functions/_shared/composer-ai-sources.ts`. This module must never
 * keep a second, drifting list.
 */
function isLipSyncCertified(model: ToolkitModel): boolean {
  return isLipsyncCertifiedProvider(modelIdToSource(model.id).clipSource);
}


export function deriveVisualInputProfile(model: ToolkitModel): VisualInputProfile {
  if (model.visualInputs) return model.visualInputs;

  const caps = model.capabilities;
  const exclusive = caps.refExclusive === true;
  const maxRefs = caps.multiRef ? (caps.maxReferences ?? 1) : 0;
  const lipSyncSupported = isLipSyncCertified(model);

  if (exclusive) {
    return {
      mode: 'exclusive',
      modes: [
        ...(caps.i2v ? (['first-frame'] as const) : []),
        ...(caps.endFrame || caps.i2v ? (['first-last-frame'] as const) : []),
        ...(maxRefs > 0 ? (['references'] as const) : []),
      ],
      firstFrame: { supported: caps.i2v === true, slot: 'visual-input' },
      endFrame: { supported: caps.i2v === true, slot: 'visual-input', requiresFirstFrame: true },
      references: {
        max: maxRefs,
        slot: 'visual-input',
        videos: caps.maxReferenceVideos ?? (caps.v2v ? 1 : 0),
        audios: caps.maxReferenceAudios ?? 0,
        character: true,
        product: true,
        location: true,
      },
      lipSync: {
        supported: lipSyncSupported,
        requiresIdentityReference: true,
        conflictsWithFirstFrame: true,
        verification: { status: 'unverified' },
      },
    };
  }

  // Models with a true anchor slot keep references separate from frame 0.
  const separateReferenceSlot = caps.anchorOnly === true;

  return {
    mode: 'slots',
    firstFrame: { supported: caps.i2v === true, slot: 'image-input' },
    endFrame: {
      supported: caps.endFrame === true,
      slot: caps.endFrame ? 'end-image' : undefined,
      requiresFirstFrame: false,
    },
    references: {
      max: maxRefs,
      slot: separateReferenceSlot ? 'references' : 'image-input',
      videos: caps.maxReferenceVideos ?? (caps.v2v ? 1 : 0),
      audios: caps.maxReferenceAudios ?? 0,
      character: true,
      product: true,
      location: true,
    },
    lipSync: {
      supported: lipSyncSupported,
      requiresIdentityReference: true,
      conflictsWithFirstFrame: !separateReferenceSlot,
      verification: { status: 'unverified' },
    },
  };
}

export function getVisualInputProfileByModelId(modelId: string): VisualInputProfile | undefined {
  const model = AI_VIDEO_TOOLKIT_MODELS.find((m) => m.id === modelId);
  return model ? deriveVisualInputProfile(model) : undefined;
}

export function getAllVisualInputProfiles(): Record<string, VisualInputProfile> {
  return Object.fromEntries(
    AI_VIDEO_TOOLKIT_MODELS.map((m) => [m.id, deriveVisualInputProfile(m)]),
  );
}
