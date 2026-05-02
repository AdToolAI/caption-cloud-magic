import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SceneAnalysis, AudioEnhancements, TextOverlay, TransitionAssignment, ExportSettings } from '@/types/directors-cut';
import { ExportDialog } from './ExportDialog';
import { SubtitleSafeZone, DEFAULT_SUBTITLE_SAFE_ZONE } from '@/lib/directors-cut-draft';
import { CapCutSidebar } from './CapCutSidebar';
import { CapCutTimeline } from './CapCutTimeline';
import { DirectorsCutPreviewPlayer } from '../DirectorsCutPreviewPlayer';
import { CapCutPropertiesPanel } from './CapCutPropertiesPanel';
import { RenderOverlay } from './RenderOverlay';
import { AudioTrack, AudioClip, SubtitleClip, SubtitleTrack, DEFAULT_SUBTITLE_TRACK } from '@/types/timeline';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Undo2, Redo2, Settings, Music, Volume2, ArrowRight, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Mic, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AudioEffects, DEFAULT_AUDIO_EFFECTS } from '@/hooks/useWebAudioEffects';
import { unlockAudio, primeAudioElement } from '@/lib/directors-cut/audioContext';
import { supabase } from '@/integrations/supabase/client';
import { AddMediaDialog } from '../ui/AddMediaDialog';
import { buildSnapTargets, snapToNearest } from '@/lib/directors-cut/snap';
import {
  normalizeCutAnchors,
  buildAnchorCells,
  findBestInsertionCell,
  fitSceneToCell,
  quantizeToFrame,
  findCellAt,
} from '@/lib/directors-cut/timelineAnchors';

import type { KenBurnsKeyframe } from '../features/KenBurnsEffect';

interface CapCutEditorProps {
  videoUrl: string;
  /** Total timeline duration (source + appended scenes). */
  videoDuration: number;
  /** Duration of the source video itself — used to decide pass-through vs blackscreen. */
  originalVideoDuration?: number;
  scenes: SceneAnalysis[];
  audioEnhancements: AudioEnhancements;
  onAudioChange: (enhancements: AudioEnhancements) => void;
  onScenesUpdate?: (scenes: SceneAnalysis[]) => void;
  voiceOverUrl?: string;
  onNextStep?: () => void;
  textOverlays?: TextOverlay[];
  onTextOverlaysChange?: (overlays: TextOverlay[]) => void;
  appliedEffects?: {
    global: {
      brightness: number;
      contrast: number;
      saturation: number;
      sharpness: number;
      temperature: number;
      vignette: number;
    };
    scenes: Record<string, any>;
  };
  transitions?: TransitionAssignment[];
  onTransitionsChange?: (transitions: TransitionAssignment[]) => void;
  colorGrading?: { enabled: boolean; grade: string | null; intensity: number };
  sceneColorGrading?: Record<string, { grade?: string | null; intensity?: number }>;
  styleTransfer?: { enabled: boolean; style: string | null; intensity: number };
  speedKeyframes?: Array<{ time: number; speed: number }>;
  kenBurns?: KenBurnsKeyframe[];
  onAudioTracksChange?: (tracks: AudioTrack[]) => void;
  onSubtitleTrackChange?: (track: SubtitleTrack) => void;
  onBackgroundMusicUrlChange?: (url: string | undefined) => void;
  initialSubtitleTrack?: SubtitleTrack;
  projectId?: string | null;
  onCleanedVideoUrlChange?: (url: string | null) => void;
  onSaveProject?: () => Promise<string | null>;
  subtitleSafeZone?: SubtitleSafeZone;
  onSubtitleSafeZoneChange?: (zone: SubtitleSafeZone) => void;
  // New studio props
  onEffectsChange?: (effects: { brightness: number; contrast: number; saturation: number; sharpness: number; temperature: number; vignette: number }) => void;
  onSceneEffectsChange?: (sceneEffects: Record<string, any>) => void;
  onColorGradingChange?: (enabled: boolean, grade: string | null, intensity?: number) => void;
  onStyleTransferChange?: (enabled: boolean, style: string | null) => void;
  chromaKey?: { enabled: boolean; color: string; tolerance: number; backgroundUrl?: string };
  onChromaKeyChange?: (ck: { enabled: boolean; color: string; tolerance: number; backgroundUrl?: string }) => void;
  upscaling?: { enabled: boolean; targetResolution: string };
  onUpscalingChange?: (enabled: boolean, resolution: string) => void;
  interpolation?: { enabled: boolean; targetFps: number };
  onInterpolationChange?: (enabled: boolean, fps: number) => void;
  restoration?: { enabled: boolean; level: string };
  onRestorationChange?: (enabled: boolean, level: string) => void;
  exportSettings?: ExportSettings;
  onExportSettingsChange?: (settings: ExportSettings) => void;
  isAnalyzing?: boolean;
  onStartAnalysis?: () => void;
  onVoiceOverGenerated?: (url: string) => void;
  onResetProject?: () => void;
  onBackToImport?: () => void;
  /** AI-detected cut markers from the scene-detection pipeline. */
  initialAiCutMarkers?: Array<{ time: number; confidence?: number; source?: 'auto' | 'manual' }>;
}

const DEFAULT_TRACKS: AudioTrack[] = [
  { id: 'track-original', type: 'original', name: 'Original', clips: [], volume: 100, muted: false, locked: false, solo: false, color: '#6366f1', icon: '🎬' },
  { id: 'track-voiceover', type: 'voiceover', name: 'Voiceover', clips: [], volume: 100, muted: false, locked: false, solo: false, color: '#f59e0b', icon: '🎤' },
  { id: 'track-music', type: 'background-music', name: 'Music', clips: [], volume: 70, muted: false, locked: false, solo: false, color: '#10b981', icon: '🎵' },
  { id: 'track-sfx', type: 'sound-effect', name: 'SFX', clips: [], volume: 100, muted: false, locked: false, solo: false, color: '#ec4899', icon: '🔊' },
];

