const DRAFT_KEY = 'directors-cut-draft';
const DRAFT_VERSION = 1;

export interface DirectorsCutDraft {
  version: number;
  updatedAt: string;
  currentStep: number;
  selectedVideo: any | null;
  scenes: any[];
  transitions: any[];
  appliedEffects: any;
  audioEnhancements: any;
  exportSettings: any;
  styleTransfer: any;
  colorGrading: any;
  sceneColorGrading: any;
  speedKeyframes: any[];
  kenBurnsKeyframes: any[];
  chromaKey: any;
  upscaling: any;
  interpolation: any;
  restoration: any;
  objectRemoval: any;
  textOverlays: any[];
  voiceOverUrl?: string;
  backgroundMusicUrl?: string;
  capCutAudioTracks: any[];
  capCutSubtitleTrack: any;
}

export function saveDraft(data: Omit<DirectorsCutDraft, 'version' | 'updatedAt'>): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      ...data,
      version: DRAFT_VERSION,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}

export function loadDraft(): DirectorsCutDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DirectorsCutDraft;
    if (parsed.version !== DRAFT_VERSION) {
      sessionStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

export function clearDraft(): void {
  sessionStorage.removeItem(DRAFT_KEY);
}

export function hasDraft(): boolean {
  return loadDraft() !== null;
}
