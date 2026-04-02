const DRAFT_KEY = 'directors-cut-draft';
const DRAFT_VERSION = 1;

export interface SubtitleSafeZone {
  enabled: boolean;
  mode: 'reframe' | 'ai';
  preset: 'light' | 'medium' | 'strong' | 'custom';
  zoom: number;       // e.g. 1.08 = 8% zoom
  offsetY: number;    // negative = shift up, e.g. -4 means 4% up
  bottomBandPercent: number; // percentage of bottom area to crop, e.g. 10
}

export const DEFAULT_SUBTITLE_SAFE_ZONE: SubtitleSafeZone = {
  enabled: false,
  mode: 'reframe',
  preset: 'medium',
  zoom: 1.12,
  offsetY: -6,
  bottomBandPercent: 12,
};

export const SAFE_ZONE_PRESETS: Record<string, Partial<SubtitleSafeZone>> = {
  light: { zoom: 1.09, offsetY: -4, bottomBandPercent: 8 },
  medium: { zoom: 1.16, offsetY: -7, bottomBandPercent: 14 },
  strong: { zoom: 1.28, offsetY: -11, bottomBandPercent: 22 },
};

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
  cleanedVideoUrl?: string;
  capCutAudioTracks: any[];
  capCutSubtitleTrack: any;
  subtitleSafeZone?: SubtitleSafeZone;
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