export const CapCutEditor: React.FC<CapCutEditorProps> = ({
  videoUrl,
  videoDuration,
  originalVideoDuration,
  scenes,
  audioEnhancements,
  onAudioChange,
  onScenesUpdate,
  voiceOverUrl,
  onNextStep,
  // Visual effects from previous steps
  textOverlays,
  onTextOverlaysChange,
  appliedEffects,
  transitions,
  onTransitionsChange,
  colorGrading,
  sceneColorGrading,
  styleTransfer,
  speedKeyframes,
  kenBurns,
  // Callbacks to propagate data
  onAudioTracksChange,
  onSubtitleTrackChange,
  onBackgroundMusicUrlChange,
  initialSubtitleTrack,
  projectId,
  onCleanedVideoUrlChange,
  onSaveProject,
  subtitleSafeZone = DEFAULT_SUBTITLE_SAFE_ZONE,
  onSubtitleSafeZoneChange,
  // New studio props
  onEffectsChange,
  onSceneEffectsChange,
  onColorGradingChange,
  onStyleTransferChange,
  chromaKey,
  onChromaKeyChange,
  upscaling,
  onUpscalingChange,
  interpolation,
  onInterpolationChange,
  restoration,
  onRestorationChange,
  exportSettings,
  onExportSettingsChange,
  isAnalyzing,
  onStartAnalysis,
  onVoiceOverGenerated,
  onResetProject,
  onBackToImport,
  initialAiCutMarkers,
}) => {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>(DEFAULT_TRACKS);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(50);
  const [activeDragItem, setActiveDragItem] = useState<{ name: string; type: string; color: string } | null>(null);

  // Magnetic snap state — Artlist/CapCut-style cut markers + master toggle
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [cutMarkers, setCutMarkers] = useState<import('@/types/directors-cut').CutMarker[]>(
    () => (initialAiCutMarkers ?? []).map(m => ({
      time: m.time,
      confidence: m.confidence ?? 1,
      source: (m.source === 'manual' ? 'manual' : 'auto') as 'auto' | 'manual',
    }))
  );

  // Merge in AI markers when they update from parent (e.g. after Auto-Cut).
  // Manual markers are preserved; AI markers are replaced wholesale.
  useEffect(() => {
    if (!initialAiCutMarkers) return;
    setCutMarkers(prev => {
      const manual = prev.filter(m => m.source === 'manual');
      const ai = initialAiCutMarkers.map(m => ({
        time: m.time,
        confidence: m.confidence ?? 1,
        source: 'auto' as const,
      }));
      const merged = [...manual, ...ai].sort((a, b) => a.time - b.time);
      return merged;
    });
  }, [initialAiCutMarkers]);

  const handleAddCutMarker = useCallback(() => {
    setCutMarkers(prev => {
      if (prev.some(m => Math.abs(m.time - currentTime) < 0.05)) return prev;
      const next = [...prev, { time: currentTime, source: 'manual' as const, confidence: 1 }];
      next.sort((a, b) => a.time - b.time);
      return next;
    });
    toast.success(t('dc.cutMarkerAdded'));
  }, [currentTime, t]);
  
  // Collapsible panels
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  
  // Audio Effects State (lifted from sidebar for Web Audio API integration)
  const [audioEffects, setAudioEffects] = useState<AudioEffects>(DEFAULT_AUDIO_EFFECTS);
  
  // Subtitle Track State
  const [subtitleTrack, setSubtitleTrack] = useState<SubtitleTrack>(
    initialSubtitleTrack && initialSubtitleTrack.clips.length > 0 
      ? initialSubtitleTrack 
      : { ...DEFAULT_SUBTITLE_TRACK }
  );
  const [defaultSubtitleStyle, setDefaultSubtitleStyle] = useState<Partial<SubtitleClip>>({
    position: 'bottom',
    fontSize: 'medium',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.7)',
    fontFamily: 'Inter',
    maxLines: 2,
    textStroke: false,
    textStrokeColor: '#000000',
    textStrokeWidth: 2,
  });
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  
  // Preview layer visibility toggles
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [showTextOverlays, setShowTextOverlays] = useState(true);
  const [showExportDialog, setShowExportDialog] = useState(false);
  
  // Burned-in subtitle removal state
  const [cleanedVideoUrl, setCleanedVideoUrl] = useState<string | null>(null);
  const [isRemovingBurnedSubs, setIsRemovingBurnedSubs] = useState(false);
  const [burnedSubsStatus, setBurnedSubsStatus] = useState<string>('idle');
  const burnedSubsPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const isPlayingRef = useRef<boolean>(false);

  // Render overlay state
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatus, setRenderStatus] = useState<'preparing' | 'rendering' | 'finalizing' | 'completed' | 'failed'>('preparing');
  const [currentRenderId, setCurrentRenderId] = useState<string | null>(null);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderStartedAt, setRenderStartedAt] = useState<number>(0);
  const renderPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // DnD sensors with activation constraint to allow clicks
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 8, // 8px movement before drag starts - allows clicks
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200,
      tolerance: 5,
    },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  // Calculate actual total duration as max(videoDuration, max(scene.end_time)).
  // Original video is always the base; scenes can extend the timeline beyond it.
  const actualTotalDuration = useMemo(() => {
    if (scenes.length === 0) return videoDuration;
    return Math.max(videoDuration, ...scenes.map(s => s.end_time));
  }, [scenes, videoDuration]);

  // ── One-shot migration of legacy/mis-flagged scenes ──
  // Scenes inside the original video that were flagged as blackscreen (because
  // an earlier version of the editor didn't know about source-pass-through)
  // are silently switched to "original" mode so the user's footage shows
  // through. Scenes outside the source video keep their blackscreen flag.
  const migrationDoneRef = useRef(false);
  useEffect(() => {
    if (migrationDoneRef.current) return;
    if (!onScenesUpdate || scenes.length === 0) return;
    const sourceDur = originalVideoDuration ?? videoDuration;
    if (!sourceDur || sourceDur <= 0) return;

    let changed = false;
    const migrated = scenes.map(s => {
      if (s.additionalMedia) return s; // media scenes untouched
      if (s.sourceMode === 'media') return s;
      const insideSource = s.start_time < sourceDur - 0.01;
      // Already correctly tagged
      if (insideSource && s.sourceMode === 'original' && !s.isBlackscreen) return s;
      if (!insideSource && s.sourceMode === 'blackscreen') return s;

      changed = true;
      if (insideSource) {
        return {
          ...s,
          sourceMode: 'original' as const,
          isBlackscreen: false,
          original_start_time: s.original_start_time ?? s.start_time,
          original_end_time: s.original_end_time ?? Math.min(s.end_time, sourceDur),
        };
      }
      return { ...s, sourceMode: 'blackscreen' as const, isBlackscreen: true };
    });

    if (changed) {
      migrationDoneRef.current = true;
      onScenesUpdate(migrated);
    } else {
      migrationDoneRef.current = true;
    }
  }, [scenes, onScenesUpdate, originalVideoDuration, videoDuration]);

  // Audio effects change handler
  const handleAudioEffectsChange = useCallback((effects: AudioEffects) => {
    setAudioEffects(effects);
  }, []);

  // Subtitle handlers
  const handleCaptionsGenerated = useCallback((captions: SubtitleClip[]) => {
    setSubtitleTrack(prev => ({
      ...prev,
      clips: captions,
    }));
  }, []);

  const handleSubtitleUpdate = useCallback((clipId: string, updates: Partial<SubtitleClip>) => {
    setSubtitleTrack(prev => ({
      ...prev,
      clips: prev.clips.map(c => 
        c.id === clipId ? { ...c, ...updates } : c
      ),
    }));
  }, []);

  const handleSubtitleDelete = useCallback((clipId: string) => {
    setSubtitleTrack(prev => ({
      ...prev,
      clips: prev.clips.filter(c => c.id !== clipId),
    }));
    setSelectedSubtitleId(null);
  }, []);

  // Get selected subtitle for properties panel
  const selectedSubtitle = useMemo(() => {
    if (!selectedSubtitleId) return undefined;
    return subtitleTrack.clips.find(c => c.id === selectedSubtitleId);
  }, [selectedSubtitleId, subtitleTrack.clips]);

  // Handle subtitle selection - deselect audio clip
  const handleSubtitleSelect = useCallback((clipId: string | null) => {
    setSelectedSubtitleId(clipId);
    if (clipId) setSelectedClipId(null);
  }, []);

  // Handle audio clip selection - deselect subtitle
  const handleClipSelect = useCallback((clipId: string | null) => {
    setSelectedClipId(clipId);
    if (clipId) setSelectedSubtitleId(null);
  }, []);

  // Calculate if video audio should be muted (only when voiceover or music exists AND has clips AND is not muted)
  const shouldMuteVideoAudio = useMemo(() => {
    const voiceoverTrack = audioTracks.find(t => t.id === 'track-voiceover');
    const musicTrack = audioTracks.find(t => t.id === 'track-music');
    
    // Only mute video audio if voiceover or music tracks have clips AND are not muted
    const hasActiveVoiceover = voiceoverTrack?.clips && voiceoverTrack.clips.length > 0 && !voiceoverTrack.muted;
    const hasActiveMusic = musicTrack?.clips && musicTrack.clips.length > 0 && !musicTrack.muted;
    
    return hasActiveVoiceover || hasActiveMusic;
  }, [audioTracks]);

  // Auto-mute original audio when music or voiceover is present
  useEffect(() => {
    const voiceoverTrack = audioTracks.find(t => t.name === 'Voiceover');
    const musicTrack = audioTracks.find(t => t.name === 'Music');
    
    const hasVoiceoverOrMusic = 
      (voiceoverTrack && voiceoverTrack.clips.length > 0) ||
      (musicTrack && musicTrack.clips.length > 0);
    
    if (hasVoiceoverOrMusic) {
      const originalTrack = audioTracks.find(t => t.name === 'Original');
      // Only update if original is not already muted
      if (originalTrack && !originalTrack.muted) {
        setAudioTracks(prev => prev.map(track => 
          track.name === 'Original' ? { ...track, muted: true } : track
        ));
      }
    }
  }, [audioTracks]);

  // Propagate audioTracks changes to parent
  useEffect(() => {
    onAudioTracksChange?.(audioTracks);
  }, [audioTracks, onAudioTracksChange]);

  // Propagate subtitleTrack changes to parent
  useEffect(() => {
    onSubtitleTrackChange?.(subtitleTrack);
  }, [subtitleTrack, onSubtitleTrackChange]);

  // Propagate background music URL to parent - prefer original URL for Lambda rendering
  useEffect(() => {
    const musicTrack = audioTracks.find(t => t.id === 'track-music');
    const musicClip = musicTrack?.clips?.[0];
    // Use originalUrl (Jamendo CDN) for Lambda, fall back to url (Storage) for preview
    onBackgroundMusicUrlChange?.(musicClip?.originalUrl || musicClip?.url);
  }, [audioTracks, onBackgroundMusicUrlChange]);

  // Audio playback for timeline clips
  useEffect(() => {
    audioTracks.forEach(track => {
      // Skip original track - it's handled by video element
      if (track.id === 'track-original') return;
      
      track.clips.forEach(clip => {
        // Create audio element if not exists
        if (!audioElementsRef.current.has(clip.id)) {
          const audio = new Audio();
          audio.preload = 'auto';
          audio.src = clip.url;
          audioElementsRef.current.set(clip.id, audio);
        }
        
        const audio = audioElementsRef.current.get(clip.id)!;
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        const isInRange = currentTime >= clipStart && currentTime < clipEnd;
        
        // Calculate effective volume (track muted, solo, volume levels)
        const hasSoloTracks = audioTracks.some(t => t.solo);
        const shouldPlay = hasSoloTracks ? track.solo : !track.muted;
        const masterVol = (audioEnhancements.master_volume || 100);
        const effectiveVolume = !shouldPlay ? 0 : 
          (masterVol / 100) * (track.volume / 100) * (clip.volume / 100);
        
        audio.volume = Math.min(1, Math.max(0, effectiveVolume));
        
        // Play/Pause based on time position
        if (isInRange && isPlaying && shouldPlay) {
          const audioTime = currentTime - clipStart + clip.trimStart;
          
          // Only update currentTime if significantly different to avoid stuttering
          if (Math.abs(audio.currentTime - audioTime) > 0.3) {
            audio.currentTime = audioTime;
          }
          
          if (audio.paused) {
            audio.play().catch((err) => {
              if (err?.name === 'NotAllowedError') {
                // Autoplay was blocked — surface ONCE so the user knows
                // they need to click play to grant audio permission.
                if (!(window as any).__dcAudioToastShown) {
                  (window as any).__dcAudioToastShown = true;
                  toast.warning('Klicke erneut auf Play, um Audio zu aktivieren.');
                  setTimeout(() => { (window as any).__dcAudioToastShown = false; }, 5000);
                }
              } else {
                console.warn('[CapCutEditor] Audio play error:', err);
              }
            });
          }
        } else {
          if (!audio.paused) {
            audio.pause();
          }
        }
      });
    });
  }, [audioTracks, currentTime, isPlaying, volume]);

  // Cleanup audio elements on unmount
  useEffect(() => {
    return () => {
      audioElementsRef.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioElementsRef.current.clear();
    };
  }, []);

  // Mirror isPlaying into a ref so the click handler can read the latest
  // value without stale-closure issues.
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const handlePlayPause = useCallback(async () => {
    // CRITICAL: unlock the shared AudioContext from inside the click
    // gesture so the timed-playback effect can later call audio.play()
    // without hitting NotAllowedError. Also prime each audio element
    // so the browser whitelists them for autoplay.
    await unlockAudio();

    const willPlay = !isPlayingRef.current;
    if (willPlay) {
      const elements = Array.from(audioElementsRef.current.values());
      // Prime in parallel — non-blocking; failures are silent on purpose.
      await Promise.allSettled(elements.map(primeAudioElement));
    }

    setIsPlaying(prev => !prev);
  }, []);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    // Video sync happens in CapCutPreviewPlayer based on currentTime and scene
  }, []);

  const handleTimeUpdate = useCallback(() => {
    // This is called from CapCutPreviewPlayer with the correct global time
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onPlayPause: handlePlayPause,
    onUndo: () => console.log('Undo'),
    onRedo: () => console.log('Redo'),
  }, true);

  // Initialize audio tracks with original video audio AND voiceover
  useEffect(() => {
    console.log('[CapCutEditor] Initializing audio tracks');
    console.log('[CapCutEditor] videoUrl:', videoUrl);
    console.log('[CapCutEditor] videoDuration:', videoDuration);
    console.log('[CapCutEditor] voiceOverUrl:', voiceOverUrl);

    if (!videoUrl || videoDuration <= 0) {
      console.log('[CapCutEditor] Missing videoUrl or invalid duration, skipping');
      return;
    }

    setAudioTracks(prev => {
      let updatedTracks = [...prev];
      let hasVoiceover = false;

      // 1. Load Original Video Audio into Original track
      updatedTracks = updatedTracks.map(track => {
        if (track.id === 'track-original') {
          const hasOriginal = track.clips.some(c => c.source === 'original');
          if (!hasOriginal) {
            console.log('[CapCutEditor] Adding original audio clip from video');
            const originalClip: AudioClip = {
              id: `original-${Date.now()}`,
              trackId: 'track-original',
              name: 'Original Audio',
              url: videoUrl,
              startTime: 0,
              duration: videoDuration,
              trimStart: 0,
              trimEnd: videoDuration,
              volume: 100,
              fadeIn: 0,
              fadeOut: 0,
              source: 'original',
              color: '#6366f1',
            };
            return { ...track, clips: [...track.clips, originalClip] };
          }
        }
        return track;
      });

      // 2. Load Voiceover (if exists) with temporary duration (will be updated when loaded)
      if (voiceOverUrl && voiceOverUrl.trim() !== '') {
        hasVoiceover = true;
        updatedTracks = updatedTracks.map(track => {
          if (track.id === 'track-voiceover') {
            const hasVoiceoverClip = track.clips.some(c => c.url === voiceOverUrl);
            if (!hasVoiceoverClip) {
              console.log('[CapCutEditor] Adding voiceover clip with temporary duration');
              const voiceoverClip: AudioClip = {
                id: `voiceover-${Date.now() + 1}`,
                trackId: 'track-voiceover',
                name: t('dc.aiVoiceOverClip'),
                url: voiceOverUrl,
                startTime: 0,
                duration: 10, // Temporary duration until actual audio loads
                trimStart: 0,
                trimEnd: 10,
                volume: 100,
                fadeIn: 0.2,
                fadeOut: 0.2,
                source: 'ai-generated',
                color: '#f59e0b',
              };
              return { ...track, clips: [...track.clips, voiceoverClip] };
            }
          }
          return track;
        });
      }

      // 3. Apply Voiceover Priority - reduce original audio when voiceover exists
      if (hasVoiceover) {
        updatedTracks = updatedTracks.map(track => {
          if (track.id === 'track-original') {
            return { ...track, volume: 30 }; // Reduce to 30% when voiceover present
          }
          return track;
        });
        console.log('[CapCutEditor] Voiceover priority applied - Original Audio reduced to 30%');
      }

      console.log('[CapCutEditor] Updated tracks with audio:', updatedTracks);
      return updatedTracks;
    });
  }, [videoUrl, videoDuration, voiceOverUrl]);

  // Load actual voiceover duration when audio file is available (with retry mechanism)
  useEffect(() => {
    if (!voiceOverUrl || voiceOverUrl.trim() === '') return;

    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    let timeoutId: ReturnType<typeof setTimeout>;
    let currentAudio: HTMLAudioElement | null = null;

    const attemptLoad = () => {
      const audio = new Audio();
      currentAudio = audio;
      audio.crossOrigin = 'anonymous';
      audio.preload = 'metadata';

      const handleMetadata = () => {
        const actualDuration = audio.duration;
        console.log('[CapCutEditor] Voiceover actual duration:', actualDuration);

        if (!isFinite(actualDuration) || actualDuration <= 0) return;

        // Update voiceover clip with actual duration
        setAudioTracks(prev => prev.map(track => {
          if (track.id === 'track-voiceover') {
            return {
              ...track,
              clips: track.clips.map(clip =>
                clip.source === 'ai-generated' && clip.url === voiceOverUrl
                  ? { ...clip, duration: actualDuration, trimEnd: actualDuration }
                  : clip
              ),
            };
          }
          return track;
        }));
      };

      const handleError = () => {
        const mediaError = audio.error;
        console.warn('[CapCutEditor] Voiceover load attempt failed:', {
          attempt: retryCount + 1,
          url: voiceOverUrl,
          errorCode: mediaError?.code,
          errorMessage: mediaError?.message,
          networkState: audio.networkState,
          readyState: audio.readyState,
        });

        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`[CapCutEditor] Retrying voiceover load in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`);
          timeoutId = setTimeout(attemptLoad, retryDelay);
        } else {
          console.error('[CapCutEditor] Failed to load voiceover after', maxRetries + 1, 'attempts');
        }
      };

      audio.addEventListener('loadedmetadata', handleMetadata);
      audio.addEventListener('error', handleError);
      audio.src = voiceOverUrl;
    };

    attemptLoad();

    return () => {
      clearTimeout(timeoutId);
      if (currentAudio) {
        currentAudio.src = '';
      }
    };
  }, [voiceOverUrl]);

  // Subtitle detection state — only triggered manually by the user
  const [isDetectingOriginalSubs, setIsDetectingOriginalSubs] = useState(false);
  const originalSubsDetectedRef = useRef(false);
  const userClearedSubtitlesRef = useRef(false);

  // Handler to remove all original subtitles
  const handleRemoveOriginalSubtitles = useCallback(() => {
    userClearedSubtitlesRef.current = true;
    setSubtitleTrack(prev => ({
      ...prev,
      clips: prev.clips.filter(c => c.source !== 'original'),
    }));
    toast.success(t('dc.originalSubsRemoved'));
  }, []);

  // Handler to remove ALL subtitles (original + generated + manual)
  const handleRemoveAllSubtitles = useCallback(() => {
    userClearedSubtitlesRef.current = true;
    setSubtitleTrack(prev => ({ ...prev, clips: [] }));
    setSelectedSubtitleId(null);
    toast.success(t('dc.allSubsRemoved'));
  }, []);

  // Handler to retry original subtitle detection
  const handleRetryDetection = useCallback(() => {
    userClearedSubtitlesRef.current = false;
    originalSubsDetectedRef.current = false;
    setIsDetectingOriginalSubs(true);
    // Manually trigger detection
    const detect = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('generate-subtitles', {
          body: { audioUrl: videoUrl, language: 'de' },
        });
        if (error) throw error;
        if (userClearedSubtitlesRef.current) return;
        const originalSubs: SubtitleClip[] = (data?.subtitles || []).map((seg: any, i: number) => ({
          id: `original-sub-${Date.now()}-${i}`,
          startTime: seg.startTime || i * 3,
          endTime: seg.endTime || (i + 1) * 3,
          text: seg.text || '',
          style: 'standard' as const,
          source: 'original' as const,
          position: 'bottom' as const,
          fontSize: 'medium' as const,
          color: '#FFFFFF',
          backgroundColor: 'rgba(0,0,0,0.7)',
          fontFamily: 'Inter',
          maxLines: 2 as const,
          textStroke: false,
          textStrokeColor: '#000000',
          textStrokeWidth: 2,
        }));
        if (originalSubs.length > 0) {
          originalSubsDetectedRef.current = true;
          setSubtitleTrack(prev => ({ ...prev, clips: originalSubs }));
          toast.success(t('dc.originalSubsDetected', { count: originalSubs.length }));
        }
      } catch (err) {
        console.error('[CapCutEditor] Retry detection failed:', err);
        toast.error(t('dc.detectionFailed'));
      } finally {
        setIsDetectingOriginalSubs(false);
      }
    };
    detect();
  }, [videoUrl]);

  // Poll project for burned subtitle status
  const startBurnedSubsPolling = useCallback((pid: string) => {
    if (burnedSubsPollingRef.current) clearInterval(burnedSubsPollingRef.current);
    
    burnedSubsPollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('director_cut_projects')
          .select('burned_subtitles_status, cleaned_video_url, burned_subtitles_error')
          .eq('id', pid)
          .single();
        
        if (error || !data) return;
        
        setBurnedSubsStatus(data.burned_subtitles_status);
        
        if (data.burned_subtitles_status === 'completed' && data.cleaned_video_url) {
          setCleanedVideoUrl(data.cleaned_video_url);
          onCleanedVideoUrlChange?.(data.cleaned_video_url);
          setIsRemovingBurnedSubs(false);
          toast.success(t('dc.burnedSubsRemoved'));
          if (burnedSubsPollingRef.current) clearInterval(burnedSubsPollingRef.current);
        } else if (data.burned_subtitles_status === 'failed') {
          setIsRemovingBurnedSubs(false);
          toast.error(data.burned_subtitles_error || t('dc.burnedSubsRemovalFailed'));
          if (burnedSubsPollingRef.current) clearInterval(burnedSubsPollingRef.current);
        }
      } catch (e) {
        console.error('[CapCutEditor] Polling error:', e);
      }
    }, 5000); // Poll every 5s
  }, [onCleanedVideoUrlChange]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (burnedSubsPollingRef.current) clearInterval(burnedSubsPollingRef.current);
    };
  }, []);

  // Check initial burned subtitle status from project
  useEffect(() => {
    if (!projectId) return;
    const checkStatus = async () => {
      const { data } = await supabase
        .from('director_cut_projects')
        .select('burned_subtitles_status, cleaned_video_url, burned_subtitles_error')
        .eq('id', projectId)
        .single();
      if (!data) return;
      setBurnedSubsStatus(data.burned_subtitles_status);
      if (data.cleaned_video_url) {
        setCleanedVideoUrl(data.cleaned_video_url);
      }
      if (data.burned_subtitles_status === 'processing') {
        setIsRemovingBurnedSubs(true);
        startBurnedSubsPolling(projectId);
      }
    };
    checkStatus();
  }, [projectId, startBurnedSubsPolling]);

  // Handler to remove burned-in subtitles via AI inpainting (async)
  const handleRemoveBurnedSubtitles = useCallback(async (settings?: { conf_threshold?: number; margin?: number; method?: string }) => {
    let activeProjectId = projectId;
    if (!activeProjectId && onSaveProject) {
      toast.info(t('dc.projectSaving'));
      activeProjectId = await onSaveProject();
    }
    if (!activeProjectId) {
      toast.error(t('dc.projectSaveFailed'));
      return;
    }
    setIsRemovingBurnedSubs(true);
    setBurnedSubsStatus('processing');
    try {
      toast.info(t('dc.burnedSubsRemoving'));
      const { data, error } = await supabase.functions.invoke('director-cut-remove-burned-subtitles', {
        body: { video_url: videoUrl, project_id: activeProjectId, ...settings },
      });
      
      if (error) {
        // Try to extract structured error
        let errorMsg = t('dc.burnedSubsRemovalFailed');
        try {
          const errBody = await (error as any)?.context?.json?.();
          if (errBody?.error) errorMsg = errBody.error;
        } catch {}
        throw new Error(errorMsg);
      }
      
      if (!data?.ok) {
        throw new Error(data?.error || t('dc.unknownError'));
      }
      
      // Start polling for completion
      startBurnedSubsPolling(activeProjectId);
    } catch (err) {
      console.error('[CapCutEditor] Burned subtitle removal failed:', err);
      setIsRemovingBurnedSubs(false);
      setBurnedSubsStatus('failed');
      toast.error(err instanceof Error ? err.message : t('dc.burnedSubsRemovalFailed'));
    }
  }, [videoUrl, projectId, onSaveProject, startBurnedSubsPolling]);

  // Capture a single frame from the video as a JPEG data URL
  const captureVideoFrame = useCallback(async (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'auto';
      video.src = url;

      const onError = () => reject(new Error('Video load failed'));
      video.addEventListener('error', onError, { once: true });

      video.addEventListener('loadedmetadata', () => {
        // Seek to 25% of duration to get a representative frame with subtitles
        video.currentTime = video.duration * 0.25;
      }, { once: true });

      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas context failed')); return; }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          video.src = '';
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
      }, { once: true });
    });
  }, []);

  // Auto-detect subtitle band via AI vision
  const [isDetectingBand, setIsDetectingBand] = useState(false);
  const handleDetectSubtitleBand = useCallback(async () => {
    setIsDetectingBand(true);
    try {
      // Capture a frame from the video as JPEG data URL
      let frameUrl = videoUrl;
      try {
        frameUrl = await captureVideoFrame(videoUrl);
      } catch (e) {
        console.warn('[CapCutEditor] Frame capture failed, will use fallback:', e);
      }

      const { data, error } = await supabase.functions.invoke('director-cut-detect-subtitle-band', {
        body: { video_url: frameUrl },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Detection failed');

      const sz = data.safeZone;
      onSubtitleSafeZoneChange?.({
        enabled: true,
        mode: 'reframe',
        preset: 'custom',
        zoom: sz.zoom,
        offsetY: sz.offsetY,
        bottomBandPercent: sz.bottomBandPercent,
      });
      toast.success(t('dc.subtitleBandDetected', { percent: sz.bottomBandPercent }));
    } catch (err) {
      console.error('[CapCutEditor] Band detection failed:', err);
      // Fallback: apply medium preset
      onSubtitleSafeZoneChange?.({
        enabled: true,
        mode: 'reframe',
        preset: 'medium',
        zoom: 1.12,
        offsetY: -6,
        bottomBandPercent: 12,
      });
      toast.info(t('dc.autoDetectionFailed'));
    } finally {
      setIsDetectingBand(false);
    }
  }, [videoUrl, captureVideoFrame, onSubtitleSafeZoneChange]);

  // Handler to restore original video (toggle, don't forget cleaned result)
  const handleRestoreOriginalVideo = useCallback(() => {
    setCleanedVideoUrl(null);
    onCleanedVideoUrlChange?.(null);
    toast.success(t('dc.originalVideoRestored'));
  }, [onCleanedVideoUrlChange]);

  // Delete clip handler
  const handleDeleteClip = useCallback((clipId: string) => {
    setAudioTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.filter(c => c.id !== clipId)
    })));
    setSelectedClipId(null);
  }, []);

  // Resize clip handler (for trimming from both sides)
  const handleClipResize = useCallback((clipId: string, side: 'left' | 'right', newStartTime: number, newDuration: number) => {
    setAudioTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.map(clip => {
        if (clip.id !== clipId) return clip;
        
        if (side === 'left') {
          // Left side: adjust startTime and trimStart
          const deltaTime = newStartTime - clip.startTime;
          return {
            ...clip,
            startTime: newStartTime,
            trimStart: Math.max(0, clip.trimStart + deltaTime),
            duration: newDuration,
          };
        } else {
          // Right side: adjust duration and trimEnd
          return {
            ...clip,
            duration: newDuration,
            trimEnd: clip.trimStart + newDuration,
          };
        }
      }),
    })));
  }, []);

  // Delete scene handler
  const handleSceneDelete = useCallback((sceneId: string) => {
    if (!onScenesUpdate) return;
    const updatedScenes = scenes.filter(s => s.id !== sceneId);
    // Recalculate times
    let currentTime = 0;
    const recalculatedScenes = updatedScenes.map(scene => {
      const duration = scene.end_time - scene.start_time;
      const newScene = { ...scene, start_time: currentTime, end_time: currentTime + duration };
      currentTime += duration;
      return newScene;
    });
    onScenesUpdate(recalculatedScenes);
  }, [scenes, onScenesUpdate]);

  // Trim scene handler — adjust start/end without recalculating other scenes
  const handleTrimScene = useCallback((sceneId: string, newStart: number, newEnd: number) => {
    if (!onScenesUpdate) return;
    const updatedScenes = scenes.map(s =>
      s.id === sceneId ? { ...s, start_time: newStart, end_time: newEnd } : s
    );
    onScenesUpdate(updatedScenes);
  }, [scenes, onScenesUpdate]);

  // Rename scene handler
  const handleSceneRename = useCallback((sceneId: string, newName: string) => {
    if (!onScenesUpdate) return;
    const updatedScenes = scenes.map(s =>
      s.id === sceneId ? { ...s, description: newName } : s
    );
    onScenesUpdate(updatedScenes);
  }, [scenes, onScenesUpdate]);

  // Scene playback rate change handler
  const handleScenePlaybackRateChange = useCallback((sceneId: string, rate: number) => {
    if (!onScenesUpdate) return;
    const updatedScenes = scenes.map(s => {
      if (s.id !== sceneId) return s;
      const origStart = s.original_start_time ?? s.start_time;
      const origEnd = s.original_end_time ?? s.end_time;
      const origDuration = origEnd - origStart;
      const newDuration = origDuration / rate;
      return {
        ...s,
        original_start_time: origStart,
        original_end_time: origEnd,
        end_time: s.start_time + newDuration,
        playbackRate: rate,
      };
    });
    // Recalculate subsequent scene timings
    const sorted = [...updatedScenes].sort((a, b) => a.start_time - b.start_time);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const dur = sorted[i].end_time - sorted[i].start_time;
      const origStart = sorted[i].original_start_time ?? sorted[i].start_time;
      const origEnd = sorted[i].original_end_time ?? sorted[i].end_time;
      sorted[i] = {
        ...sorted[i],
        start_time: prev.end_time,
        end_time: prev.end_time + dur,
        original_start_time: origStart,
        original_end_time: origEnd,
      };
    }
    onScenesUpdate(sorted);
  }, [scenes, onScenesUpdate]);

  // Effective source video duration — falls back to timeline duration when
  // the source duration is unknown (legacy callers). Used to decide whether
  // a scene sits "inside the original video" (→ original pass-through) or
  // "after the original video" (→ true blackscreen placeholder).
  const effectiveSourceDuration = originalVideoDuration ?? videoDuration;

  // Format helper for snap toast
  const formatSnapTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Add scene handler — auto-snaps to nearest cut marker so the user
  // does not need to manually align scene boundaries.
  const handleSceneAdd = useCallback(() => {
    if (!onScenesUpdate) return;
    const lastScene = scenes[scenes.length - 1];
    let newStartTime = lastScene ? lastScene.end_time : 0;

    // Auto-snap start to nearest cut marker / scene edge (within 0.5s)
    const startTargets = buildSnapTargets({
      scenes,
      cutMarkers: cutMarkers.map(m => m.time),
      duration: videoDuration,
    });
    const startSnap = snapToNearest(newStartTime, startTargets, 0.5);
    let snapped = false;
    if (startSnap.hit && startSnap.hit.kind === 'cut-marker') {
      newStartTime = startSnap.value;
      snapped = true;
    }

    const insideOriginal = newStartTime < effectiveSourceDuration - 0.01;
    const sourceMode: 'original' | 'blackscreen' = insideOriginal ? 'original' : 'blackscreen';

    // End-time: prefer the next cut marker after start within 15s window,
    // otherwise default to start + 5s (clamped to source duration when inside).
    let sceneEnd = insideOriginal
      ? Math.min(newStartTime + 5, effectiveSourceDuration)
      : newStartTime + 5;
    // Candidate "next cut" times: explicit cut markers + start times of
    // subsequent scenes (AI-detected boundaries that already became scenes).
    const candidateMarkers = [
      ...cutMarkers.map(m => m.time),
      ...scenes.map(s => s.start_time).filter(t => t > newStartTime + 0.2),
    ];
    const nextMarker = candidateMarkers
      .filter(t => t > newStartTime + 0.2 && t <= newStartTime + 15)
      .sort((a, b) => a - b)[0];
    if (nextMarker) {
      sceneEnd = insideOriginal ? Math.min(nextMarker, effectiveSourceDuration) : nextMarker;
      snapped = true;
    }

    const newScene: SceneAnalysis = {
      id: `scene-${Date.now()}`,
      start_time: newStartTime,
      end_time: sceneEnd,
      description: insideOriginal ? t('dc.newSceneOriginal') : t('dc.newSceneBlackscreen'),
      content_description: t('dc.emptySceneDesc'),
      suggested_effects: [],
      isBlackscreen: !insideOriginal,
      sourceMode,
      original_start_time: insideOriginal ? newStartTime : undefined,
      original_end_time: insideOriginal ? sceneEnd : undefined,
    };
    onScenesUpdate([...scenes, newScene]);
    if (snapped) {
      toast.success(t('dc.snappedToCut', { time: formatSnapTime(newStartTime) }));
    }
  }, [scenes, onScenesUpdate, effectiveSourceDuration, videoDuration, cutMarkers, t]);

  // Add video as new scene handler — also auto-snaps the start to nearest cut.
  const handleAddVideoAsScene = useCallback((videoUrl: string, duration: number, name: string) => {
    if (!onScenesUpdate) return;
    const lastScene = scenes[scenes.length - 1];
    let newStartTime = Math.max(lastScene?.end_time ?? 0, effectiveSourceDuration);

    const startTargets = buildSnapTargets({
      scenes,
      cutMarkers: cutMarkers.map(m => m.time),
      duration: videoDuration,
    });
    const startSnap = snapToNearest(newStartTime, startTargets, 0.5);
    let snapped = false;
    if (startSnap.hit && startSnap.hit.kind === 'cut-marker') {
      newStartTime = startSnap.value;
      snapped = true;
    }

    const newScene: SceneAnalysis = {
      id: `scene-${Date.now()}`,
      start_time: newStartTime,
      end_time: newStartTime + duration,
      description: name || t('dc.uploadedVideo'),
      content_description: t('dc.videoFromUpload'),
      suggested_effects: [],
      isBlackscreen: false,
      isFromOriginalVideo: false,
      sourceMode: 'media',
      additionalMedia: {
        type: 'video',
        url: videoUrl,
        duration: duration,
      },
    };
    onScenesUpdate([...scenes, newScene]);
    if (snapped) {
      toast.success(t('dc.snappedToCut', { time: formatSnapTime(newStartTime) }));
    }
  }, [scenes, onScenesUpdate, effectiveSourceDuration, videoDuration, cutMarkers, t]);

  // Add Media Dialog (videos / images / upload from library)
  const [showAddMediaDialog, setShowAddMediaDialog] = useState(false);


  const handleSplitAtPlayhead = useCallback(() => {
    if (!onScenesUpdate || scenes.length === 0) return;
    const targetScene = scenes.find(s => currentTime >= s.start_time && currentTime < s.end_time);
    if (!targetScene) {
      toast.error(t('dc.playheadNotInScene'));
      return;
    }
    if (currentTime - targetScene.start_time < 0.5 || targetScene.end_time - currentTime < 0.5) {
      toast.error(t('dc.tooCloseToEdge'));
      return;
    }
    const newScenes = scenes.flatMap(s => {
      if (s.id !== targetScene.id) return [s];
      return [
        { ...s, id: s.id, end_time: currentTime },
        { ...s, id: `scene-${Date.now()}`, start_time: currentTime, description: `${s.description} ${t('dc.partSuffix')}` },
      ];
    });
    onScenesUpdate(newScenes);
    toast.success(t('dc.sceneSplitAtPlayhead'));
  }, [scenes, currentTime, onScenesUpdate]);

  // Duplicate scene
  const handleDuplicateScene = useCallback((sceneId: string) => {
    if (!onScenesUpdate) return;
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const idx = scenes.indexOf(scene);
    const newScenes = [...scenes];
    const duplicate: SceneAnalysis = {
      ...scene,
      id: `scene-${Date.now()}`,
      description: `${scene.description} ${t('dc.copySuffix')}`,
    };
    newScenes.splice(idx + 1, 0, duplicate);
    let cursor = 0;
    const recalculated = newScenes.map(s => {
      const d = s.end_time - s.start_time;
      const updated = { ...s, start_time: cursor, end_time: cursor + d };
      cursor += d;
      return updated;
    });
    onScenesUpdate(recalculated);
    toast.success(t('dc.sceneDuplicated'));
  }, [scenes, onScenesUpdate]);

  // Cleanup render polling + interpolation on unmount
  useEffect(() => {
    return () => {
      if (renderPollingRef.current) clearInterval(renderPollingRef.current);
    };
  }, []);

  // Smooth progress interpolation between polls
  const serverProgressRef = useRef(0);
  const estimatedTimeRef = useRef(120); // default 120s
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startProgressInterpolation = useCallback(() => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      setRenderProgress(prev => {
        const server = serverProgressRef.current;
        // Gently move toward server value, or nudge forward if server hasn't updated
        const target = Math.max(server, prev);
        const increment = 100 / (estimatedTimeRef.current || 120) / 5; // tick every 200ms
        const next = Math.min(target + increment, 95); // never exceed 95 before done
        return Math.max(prev, next); // never go backward
      });
    }, 200);
  }, []);

  const stopProgressInterpolation = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // Render polling logic
  const startRenderPolling = useCallback((remotionRenderId: string) => {
    if (renderPollingRef.current) clearInterval(renderPollingRef.current);

    const poll = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-remotion-progress', {
          body: { renderId: remotionRenderId, source: 'directors-cut' },
        });
        if (error || !data) return;

        const progress = data.progress;
        if (progress?.done) {
          stopProgressInterpolation();
          setRenderProgress(100);
          setRenderStatus('completed');
          setRenderedVideoUrl(progress.outputFile || progress.url || null);
          if (renderPollingRef.current) clearInterval(renderPollingRef.current);
        } else if (progress?.fatalErrorEncountered) {
          stopProgressInterpolation();
          setRenderStatus('failed');
          setRenderError(progress.errors?.[0]?.message || t('dc.renderingFailed'));
          if (renderPollingRef.current) clearInterval(renderPollingRef.current);
        } else {
          const pct = Math.round((progress?.overallProgress || 0) * 100);
          serverProgressRef.current = pct;
          // Update status based on progress
          if (pct >= 85) {
            setRenderStatus('finalizing');
          } else {
            setRenderStatus('rendering');
          }
        }
      } catch {
        // Silently retry on next interval
      }
    };

    // Start interpolation immediately
    startProgressInterpolation();
    // Initial check after 3s, then every 8s
    setTimeout(poll, 3000);
    renderPollingRef.current = setInterval(poll, 8000);
  }, [startProgressInterpolation, stopProgressInterpolation]);

  // Export video - trigger render via Edge Function
  const handleExportVideo = useCallback(async () => {
    try {
      // Show overlay immediately
      setIsRendering(true);
      setRenderProgress(0);
      setRenderStatus('preparing');
      setRenderedVideoUrl(null);
      setRenderError(null);
      setRenderStartedAt(Date.now());
      
      let savedProjectId = projectId;
      if (onSaveProject) {
        savedProjectId = await onSaveProject();
      }
      
      if (!savedProjectId) {
        setRenderStatus('failed');
        setRenderError(t('dc.projectCouldNotSave'));
        return;
      }

      setRenderProgress(5);

      const { data, error } = await supabase.functions.invoke('render-directors-cut', {
        body: {
          project_id: savedProjectId,
          source_video_url: cleanedVideoUrl || videoUrl,
          scenes: scenes.map(s => ({
            id: s.id,
            start_time: s.start_time,
            end_time: s.end_time,
            description: s.description,
          })),
          effects: appliedEffects?.global || { brightness: 100, contrast: 100, saturation: 100, sharpness: 0, temperature: 0, vignette: 0 },
          color_grading: colorGrading,
          style_transfer: styleTransfer,
          transitions: transitions || [],
          export_settings: exportSettings || { quality: 'hd', format: 'mp4', fps: 30, aspect_ratio: '16:9' },
          voiceover_url: voiceOverUrl,
          background_music_url: audioTracks.find(t => t.id === 'track-music')?.clips?.[0]?.originalUrl || audioTracks.find(t => t.id === 'track-music')?.clips?.[0]?.url,
          subtitle_track: showSubtitles && subtitleTrack.clips.length > 0 ? {
            id: subtitleTrack.id,
            name: subtitleTrack.name,
            clips: subtitleTrack.clips
              .filter(c => c.text?.trim())
              .map(c => ({
                id: c.id,
                startTime: c.startTime,
                endTime: c.endTime,
                text: c.text,
                position: c.position,
                fontSize: c.fontSize,
                color: c.color,
                backgroundColor: c.backgroundColor,
                fontFamily: c.fontFamily,
              })),
            visible: subtitleTrack.visible,
          } : undefined,
          duration_seconds: videoDuration || scenes.reduce((sum, s) => sum + (s.end_time - s.start_time), 0),
        },
      });

      if (error) {
        console.error('[Export] Error:', error);
        setRenderStatus('failed');
        setRenderError(error.message);
        return;
      }

      const remotionRenderId = data?.remotion_render_id || data?.renderId;
      const dbRenderId = data?.render_id || data?.id;
      if (remotionRenderId) {
        setCurrentRenderId(dbRenderId || remotionRenderId);
        serverProgressRef.current = 5;
        estimatedTimeRef.current = data?.estimated_time_seconds || 120;
        setRenderStatus('rendering');
        startRenderPolling(remotionRenderId);
      } else if (data?.video_url || data?.downloadUrl) {
        // Render completed synchronously
        setRenderProgress(100);
        setRenderStatus('completed');
        setRenderedVideoUrl(data.video_url || data.downloadUrl);
      } else {
        setRenderStatus('failed');
        setRenderError(t('dc.noRenderIdReceived'));
      }

      console.log('[Export] Render initiated:', data);
    } catch (err) {
      console.error('[Export] Error:', err);
      setRenderStatus('failed');
      setRenderError(t('dc.exportCouldNotStart'));
    }
  }, [projectId, onSaveProject, scenes, appliedEffects, colorGrading, styleTransfer, transitions, exportSettings, cleanedVideoUrl, videoUrl, voiceOverUrl, audioTracks, showSubtitles, subtitleTrack, startRenderPolling, videoDuration]);

  const handleRenderDownload = useCallback(() => {
    if (renderedVideoUrl) {
      window.open(renderedVideoUrl, '_blank');
    }
  }, [renderedVideoUrl]);

  const navigate = useNavigate();

  const handleRenderClose = useCallback(() => {
    setIsRendering(false);
    stopProgressInterpolation();
    if (renderPollingRef.current) clearInterval(renderPollingRef.current);
  }, [stopProgressInterpolation]);

  const handleOpenLibrary = useCallback(() => {
    setIsRendering(false);
    stopProgressInterpolation();
    if (renderPollingRef.current) clearInterval(renderPollingRef.current);
    navigate('/media-library?tab=rendered');
  }, [navigate, stopProgressInterpolation]);

  const handleAddClip = useCallback((trackId: string, clip: Omit<AudioClip, 'id'>) => {
    const newClip: AudioClip = {
      ...clip,
      id: `clip-${Date.now()}`,
    };
    setAudioTracks(prev => prev.map(track => 
      track.id === trackId 
        ? { ...track, clips: [...track.clips, newClip] }
        : track
    ));
  }, []);

  const handleTrackMute = useCallback((trackId: string) => {
    setAudioTracks(prev => prev.map(track =>
      track.id === trackId ? { ...track, muted: !track.muted } : track
    ));
  }, []);

  const handleTrackSolo = useCallback((trackId: string) => {
    setAudioTracks(prev => prev.map(track =>
      track.id === trackId ? { ...track, solo: !track.solo } : track
    ));
  }, []);

  // File type validation helpers
  const isAudioFile = (url: string): boolean => {
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm'];
    return audioExtensions.some(ext => url.toLowerCase().includes(ext));
  };

  const isVideoFile = (url: string): boolean => {
    const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.wmv'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext));
  };

  // Drag & Drop Handlers for shared DndContext
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'scene') {
      setActiveDragItem({
        name: t('dc.sceneLabel', { index: data.index + 1 }),
        type: 'scene',
        color: ((data.scene?.sourceMode ?? (data.scene?.isBlackscreen ? 'blackscreen' : undefined)) === 'blackscreen') ? '#3f3f46' : '#6366f1',
      });
    } else if (data?.source === 'sidebar') {
      setActiveDragItem({
        name: data.clip?.name || 'Unknown',
        type: data.type || 'audio',
        color: data.clip?.color || '#6366f1',
      });
    } else if (data?.clip) {
      setActiveDragItem({
        name: data.clip.name,
        type: 'clip',
        color: data.clip.color || '#6366f1',
      });
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);

    if (!over) return;

    const activeData = active.data.current as any;
    const targetTrackId = over.id as string;

    // Handle scene reordering
    if (activeData?.type === 'scene' && onScenesUpdate) {
      const draggedIndex = activeData.index;
      const deltaX = event.delta.x;
      const timeDelta = deltaX / zoom;
      
      // Calculate new position based on drag distance
      const newStartTime = Math.max(0, activeData.scene.start_time + timeDelta);
      
      // Create a new scenes array and remove the dragged scene
      const newScenes = [...scenes];
      const [movedScene] = newScenes.splice(draggedIndex, 1);
      
      // Find new index based on the new start time
      let newIndex = newScenes.findIndex(s => s.start_time > newStartTime);
      if (newIndex === -1) newIndex = newScenes.length;
      
      // Insert at new position
      newScenes.splice(newIndex, 0, movedScene);
      
      // Recalculate all scene times sequentially
      let currentSceneTime = 0;
      const reorderedScenes = newScenes.map(scene => {
        const duration = scene.end_time - scene.start_time;
        const updatedScene = {
          ...scene,
          start_time: currentSceneTime,
          end_time: currentSceneTime + duration,
        };
        currentSceneTime += duration;
        return updatedScene;
      });
      
      onScenesUpdate(reorderedScenes);
      toast.success(t('dc.sceneOrderUpdated'));
      return;
    }

    // Audio tracks that should only accept audio files
    const audioOnlyTracks = ['track-voiceover', 'track-music', 'track-sfx'];
    const isAudioOnlyTrack = audioOnlyTracks.includes(targetTrackId);

    // Handle sidebar drops
    if (activeData?.source === 'sidebar' && activeData?.clip) {
      const clip = activeData.clip;
      const fileUrl = clip.url || '';

      // Block video files from being dropped into audio-only tracks
      if (isAudioOnlyTrack && isVideoFile(fileUrl) && !isAudioFile(fileUrl)) {
        toast.error(t('dc.videoFilesNotInAudioTracks'));
        return;
      }

      handleAddClip(targetTrackId, {
        trackId: targetTrackId,
        name: clip.name,
        url: fileUrl,
        startTime: 0,
        duration: clip.duration,
        trimStart: 0,
        trimEnd: clip.duration,
        volume: clip.volume || 100,
        fadeIn: clip.fadeIn || 0,
        fadeOut: clip.fadeOut || 0,
        source: clip.source || 'library',
        color: clip.color,
      });
      return;
    }

    // Handle internal timeline drag
    if (activeData?.clip) {
      const clipId = active.id as string;
      const dragData = activeData as { clip: AudioClip };
      const sourceTrack = audioTracks.find(t => t.clips.some(c => c.id === clipId));
      if (!sourceTrack) return;

      const fileUrl = dragData.clip.url || '';

      // Block video files from being moved to audio-only tracks
      if (isAudioOnlyTrack && isVideoFile(fileUrl) && !isAudioFile(fileUrl)) {
        toast.error(t('dc.videoFilesNotMovable'));
        return;
      }

      const newStartTime = Math.max(0, dragData.clip.startTime + (event.delta.x / zoom));

      if (sourceTrack.id === targetTrackId) {
        // Same track - just update position
        setAudioTracks(prev => prev.map(track => {
          if (track.id === sourceTrack.id) {
            return {
              ...track,
              clips: track.clips.map(c =>
                c.id === clipId ? { ...c, startTime: newStartTime } : c
              ),
            };
          }
          return track;
        }));
      } else {
        // Move to different track
        setAudioTracks(prev => prev.map(track => {
          if (track.id === sourceTrack.id) {
            return { ...track, clips: track.clips.filter(c => c.id !== clipId) };
          }
          if (track.id === targetTrackId) {
            const updatedClip = { ...dragData.clip, startTime: newStartTime, trackId: targetTrackId };
            return { ...track, clips: [...track.clips, updatedClip] };
          }
          return track;
        }));
      }
    }
  }, [audioTracks, scenes, zoom, handleAddClip, onScenesUpdate]);

  const selectedClip = audioTracks
    .flatMap(t => t.clips)
    .find(c => c.id === selectedClipId);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#050816]">
      {/* Header Bar — James Bond 2028 Glassmorphism */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#F5C76A]/10 bg-[#0a0a1a]/80 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          {onBackToImport && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-2 text-white/60 hover:text-white hover:bg-white/10 text-xs gap-1"
              onClick={onBackToImport}
              title={t('dc.backToImport')}
            >
              <ArrowRight className="h-3.5 w-3.5 rotate-180" />
              Zurück
            </Button>
          )}
          <div className="w-px h-5 bg-[#F5C76A]/15" />
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? t('dc.openSidebar') : t('dc.closeSidebar')}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F5C76A] to-[#FFE4A0] font-semibold text-sm drop-shadow-[0_0_8px_rgba(245,199,106,0.2)]">Director's Cut Studio</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-white/10">
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-white/10">
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <div className="w-px h-5 bg-[#F5C76A]/15 mx-1" />
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => setPropertiesCollapsed(!propertiesCollapsed)}
            title={propertiesCollapsed ? t('dc.openProperties') : t('dc.closeProperties')}
          >
            {propertiesCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          </Button>
          <div className="w-px h-5 bg-[#F5C76A]/15 mx-1" />
          <Button 
            onClick={() => setShowExportDialog(true)}
            size="sm"
            className="gap-1.5 h-7 bg-gradient-to-r from-[#F5C76A] to-[#d4a843] hover:from-[#FFE4A0] hover:to-[#F5C76A] text-xs text-black font-semibold shadow-[0_0_15px_rgba(245,199,106,0.25)]"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Main Content with shared DndContext */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Collapsible */}
           <div className={cn(
            "flex flex-col border-r border-[#F5C76A]/10 bg-[#0a0a1a]/90 backdrop-blur-lg transition-all duration-200 flex-shrink-0",
            sidebarCollapsed ? "w-12" : "w-96"
          )}>
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Voiceover"
                >
                  <Mic className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => setSidebarCollapsed(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Musik"
                >
                  <Music className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => setSidebarCollapsed(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Sound Effects"
                >
                  <Volume2 className="h-5 w-5" />
                </button>
              </div>
            ) : (
            <CapCutSidebar 
              onAddFromLibrary={() => setShowAddMediaDialog(true)}
              videoUrl={videoUrl}
              videoDuration={actualTotalDuration}
              voiceOverUrl={voiceOverUrl}
              onCaptionsGenerated={handleCaptionsGenerated}
              defaultSubtitleStyle={defaultSubtitleStyle}
              onDefaultStyleChange={setDefaultSubtitleStyle}
              existingCaptions={subtitleTrack.clips}
              onApplyStyleToAll={(style) => {
                setSubtitleTrack(prev => ({
                  ...prev,
                  clips: prev.clips.map(clip => ({ ...clip, ...style })),
                }));
              }}
              audioEffects={audioEffects}
              onAudioEffectsChange={handleAudioEffectsChange}
              selectedSubtitleId={selectedSubtitleId}
              onSubtitleTextUpdate={(clipId, text) => {
                setSubtitleTrack(prev => ({
                  ...prev,
                  clips: prev.clips.map(c => 
                    c.id === clipId ? { ...c, text } : c
                  ),
                }));
              }}
              onSubtitleSelect={handleSubtitleSelect}
              isDetectingOriginalSubs={isDetectingOriginalSubs}
              hasOriginalSubtitles={subtitleTrack.clips.some(c => c.source === 'original')}
              onRemoveOriginalSubtitles={handleRemoveOriginalSubtitles}
              onRemoveAllSubtitles={handleRemoveAllSubtitles}
              onRetryDetection={handleRetryDetection}
              textOverlayCount={(textOverlays || []).length}
              textOverlays={textOverlays || []}
              onTextOverlaysChange={onTextOverlaysChange}
              showSubtitles={showSubtitles}
              onShowSubtitlesChange={setShowSubtitles}
              showTextOverlays={showTextOverlays}
              onShowTextOverlaysChange={setShowTextOverlays}
              isRemovingBurnedSubs={isRemovingBurnedSubs}
              hasCleanedVideo={!!cleanedVideoUrl}
              burnedSubsStatus={burnedSubsStatus}
              onRemoveBurnedSubtitles={handleRemoveBurnedSubtitles}
              onRestoreOriginalVideo={handleRestoreOriginalVideo}
              subtitleSafeZone={subtitleSafeZone}
              onSubtitleSafeZoneChange={onSubtitleSafeZoneChange}
              isDetectingBand={isDetectingBand}
              onDetectSubtitleBand={handleDetectSubtitleBand}
              onAddVideoAsScene={async (file) => {
                // Upload to storage and get video metadata
                try {
                  toast.info(t('dc.videoProcessing'));
                  
                  // Create object URL to get video duration
                  const objectUrl = URL.createObjectURL(file);
                  const video = document.createElement('video');
                  video.preload = 'metadata';
                  
                  video.onloadedmetadata = () => {
                    const duration = video.duration;
                    // WICHTIG: URL NICHT widerrufen - sie wird für die Szene benötigt!
                    
                    // Add as new scene
                    handleAddVideoAsScene(objectUrl, duration, file.name);
                    toast.success(t('dc.videoAddedAsScene', { name: file.name }));
                  };
                  
                  video.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                    toast.error(t('dc.videoLoadError'));
                  };
                  
                  video.src = objectUrl;
                } catch (error) {
                  console.error('Error adding video as scene:', error);
                  toast.error(t('dc.videoAddError'));
                }
              }}
              onMusicDrop={async (track) => {
                const originalUrl = track.audioUrl;  // Original Jamendo URL für Lambda
                let cachedUrl = track.audioUrl;      // Gecachete URL für Preview
                
                // If Jamendo URL, upload to storage for faster browser preview
                if (originalUrl.includes('jamendo.com') || originalUrl.includes('storage.jamendo.com')) {
                  try {
                    toast.info(t('dc.musicPreparing'));
                    const { data, error } = await supabase.functions.invoke('upload-music-to-storage', {
                      body: { originalUrl: originalUrl, projectId: 'directors-cut' }
                    });
                    if (!error && data?.storageUrl) {
                      cachedUrl = data.storageUrl;
                      console.log('[CapCutEditor] Cached Jamendo to storage for preview:', cachedUrl);
                      console.log('[CapCutEditor] Original URL preserved for rendering:', originalUrl);
                    }
                  } catch (err) {
                    console.warn('[CapCutEditor] Failed to cache audio, using original URL:', err);
                  }
                }
                
                // Add Jamendo track to music track
                const newClip: AudioClip = {
                  id: `music-${Date.now()}`,
                  trackId: 'track-music',
                  name: track.name,
                  url: cachedUrl,           // Gecachete URL für Browser-Preview
                  originalUrl: originalUrl, // Original Jamendo URL für Lambda Rendering
                  startTime: 0,
                  duration: track.duration,
                  trimStart: 0,
                  trimEnd: track.duration,
                  volume: 80,
                  fadeIn: 0.5,
                  fadeOut: 0.5,
                  source: 'library',
                  color: '#10b981',
                };
                handleAddClip('track-music', newClip);
                toast.success(t('dc.musicAddedToTrack', { name: track.name }));
              }}
              sceneCount={scenes.length}
              captionCount={subtitleTrack.clips.length}
              onExportClick={handleExportVideo}
              onResetClick={() => {
                if (onResetProject) {
                  onResetProject();
                } else {
                  toast.info(t('dc.projectResetting'));
                  handleAudioEffectsChange(DEFAULT_AUDIO_EFFECTS);
                }
              }}
              // New Studio Tab props
              scenes={scenes}
              transitions={transitions || []}
              onTransitionsChange={onTransitionsChange}
              selectedSceneId={selectedSceneId}
              currentTime={currentTime}
              onSplitAtPlayhead={handleSplitAtPlayhead}
              onDeleteScene={handleSceneDelete}
              onDuplicateScene={handleDuplicateScene}
              onSceneSelect={setSelectedSceneId}
              onAutocut={onStartAnalysis}
              isAnalyzing={isAnalyzing}
              onSceneAdd={handleSceneAdd}
              onSceneRename={handleSceneRename}
              onTrimScene={handleTrimScene}
              appliedEffects={appliedEffects?.global}
              onEffectsChange={onEffectsChange}
              colorGrading={colorGrading}
              onColorGradingChange={onColorGradingChange}
              styleTransfer={styleTransfer}
              onStyleTransferChange={onStyleTransferChange}
              sceneEffects={appliedEffects?.scenes}
              onSceneEffectsChange={onSceneEffectsChange}
              chromaKey={chromaKey}
              onChromaKeyChange={onChromaKeyChange}
              upscaling={upscaling}
              onUpscalingChange={onUpscalingChange}
              interpolation={interpolation}
              onInterpolationChange={onInterpolationChange}
              restoration={restoration}
              onRestorationChange={onRestorationChange}
              onScenePlaybackRateChange={handleScenePlaybackRateChange}
              exportSettings={exportSettings}
              onExportSettingsChange={onExportSettingsChange}
              onStartExport={handleExportVideo}
              onVoiceOverGenerated={(url: string) => {
                // Add voiceover clip to track
                const newClip: AudioClip = {
                  id: `vo-subtitle-${Date.now()}`,
                  trackId: 'track-voiceover',
                  name: 'Subtitle Voiceover',
                  url,
                  startTime: 0,
                  duration: actualTotalDuration,
                  trimStart: 0,
                  trimEnd: actualTotalDuration,
                  volume: 100,
                  fadeIn: 0.2,
                  fadeOut: 0.2,
                  source: 'ai-generated',
                  color: '#f59e0b',
                };
                handleAddClip('track-voiceover', newClip);
                onVoiceOverGenerated?.(url);
              }}
              onVoiceoverVolumeChange={(vol) => {
                setAudioTracks(prev => prev.map(t =>
                  t.id === 'track-voiceover' ? { ...t, volume: vol } : t
                ));
              }}
              voiceoverVolume={audioTracks.find(t => t.id === 'track-voiceover')?.volume ?? 100}
            />
            )}
          </div>

          {/* Center Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Preview Player */}
            <div className="h-[50%] min-h-[280px] p-2 bg-[#050816] overflow-hidden flex flex-col">
              <DirectorsCutPreviewPlayer
                fillContainer={true}
                videoUrl={cleanedVideoUrl || videoUrl}
                effects={appliedEffects?.global || { brightness: 100, contrast: 100, saturation: 100, sharpness: 0, temperature: 0, vignette: 0 }}
                sceneEffects={appliedEffects?.scenes || {}}
                scenes={scenes}
                transitions={transitions || []}
                audio={audioEnhancements}
                duration={actualTotalDuration}
                currentTime={currentTime}
                onTimeUpdate={setCurrentTime}
                colorGrading={colorGrading}
                sceneColorGrading={sceneColorGrading}
                styleTransfer={styleTransfer}
                speedKeyframes={speedKeyframes}
                kenBurns={kenBurns}
                textOverlays={showTextOverlays ? (textOverlays || []) : []}
                subtitleTrack={showSubtitles ? subtitleTrack : { ...subtitleTrack, clips: [] }}
                externalIsPlaying={isPlaying}
                onPlayingChange={setIsPlaying}
                originalAudioMuted={(() => {
                  const originalTrack = audioTracks.find(t => t.name === 'Original');
                  if (!originalTrack) return true;
                  if (originalTrack.muted) return true;
                  if (originalTrack.clips.length === 0) return true;
                  return false;
                })()}
                subtitleSafeZone={subtitleSafeZone}
              />
            </div>

            {/* Timeline */}
            <div className="flex-1 border-t border-[#F5C76A]/10 overflow-hidden">
              <CapCutTimeline
                tracks={audioTracks}
                scenes={scenes}
                currentTime={currentTime}
                duration={actualTotalDuration}
                zoom={zoom}
                selectedClipId={selectedClipId}
                selectedSceneId={selectedSceneId}
                subtitleTrack={subtitleTrack}
                selectedSubtitleId={selectedSubtitleId}
                onSeek={handleSeek}
                onZoomChange={setZoom}
                onClipSelect={handleClipSelect}
                onSceneSelect={setSelectedSceneId}
                onTrackMute={handleTrackMute}
                onTrackSolo={handleTrackSolo}
                onClipDelete={handleDeleteClip}
                onClipResize={handleClipResize}
                onSceneDelete={handleSceneDelete}
                onSceneAdd={handleSceneAdd}
                onSceneAddFromMedia={() => setShowAddMediaDialog(true)}
                onSubtitleUpdate={handleSubtitleUpdate}
                onSubtitleDelete={handleSubtitleDelete}
                onSubtitleSelect={handleSubtitleSelect}
                onSplitAtPlayhead={handleSplitAtPlayhead}
                onTrimScene={handleTrimScene}
                cutMarkers={cutMarkers}
                snapEnabled={snapEnabled}
                onSnapEnabledChange={setSnapEnabled}
                onAddCutMarker={handleAddCutMarker}
              />
            </div>
          </div>

          {/* Right Sidebar - Collapsible */}
          <div className={cn(
            "border-l border-[#F5C76A]/10 bg-[#0a0a1a]/90 backdrop-blur-lg transition-all duration-200 flex-shrink-0",
            propertiesCollapsed ? "w-12" : "w-64"
          )}>
            {propertiesCollapsed ? (
              <div className="flex flex-col items-center py-4">
                <button 
                  onClick={() => setPropertiesCollapsed(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title={t('dc.openProperties')}
                >
                  <Settings className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <CapCutPropertiesPanel
                selectedClip={selectedClip}
                selectedSubtitle={selectedSubtitle}
                audioTracks={audioTracks}
                onTracksChange={setAudioTracks}
                audioEnhancements={audioEnhancements}
                onAudioChange={onAudioChange}
                onSubtitleUpdate={handleSubtitleUpdate}
                onSubtitleDelete={handleSubtitleDelete}
                onClipDelete={handleDeleteClip}
              />
            )}
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeDragItem && (
            <div 
              className="px-3 py-2 rounded shadow-lg border flex items-center gap-2"
              style={{ 
                backgroundColor: activeDragItem.color,
                borderColor: '#00d4ff',
              }}
            >
              {activeDragItem.type === 'music' ? (
                <Music className="h-4 w-4 text-white" />
              ) : (
                <Volume2 className="h-4 w-4 text-white" />
              )}
              <span className="text-sm text-white font-medium">{activeDragItem.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Render Overlay */}
      <RenderOverlay
        isVisible={isRendering}
        progress={renderProgress}
        status={renderStatus}
        videoUrl={renderedVideoUrl}
        errorMessage={renderError}
        onDownload={handleRenderDownload}
        onRetry={handleExportVideo}
        onClose={handleRenderClose}
        onOpenLibrary={handleOpenLibrary}
        startedAt={renderStartedAt}
      />
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        currentSettings={exportSettings || { quality: 'fhd', format: 'mp4', fps: 30, aspect_ratio: '16:9' }}
        onConfirm={(newSettings) => {
          onExportSettingsChange?.(newSettings);
          setTimeout(() => handleExportVideo(), 50);
        }}
      />
      <AddMediaDialog
        open={showAddMediaDialog}
        onOpenChange={setShowAddMediaDialog}
        onMediaSelect={(media) => {
          if (media.type === 'video') {
            handleAddVideoAsScene(media.url, media.duration, media.name);
            toast.success(t('dc.videoAddedAsScene', { name: media.name }));
          } else {
            // Images as scenes are not yet supported in the preview pipeline
            toast.info('Bilder als Szene werden bald unterstützt. Bitte vorerst ein Video wählen.');
          }
        }}
      />
    </div>
  );
};
