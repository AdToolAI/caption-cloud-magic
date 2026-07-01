// Maps AI Video Toolkit model families to the Composer's ClipSource enum,
// so the Toolkit can reuse `prepareSceneAnchor` (Nano-Banana scene-aware
// first-frame composition) with the exact same Strategy Matrix (v168 anti-
// clone, v181 depicted-face-lock, Vidu subject-ref, Sora text-only, …).
//
// Returns `null` for families that have no ClipSource equivalent (LTX, Grok).
// Callers must then fall back to the old raw-portrait behaviour.

import type { ClipSource } from '@/types/video-composer';
import type { ToolkitModel } from '@/config/aiVideoModelRegistry';

export function toolkitModelToClipSource(model: ToolkitModel): ClipSource | null {
  switch (model.family) {
    case 'kling':      return 'ai-kling';
    case 'veo':        return 'ai-veo';
    case 'wan':        return 'ai-wan';
    case 'hailuo':     return 'ai-hailuo';
    case 'luma':       return 'ai-luma';
    case 'seedance':   return 'ai-seedance';
    case 'sora':       return 'ai-sora';
    case 'runway':     return 'ai-runway';
    case 'pika':       return 'ai-pika';
    case 'vidu':       return 'ai-vidu';
    case 'happyhorse': return 'ai-happyhorse';
    // LTX / Grok have no ClipSource equivalent — skip anchor composition.
    case 'ltx':
    case 'grok':
    default:
      return null;
  }
}
