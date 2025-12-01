// Timeline Types for CapCut-Style Editor

export interface AudioClip {
  id: string;
  trackId: string;
  name: string;
  url: string;
  startTime: number;      // Position auf Timeline (Sekunden)
  duration: number;       // Clip-Länge
  trimStart: number;      // Schnitt-Start im Original
  trimEnd: number;        // Schnitt-Ende im Original
  volume: number;         // Clip-spezifische Lautstärke (0-100)
  fadeIn: number;         // Fade-In Dauer (Sekunden)
  fadeOut: number;        // Fade-Out Dauer (Sekunden)
  waveformData?: number[]; // Für Visualisierung
  source: 'ai-generated' | 'uploaded' | 'library' | 'extracted' | 'original';
  color?: string;         // Clip-Farbe für visuelle Unterscheidung
}

export interface AudioTrack {
  id: string;
  type: 'voiceover' | 'background-music' | 'sound-effect' | 'original';
  name: string;
  clips: AudioClip[];
  volume: number;         // Track Master Volume (0-100)
  muted: boolean;
  locked: boolean;
  solo: boolean;
  color: string;          // Track-Farbe
  icon: string;           // Emoji oder Icon-Name
}

export interface VideoTrackScene {
  id: string;
  startTime: number;
  endTime: number;
  thumbnailUrl?: string;
  name: string;
}

export interface TimelineState {
  videoTrack: {
    scenes: VideoTrackScene[];
    thumbnails: string[];
  };
  audioTracks: AudioTrack[];
  currentTime: number;
  duration: number;
  zoom: number;           // Pixel pro Sekunde
  selectedClipId: string | null;
  selectedTrackId: string | null;
  playheadPosition: number;
  isPlaying: boolean;
  snapToGrid: boolean;
  gridSize: number;       // Sekunden
}

export interface TimelineAction {
  type: 'ADD_CLIP' | 'REMOVE_CLIP' | 'MOVE_CLIP' | 'RESIZE_CLIP' | 
        'UPDATE_CLIP' | 'MUTE_TRACK' | 'SOLO_TRACK' | 'SET_VOLUME' |
        'SELECT_CLIP' | 'SET_PLAYHEAD' | 'SET_ZOOM' | 'UNDO' | 'REDO';
  payload: any;
}

export interface DraggedClip {
  clip: AudioClip;
  originalTrackId: string;
  originalStartTime: number;
}

// Subtitle Types
export interface SubtitleClip {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  style: 'standard' | 'tiktok' | 'subtitle' | 'highlight';
}

export interface SubtitleTrack {
  id: string;
  name: string;
  clips: SubtitleClip[];
  visible: boolean;
  color: string;
  icon: string;
}

export const DEFAULT_SUBTITLE_TRACK: SubtitleTrack = {
  id: 'track-subtitles',
  name: 'Subtitles',
  clips: [],
  visible: true,
  color: '#8b5cf6', // Purple
  icon: '💬',
};

// Default Audio Track Configuration
export const DEFAULT_AUDIO_TRACKS: Omit<AudioTrack, 'clips'>[] = [
  {
    id: 'track-original',
    type: 'original',
    name: 'Original Audio',
    volume: 100,
    muted: false,
    locked: false,
    solo: false,
    color: '#6366f1', // Indigo
    icon: '🎬',
  },
  {
    id: 'track-voiceover',
    type: 'voiceover',
    name: 'Voiceover',
    volume: 100,
    muted: false,
    locked: false,
    solo: false,
    color: '#f59e0b', // Amber
    icon: '🎤',
  },
  {
    id: 'track-music',
    type: 'background-music',
    name: 'Background Music',
    volume: 70,
    muted: false,
    locked: false,
    solo: false,
    color: '#10b981', // Emerald
    icon: '🎵',
  },
  {
    id: 'track-sfx',
    type: 'sound-effect',
    name: 'Sound Effects',
    volume: 100,
    muted: false,
    locked: false,
    solo: false,
    color: '#ec4899', // Pink
    icon: '🔊',
  },
];

// Zoom presets (pixels per second)
export const ZOOM_PRESETS = [
  { label: '1s', value: 100 },
  { label: '5s', value: 50 },
  { label: '10s', value: 25 },
  { label: '30s', value: 10 },
  { label: '1m', value: 5 },
];

// Keyboard shortcuts
export const TIMELINE_SHORTCUTS = {
  PLAY_PAUSE: ' ',
  FRAME_BACK: 'ArrowLeft',
  FRAME_FORWARD: 'ArrowRight',
  DELETE: 'Delete',
  UNDO: 'z',
  REDO: 'y',
  DUPLICATE: 'd',
  CUT: 'x',
  COPY: 'c',
  PASTE: 'v',
  SELECT_ALL: 'a',
};
