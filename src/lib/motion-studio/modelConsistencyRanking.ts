/**
 * Motion Studio — Multi-Model Consistency Ranking
 *
 * Tells the user (and the UI) how well each AI video model can preserve a
 * recurring character or location across scenes via image-to-video reference.
 *
 * Used by:
 *  - CastConsistencyMap: shows a per-scene engine badge with the right star count
 *  - VideoModeSelector / MotionStudioTemplatePicker: surfaces a hint when the
 *    user picks a model that does not support i2v at all (Sora 2)
 *
 * Source of truth — keep in sync with `compose-video-clips/index.ts` switch.
 */

import type { ClipSource } from '@/types/video-composer';

export interface ConsistencyInfo {
  /** 0–5 star rating for visual consistency across scenes when a reference image is given. */
  stars: 1 | 2 | 3 | 4 | 5;
  /** Short human-readable label, e.g. "True i2v" or "Prompt-only". */
  mode: string;
  /** Name of the underlying parameter the engine uses, for debugging tooltips. */
  paramName: string;
  /** True if the model literally accepts an image (false → Sora-style prompt fallback). */
  supportsImageInput: boolean;
}

const RANKING: Record<string, ConsistencyInfo> = {
  'ai-kling':    { stars: 5, mode: 'True i2v',     paramName: 'start_image',       supportsImageInput: true  },
  'ai-hailuo':   { stars: 4, mode: 'First-frame',  paramName: 'first_frame_image', supportsImageInput: true  },
  'ai-wan':      { stars: 4, mode: 'i2v variant',  paramName: 'image',             supportsImageInput: true  },
  'ai-seedance': { stars: 4, mode: 'i2v variant',  paramName: 'image',             supportsImageInput: true  },
  'ai-luma':     { stars: 3, mode: 'Keyframe',     paramName: 'start_image',       supportsImageInput: true  },
  'ai-veo':      { stars: 4, mode: 'i2v + Audio',  paramName: 'image',             supportsImageInput: true  },
  'ai-sora':     { stars: 2, mode: 'Prompt-only',  paramName: '—',                 supportsImageInput: false },
  'ai-image':    { stars: 5, mode: 'Image edit',   paramName: 'reference',         supportsImageInput: true  },
  'stock':       { stars: 1, mode: 'No AI',        paramName: '—',                 supportsImageInput: false },
  'upload':      { stars: 5, mode: 'User asset',   paramName: '—',                 supportsImageInput: true  },
};

export function getConsistencyInfo(source: ClipSource | string): ConsistencyInfo {
  return (
    RANKING[source] ?? {
      stars: 1,
      mode: 'Unknown',
      paramName: '—',
      supportsImageInput: false,
    }
  );
}

/**
 * Returns true if this model needs the user to *write more* in the prompt
 * (instead of relying on a reference image) to keep characters consistent.
 */
export function needsPromptHeavyConsistency(source: ClipSource | string): boolean {
  return !getConsistencyInfo(source).supportsImageInput;
}
