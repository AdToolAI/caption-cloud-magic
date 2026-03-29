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
  editMode: boolean;
  referenceImage: string | null;
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
