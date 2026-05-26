import type { PictureMode } from "@/config/pictureStudioModels";

interface GeneratedImage {
  id?: string;
  url: string;
  prompt: string;
  style: string;
  aspectRatio: string;
}

interface ImageGeneratorState {
  prompt: string;
  style: string;
  aspectRatio: string;
  quality: 'fast' | 'pro';
  /** legacy boolean — kept for backwards compat with older cached states */
  editMode: boolean;
  /** new: explicit mode replacing editMode */
  mode?: PictureMode;
  /** new: i2i strength 0..100 (only used in transform mode) */
  strength?: number;
  referenceImage: string | null;
  styleReference?: string | null;
  generatedImages: GeneratedImage[];
}

let cachedState: ImageGeneratorState | null = null;

export function getCachedState(): ImageGeneratorState | null {
  return cachedState;
}

export function setCachedState(state: ImageGeneratorState): void {
  cachedState = { ...state };
}

export function clearCachedState(): void {
  cachedState = null;
}
