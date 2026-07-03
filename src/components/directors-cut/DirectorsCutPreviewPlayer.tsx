import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { getSpeedAtTime } from '@/utils/speedCurve';
import { SubtitleSafeZone } from '@/lib/directors-cut-draft';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, VolumeX, Volume2, Maximize2, RotateCcw } from 'lucide-react';
import { GlobalEffects, AudioEnhancements, SceneEffects, SceneAnalysis, TransitionAssignment, TextOverlay, AVAILABLE_FILTERS } from '@/types/directors-cut';
import type { KenBurnsKeyframe } from './features/KenBurnsEffect';
import { SubtitleTrack, DEFAULT_SUBTITLE_STYLE } from '@/types/timeline';
import { cn } from '@/lib/utils';
import { useTransitionRenderer } from './preview/useTransitionRenderer';
import { useFrameCapture } from './preview/useFrameCapture';
import { NativePreviewEffects } from './preview/NativePreviewEffects';
import { NativeTextOverlayRenderer } from './preview/NativeTextOverlayRenderer';
import { resolveTransitions, findActiveTransition as resolverFindActiveTransition, findFreezePhase } from '@/utils/transitionResolver';
import { getEffectiveBackgroundMusicVolume } from '@/lib/audioVolume';

const SUBTITLE_FONT_SIZES = {
  small: '16px',
  medium: '24px',
  large: '32px',
  xl: '48px',
};

type PitchAwareMediaElement = HTMLMediaElement & {
  preservesPitch?: boolean;
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

const clampVol = (v: number) => Math.min(1, Math.max(0, v));

const configurePitchPreservation = (mediaElement: HTMLMediaElement | null, preservesPitch = true) => {
  if (!mediaElement) return;

  const pitchAwareMedia = mediaElement as PitchAwareMediaElement;
  pitchAwareMedia.preservesPitch = preservesPitch;
  pitchAwareMedia.mozPreservesPitch = preservesPitch;
  pitchAwareMedia.webkitPreservesPitch = preservesPitch;
};

interface DirectorsCutPreviewPlayerProps {
  videoUrl: string;
  effects: GlobalEffects;
  sceneEffects?: Record<string, SceneEffects>;
  scenes?: SceneAnalysis[];
  transitions?: TransitionAssignment[];
  audio: AudioEnhancements;
  duration: number;
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  styleTransfer?: {
    enabled: boolean;
    style: string | null;
    intensity: number;
  };
  colorGrading?: {
    enabled: boolean;
    grade: string | null;
    intensity: number;
  };
  sceneColorGrading?: Record<string, { grade?: string | null; intensity?: number }>;
  speedKeyframes?: Array<{ time: number; speed: number; sceneId?: string }>;
  chromaKey?: {
    enabled: boolean;
    color: string;
    tolerance: number;
    backgroundUrl?: string;
  };
  kenBurns?: KenBurnsKeyframe[];
  voiceoverUrl?: string;
  backgroundMusicUrl?: string;
  textOverlays?: TextOverlay[];
  subtitleTrack?: SubtitleTrack;
  externalIsPlaying?: boolean;
  onPlayingChange?: (isPlaying: boolean) => void;
  originalAudioMuted?: boolean;
  initialMuted?: boolean;
  className?: string;
  fillContainer?: boolean;
  children?: React.ReactNode;
  subtitleSafeZone?: SubtitleSafeZone;
}

export const DirectorsCutPreviewPlayer: React.FC<DirectorsCutPreviewPlayerProps> = ({
  videoUrl,
  effects,
  sceneEffects = {},
  scenes = [],
  transitions = [],
  audio,
  duration,
  currentTime = 0,
  onTimeUpdate,
  styleTransfer,
  colorGrading,
  sceneColorGrading,
  speedKeyframes,
  chromaKey,
  kenBurns,
  voiceoverUrl,
  backgroundMusicUrl,
  textOverlays = [],
  subtitleTrack,
  externalIsPlaying,
  onPlayingChange,
  originalAudioMuted = false,
  initialMuted = true,
  className = '',
  fillContainer = false,
  children,
  subtitleSafeZone,
}) => {
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);
  const transitionCanvasRef = useRef<HTMLCanvasElement>(null);
  // Ping-pong: tracks which slot is currently the active (visible, playing) video
  const activeSlotRef = useRef<'A' | 'B'>('A');
  // Helper to get the currently active video element
  const getActiveVideo = useCallback(() => {
    return activeSlotRef.current === 'A' ? videoRefA.current : videoRefB.current;
  }, []);
  const getStandbyVideo = useCallback(() => {
    return activeSlotRef.current === 'A' ? videoRefB.current : videoRefA.current;
  }, []);
  // Ping-pong prewarm: which upcoming scene index the standby slot is primed for
  // (null = not primed). Used to swap slots on scene boundaries without a
  // decoder-stalling seek on the active <video>.
  const standbyPrimedForRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  // Set initial standby video styles imperatively to avoid React re-render conflicts
  useEffect(() => {
    const standby = getStandbyVideo();
    if (standby) {
      standby.style.opacity = '0';
      standby.style.pointerEvents = 'none';
    }
  }, [getStandbyVideo]);

  // Native audio refs
  const sourceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceoverAudioRef = useRef<HTMLAudioElement | null>(null);
  const backgroundMusicAudioRef = useRef<HTMLAudioElement | null>(null);
  const isMutedRef = useRef(initialMuted);
  const isPlayingRef = useRef(false);
  const originalAudioMutedRef = useRef(originalAudioMuted);
  const voiceoverShouldRecoverRef = useRef(false);
  const voiceoverRecoveryTimerRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [displayTime, setDisplayTime] = useState(currentTime);
  const visualTimeRef = useRef(currentTime);
  const rafIdRef = useRef<number>();
  const inGapRef = useRef(false);
  const gapLastTimestampRef = useRef<number>(0);
  const gapCooldownRef = useRef<number>(0);

  // ===== Media-overlay (uploaded video / image / blackscreen scenes) =====
  // Independent of the original-video clock — advanced by a software clock so that
  // playback never stalls at scenes whose visual source is NOT the original video.
  const mediaVideoRef = useRef<HTMLVideoElement>(null);
  const swClockLastTsRef = useRef<number>(0);
  const activeMediaSceneIdRef = useRef<string | null>(null);
  const activeMediaSrcInRef = useRef<number>(0);

  useEffect(() => { setIsMuted(initialMuted); }, [initialMuted]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => {
    originalAudioMutedRef.current = originalAudioMuted;
    // Reactively pause/resume original audio when mute state changes
    if (originalAudioMuted && sourceAudioRef.current) {
      sourceAudioRef.current.pause();
      sourceAudioRef.current.volume = 0;
    } else if (!originalAudioMuted && sourceAudioRef.current && isPlayingRef.current && !isMutedRef.current) {
      sourceAudioRef.current.volume = clampVol((audio.master_volume || 100) / 100);
      sourceAudioRef.current.play().catch(() => {});
    }
  }, [originalAudioMuted, audio.master_volume]);

  // Sort scenes by start_time for consistent matching
  const sortedScenes = useMemo(() => {
    return [...scenes].sort((a, b) => a.start_time - b.start_time);
  }, [scenes]);

  // Helper: compute source time for a specific scene at a given timeline time
  const sourceTimeForScene = useCallback((scene: SceneAnalysis, timelineTime: number): number => {
    const sourceStart = scene.original_start_time ?? scene.start_time;
    const playbackRate = (scene as any).playbackRate ?? 1;
    return sourceStart + (timelineTime - scene.start_time) * playbackRate;
  }, []);

  // Pre-resolve transitions using the shared resolver (single source of truth)
  const resolvedTransitions = useMemo(
    () => resolveTransitions(sortedScenes, transitions),
    [sortedScenes, transitions],
  );

  // Helper: find active transition OR freeze-phase using SOURCE time
  const findActiveTransition = useCallback((sourceTime: number) => {
    // Check freeze phase first
    const freezeRT = findFreezePhase(sourceTime, resolvedTransitions);
    if (freezeRT) {
      const outgoingScene = sortedScenes.find(s => s.id === freezeRT.outgoingSceneId);
      const incomingScene = sortedScenes.find(s => s.id === freezeRT.incomingSceneId);
      if (outgoingScene && incomingScene) {
        return {
          outgoingScene,
          incomingScene,
          boundary: freezeRT.originalBoundary + freezeRT.offsetSeconds,
          leadIn: freezeRT.duration * 0.5,
          tDuration: freezeRT.duration,
          progress: 0,
          isFreeze: true,
          tEnd: freezeRT.tEnd,
        };
      }
    }

    // Check active transition
    const active = resolverFindActiveTransition(sourceTime, resolvedTransitions);
    if (active) {
      const { transition: rt, progress } = active;
      const outgoingScene = sortedScenes.find(s => s.id === rt.outgoingSceneId);
      const incomingScene = sortedScenes.find(s => s.id === rt.incomingSceneId);
      if (outgoingScene && incomingScene) {
        return {
          outgoingScene,
          incomingScene,
          boundary: rt.originalBoundary + rt.offsetSeconds,
          leadIn: rt.duration * 0.5,
          tDuration: rt.duration,
          progress,
          isFreeze: false,
          tEnd: rt.tEnd,
        };
      }
    }
    return null;
  }, [sortedScenes, resolvedTransitions]);

  // Helper: map timeline time → source video time (transition-aware: stays on outgoing scene)
  const timelineToSourceTime = useCallback((timelineTime: number): number => {
    if (sortedScenes.length === 0) return timelineTime;
    const activeTrans = findActiveTransition(timelineTime);
    if (activeTrans) {
      return sourceTimeForScene(activeTrans.outgoingScene, Math.min(timelineTime, activeTrans.outgoingScene.end_time));
    }
    const scene = sortedScenes.find(s => timelineTime >= s.start_time && timelineTime < s.end_time);
    if (!scene) return timelineTime;
    return sourceTimeForScene(scene, timelineTime);
  }, [sortedScenes, findActiveTransition, sourceTimeForScene]);


  // ==================== VOICEOVER HELPERS ====================
  const playVoiceover = useCallback(() => {
    const voiceover = voiceoverAudioRef.current;
    if (!voiceover || isMutedRef.current) return;
    voiceover.play().then(() => {
      voiceoverShouldRecoverRef.current = false;
    }).catch(() => {
      if (isPlayingRef.current && !isMutedRef.current) {
        voiceoverShouldRecoverRef.current = true;
      }
    });
  }, []);

  const scheduleVoiceoverRecovery = useCallback(() => {
    if (voiceoverRecoveryTimerRef.current) {
      window.clearTimeout(voiceoverRecoveryTimerRef.current);
    }
    voiceoverRecoveryTimerRef.current = window.setTimeout(() => {
      if (!voiceoverShouldRecoverRef.current || !isPlayingRef.current || isMutedRef.current) return;
      playVoiceover();
    }, 150);
  }, [playVoiceover]);

  // ==================== NATIVE AUDIO SETUP ====================
  useEffect(() => {
    sourceAudioRef.current?.pause();
    voiceoverAudioRef.current?.pause();
    backgroundMusicAudioRef.current?.pause();
    sourceAudioRef.current = null;
    voiceoverAudioRef.current = null;
    backgroundMusicAudioRef.current = null;

    if (videoUrl) {
      const src = new Audio(videoUrl);
      src.preload = 'auto';
      src.volume = isMuted ? 0 : clampVol((audio.master_volume || 100) / 100);
      src.defaultPlaybackRate = 1;
      src.playbackRate = 1;
      configurePitchPreservation(src, true);
      sourceAudioRef.current = src;
    }
    if (voiceoverUrl) {
      const vo = new Audio(voiceoverUrl);
      vo.preload = 'auto';
      vo.volume = isMuted ? 0 : 1.0;
      vo.defaultPlaybackRate = 1;
      vo.playbackRate = 1;
      configurePitchPreservation(vo, true);
      voiceoverAudioRef.current = vo;
    }
    if (backgroundMusicUrl) {
      const bg = new Audio(backgroundMusicUrl);
      bg.preload = 'auto';
      // Music mix policy: default 30% slider; when a voiceover is present we
      // reserve headroom via getEffectiveBackgroundMusicVolume so the preview
      // matches what the Remotion export produces (see DirectorsCutVideo.tsx).
      const musicBase = 0.3;
      bg.volume = isMuted ? 0 : getEffectiveBackgroundMusicVolume(musicBase, !!voiceoverUrl);
      bg.loop = true;
      bg.defaultPlaybackRate = 1;
      bg.playbackRate = 1;
      configurePitchPreservation(bg, true);
      backgroundMusicAudioRef.current = bg;
    }

    return () => {
      if (voiceoverRecoveryTimerRef.current) {
        window.clearTimeout(voiceoverRecoveryTimerRef.current);
        voiceoverRecoveryTimerRef.current = null;
      }
      sourceAudioRef.current?.pause();
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
      sourceAudioRef.current = null;
      voiceoverAudioRef.current = null;
      backgroundMusicAudioRef.current = null;
    };
  }, [videoUrl, voiceoverUrl, backgroundMusicUrl]);

  // Voiceover recovery listeners
  useEffect(() => {
    const voiceover = voiceoverAudioRef.current;
    if (!voiceover) return;

    const markForRecovery = () => {
      if (isPlayingRef.current && !isMutedRef.current) {
        voiceoverShouldRecoverRef.current = true;
      }
    };
    const handleCanPlay = () => {
      if (!voiceoverShouldRecoverRef.current) return;
      scheduleVoiceoverRecovery();
    };
    const handlePlaying = () => {
      voiceoverShouldRecoverRef.current = false;
      if (voiceoverRecoveryTimerRef.current) {
        window.clearTimeout(voiceoverRecoveryTimerRef.current);
        voiceoverRecoveryTimerRef.current = null;
      }
    };
    const handlePause = () => {
      if (isPlayingRef.current && !isMutedRef.current && !voiceover.ended) {
        voiceoverShouldRecoverRef.current = true;
        scheduleVoiceoverRecovery();
      }
    };

    voiceover.addEventListener('waiting', markForRecovery);
    voiceover.addEventListener('stalled', markForRecovery);
    voiceover.addEventListener('canplay', handleCanPlay);
    voiceover.addEventListener('playing', handlePlaying);
    voiceover.addEventListener('pause', handlePause);

    return () => {
      voiceover.removeEventListener('waiting', markForRecovery);
      voiceover.removeEventListener('stalled', markForRecovery);
      voiceover.removeEventListener('canplay', handleCanPlay);
      voiceover.removeEventListener('playing', handlePlaying);
      voiceover.removeEventListener('pause', handlePause);
    };
  }, [voiceoverUrl, scheduleVoiceoverRecovery]);

  // Update source audio volume
  useEffect(() => {
    if (sourceAudioRef.current) {
      sourceAudioRef.current.volume = clampVol((audio.master_volume || 100) / 100);
    }
  }, [audio.master_volume]);

  // ==================== VIDEO EVENT HANDLERS ====================
  // Forward ref for resetToPrimaryVideoSlot — declared here so `handleVideoEnded`
  // can reach it without triggering TDZ (its concrete definition lives further down).
  const resetToPrimaryVideoSlotRef = useRef<((sourceTime: number) => void) | null>(null);

  const handleVideoEnded = useCallback(() => {
    // Check if there are remaining scenes on the timeline after the current position
    const currentTime = visualTimeRef.current;
    const video = getActiveVideo();
    const remainingScenes = sortedScenes.filter(s => s.start_time > currentTime + 0.1);
    
    if (remainingScenes.length > 0 && video) {
      // There are more scenes — seek to the next one instead of stopping.
      // For non-original sources (blackscreen, uploaded media, AI-generated
      // media clips) the primary <video> element is not the render source,
      // so a source-seek would either fail or scrub an unrelated media file.
      const nextScene = remainingScenes[0];
      const nextSourceMode = (nextScene as any).sourceMode ?? 'original';
      if (nextSourceMode === 'original') {
        const nextSourceStart = nextScene.original_start_time ?? nextScene.start_time;
        video.currentTime = nextSourceStart + 0.05;
        video.playbackRate = (nextScene as any).playbackRate ?? 1;
        video.play().catch(() => {});
      } else {
        // Advance the visual timeline; the scene-media renderer will pick up
        // the new scene on the next frame.
        visualTimeRef.current = nextScene.start_time + 0.001;
        setDisplayTime(nextScene.start_time + 0.001);
        onTimeUpdateRef.current?.(nextScene.start_time + 0.001);
      }
      return;
    }
    
    setIsPlaying(false);
    isPlayingRef.current = false;
    visualTimeRef.current = 0;
    setDisplayTime(0);
    onTimeUpdateRef.current?.(0);

    sourceAudioRef.current?.pause();
    if (sourceAudioRef.current) sourceAudioRef.current.currentTime = 0;
    voiceoverShouldRecoverRef.current = false;
    voiceoverAudioRef.current?.pause();
    if (voiceoverAudioRef.current) voiceoverAudioRef.current.currentTime = 0;
    backgroundMusicAudioRef.current?.pause();
    if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.currentTime = 0;

    // Wipe transition state so replays don't reuse a stale handoff phase
    // that would keep Slot B pinned as the visible layer on scene 2.
    resetTransitionStateRef.current?.();
    transitionPhaseRef.current = 'idle';
    if (transitionCooldownRef.current) transitionCooldownRef.current = 0;
    lastHandoffBoundaryRef.current = null;

    // Re-seat the ping-pong to Slot A at the very first source frame so the
    // next Play starts from scene 1, not from wherever Slot B ended.
    const firstScene = sortedScenes[0];
    const firstSource = firstScene?.original_start_time ?? firstScene?.start_time ?? 0;
    resetToPrimaryVideoSlotRef.current?.(firstSource);

    onPlayingChange?.(false);
  }, [onPlayingChange, sortedScenes, getActiveVideo]);

  // ==================== FRAME CAPTURE & TRANSITION RENDERER ====================
  const frameCache = useFrameCapture(videoUrl, sortedScenes);
  const frameCacheRef = useRef(frameCache);
  useEffect(() => { frameCacheRef.current = frameCache; }, [frameCache]);

  const videoFilterRef = useRef('');

  // Synchronous filter computation for the RAF loop — eliminates 2-3 frame delay
  const computeFilterForTimeRef = useRef<(time: number) => string>(() => '');
  const effectsRef = useRef(effects);
  const sceneEffectsRef = useRef(sceneEffects);
  useEffect(() => { effectsRef.current = effects; }, [effects]);
  useEffect(() => { sceneEffectsRef.current = sceneEffects; }, [sceneEffects]);

  const computeFilterForTime = useCallback((time: number): string => {
    const eff = effectsRef.current;
    const sEffects = sceneEffectsRef.current;
    const filters: string[] = [];

    // Find current scene for this time
    let scene: SceneAnalysis | undefined = sortedScenes.find(s => time >= s.start_time && time < s.end_time);
    if (!scene && sortedScenes.length > 0) {
      scene = time < sortedScenes[0].start_time ? sortedScenes[0] : sortedScenes[sortedScenes.length - 1];
    }

    const sceneFx = scene ? sEffects?.[scene.id] : undefined;
    const bright = sceneFx?.brightness ?? eff.brightness ?? 100;
    const contr = sceneFx?.contrast ?? eff.contrast ?? 100;
    const sat = sceneFx?.saturation ?? eff.saturation ?? 100;
    const sharp = sceneFx?.sharpness ?? eff.sharpness ?? 0;
    const temp = sceneFx?.temperature ?? eff.temperature ?? 0;

    if (bright !== 100) filters.push(`brightness(${bright / 100})`);
    if (contr !== 100) filters.push(`contrast(${contr / 100})`);
    if (sat !== 100) filters.push(`saturate(${sat / 100})`);

    if (temp > 0) {
      filters.push(`sepia(${Math.min(temp / 100, 0.4)})`);
      filters.push(`saturate(${1 + temp / 200})`);
    } else if (temp < 0) {
      filters.push(`hue-rotate(${Math.max(temp * 1.2, -60)}deg)`);
      filters.push(`saturate(${1 + Math.abs(temp) / 200})`);
    }

    if (sharp > 0) {
      const sharpBoost = 1 + (sharp / 100) * 0.15;
      filters.push(`contrast(${sharpBoost})`);
    }

    const sceneFilter = scene && sEffects?.[scene.id]?.filter;
    const activeFilterId = sceneFilter || eff.filter;
    if (activeFilterId && activeFilterId !== 'none') {
      const filterDef = AVAILABLE_FILTERS.find(f => f.id === activeFilterId);
      if (filterDef?.preview) filters.push(filterDef.preview);
    }

    return filters.length > 0 ? filters.join(' ') : '';
  }, [sortedScenes]);

  useEffect(() => { computeFilterForTimeRef.current = computeFilterForTime; }, [computeFilterForTime]);

  // Ken Burns refs for RAF-loop application
  const kenBurnsRef = useRef(kenBurns);
  useEffect(() => { kenBurnsRef.current = kenBurns; }, [kenBurns]);
  const kenBurnsWrapperRef = useRef<HTMLDivElement>(null);

  // Subtitle safe zone ref for RAF-loop (avoids React re-render conflicts)
  const subtitleSafeZoneRef = useRef(subtitleSafeZone);
  useEffect(() => { subtitleSafeZoneRef.current = subtitleSafeZone; }, [subtitleSafeZone]);

  const buildSafeZoneTransform = (): string => {
    const sz = subtitleSafeZoneRef.current;
    if (!sz?.enabled || sz.mode !== 'reframe') return '';
    // Hard crop: zoom in and shift up so bottomBandPercent is pushed out of view
    const cropPercent = sz.bottomBandPercent || 12;
    const zoomFactor = 1 / (1 - cropPercent / 100);
    const shiftY = -(cropPercent / 2);
    return `scale(${zoomFactor.toFixed(4)}) translateY(${shiftY.toFixed(2)}%)`;
  };

  // Apply clip-path on the outer wrapper to hard-crop the bottom band
  const safeZoneOuterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outer = safeZoneOuterRef.current;
    if (!outer) return;
    const sz = subtitleSafeZone;
    if (sz?.enabled && sz.mode === 'reframe' && sz.bottomBandPercent > 0) {
      // Clip the bottom N% of the visible area
      outer.style.clipPath = `inset(0 0 ${sz.bottomBandPercent}% 0)`;
    } else {
      outer.style.clipPath = 'none';
    }
  }, [subtitleSafeZone]);

  // Speed keyframes ref for RAF-loop application
  const speedKeyframesRef = useRef(speedKeyframes);
  useEffect(() => { speedKeyframesRef.current = speedKeyframes; }, [speedKeyframes]);

  // Cooldown ref: when a transition just ended, suppress boundary seek for N frames
  const transitionCooldownRef = useRef<number>(0);
  // Structured boundary marker: tracks which boundary was consumed by the handoff
  const lastHandoffBoundaryRef = useRef<{ outgoingSceneId: string; incomingSceneId: string; boundarySourceTime: number } | null>(null);
  // Shared transition phase ref — lets the player know when the renderer is in handoff
  const transitionPhaseRef = useRef<'idle' | 'preparing' | 'active' | 'handoff'>('idle');
  const transitionClockLastTsRef = useRef<number>(0);
  const postTransitionHoldFramesRef = useRef<number>(0);
  // Reset hook exposed by useTransitionRenderer — cleared on natural end/replay
  // so the internal phase/seek markers don't survive across playbacks.
  const resetTransitionStateRef = useRef<(() => void) | null>(null);

  useTransitionRenderer(videoRefA, videoRefB, videoUrl, transitionCanvasRef, visualTimeRef, sortedScenes, transitions, videoFilterRef, frameCacheRef, computeFilterForTimeRef, transitionCooldownRef, postTransitionHoldFramesRef, lastHandoffBoundaryRef, transitionPhaseRef, activeSlotRef, resetTransitionStateRef, isPlayingRef, mediaVideoRef);


  // ==================== rAF PLAYBACK LOOP (VIDEO-LED) ====================
  // Track last scene index to detect scene changes (only seek on scene entry)
  const lastSceneIndexRef = useRef<number>(-1);
  // Guard: when boundary-advance triggers a seek, suppress false "non-sequential jump" detection
  // for a few frames until the decoder settles into the new scene
  const pendingSceneAdvanceRef = useRef<{ targetIndex: number; framesLeft: number } | null>(null);

  const resetPlaybackGuards = useCallback(() => {
    lastSceneIndexRef.current = -1;
    pendingSceneAdvanceRef.current = null;
    transitionCooldownRef.current = 0;
    postTransitionHoldFramesRef.current = 0;
    lastHandoffBoundaryRef.current = null;
    transitionPhaseRef.current = 'idle';
    inGapRef.current = false;
    gapLastTimestampRef.current = 0;
    gapCooldownRef.current = 0;
    swClockLastTsRef.current = 0;
    transitionClockLastTsRef.current = 0;
    activeMediaSceneIdRef.current = null;
    standbyPrimedForRef.current = null;
  }, []);

  const resetToPrimaryVideoSlot = useCallback((sourceTime: number) => {
    activeSlotRef.current = 'A';
    const slotA = videoRefA.current;
    const slotB = videoRefB.current;
    if (slotB) {
      slotB.pause();
      slotB.style.opacity = '0';
      slotB.style.pointerEvents = 'none';
      slotB.style.transform = 'none';
      slotB.style.clipPath = 'none';
      slotB.style.filter = 'none';
      slotB.style.position = '';
      slotB.style.inset = '';
      slotB.style.zIndex = '';
    }
    if (slotA) {
      // Only reveal Slot A once the seek to the trimmed in-point has actually
      // landed — otherwise the browser paints the previous currentTime (often
      // frame 0 of the source video) for one frame before the seek completes.
      const alreadyThere =
        slotA.readyState >= 1 && Math.abs(slotA.currentTime - sourceTime) < 0.02;
      try { slotA.currentTime = sourceTime; } catch {}
      slotA.style.opacity = alreadyThere ? '1' : '0';
      slotA.style.pointerEvents = 'auto';
      // The onSeeked handler on <video ref={videoRefA}> will flip opacity to 1
      // as soon as the browser confirms the seek has landed.
    }
    const overlay = mediaVideoRef.current;
    if (overlay) {
      overlay.pause();
      overlay.removeAttribute('src');
    }
  }, []);

  // Publish the concrete implementation to the forward-ref used by handleVideoEnded.
  useEffect(() => {
    resetToPrimaryVideoSlotRef.current = resetToPrimaryVideoSlot;
    return () => { resetToPrimaryVideoSlotRef.current = null; };
  }, [resetToPrimaryVideoSlot]);

  const seekToTimelineTime = useCallback((timelineTime: number, options?: { resetGuards?: boolean; forcePrimarySlot?: boolean }) => {
    const safeTimelineTime = Math.max(0, Math.min(timelineTime, duration));
    const sourceTime = timelineToSourceTime(safeTimelineTime);
    const activeVideo = getActiveVideo();

    if (options?.resetGuards) resetPlaybackGuards();
    if (options?.forcePrimarySlot) resetToPrimaryVideoSlot(sourceTime);
    else if (activeVideo) {
      try { activeVideo.currentTime = sourceTime; } catch {}
    }

    visualTimeRef.current = safeTimelineTime;
    setDisplayTime(safeTimelineTime);
    onTimeUpdateRef.current?.(safeTimelineTime);
    if (sourceAudioRef.current) sourceAudioRef.current.currentTime = sourceTime;
    if (voiceoverAudioRef.current) voiceoverAudioRef.current.currentTime = safeTimelineTime;
    if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.currentTime = safeTimelineTime;

    return { timelineTime: safeTimelineTime, sourceTime };
  }, [duration, getActiveVideo, resetPlaybackGuards, resetToPrimaryVideoSlot, timelineToSourceTime]);

  useEffect(() => {
    // Scene EDL changed (trim, split, delete). Re-map the current timeline
    // position to its new source in/out immediately, otherwise the media
    // element can continue from the stale full-video position.
    const nextTime = Math.min(visualTimeRef.current, duration);
    seekToTimelineTime(nextTime, { resetGuards: true, forcePrimarySlot: true });
  }, [sortedScenes, duration, seekToTimelineTime]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      return;
    }

    let lastDisplayUpdate = 0;
    let lastParentUpdate = 0;

    // Helper: reverse-map source time → timeline time for a given scene
    const sourceToTimelineTime = (scene: SceneAnalysis, sourceTime: number): number => {
      const sourceStart = scene.original_start_time ?? scene.start_time;
      const playbackRate = (scene as any).playbackRate ?? 1;
      return scene.start_time + (sourceTime - sourceStart) / playbackRate;
    };

    // Helper: find which scene the video's current source time belongs to
    // Returns matchType to distinguish exact vs extended-tolerance matches
    // preferredIndex: bias toward current or next scene in fallback to prevent backward snapping
    const findSceneBySourceTime = (sourceTime: number, preferredIndex: number): { scene: SceneAnalysis; index: number; matchType: 'exact' | 'extended' } | null => {
      // Pass 1: Exact match (tight tolerance)
      for (let i = 0; i < sortedScenes.length; i++) {
        const s = sortedScenes[i];
        const srcStart = s.original_start_time ?? s.start_time;
        const rate = (s as any).playbackRate ?? 1;
        const srcEnd = srcStart + (s.end_time - s.start_time) * rate;
        if (sourceTime >= srcStart - 0.05 && sourceTime < srcEnd + 0.05) {
          return { scene: s, index: i, matchType: 'exact' };
        }
      }
      // Pass 2: Extended tolerance fallback (for transitions flowing past boundary)
      // Collect ALL candidates and pick the best one based on proximity to preferredIndex
      let bestCandidate: { scene: SceneAnalysis; index: number; matchType: 'extended' } | null = null;
      let bestScore = Infinity;
      for (let i = 0; i < sortedScenes.length; i++) {
        const s = sortedScenes[i];
        const srcStart = s.original_start_time ?? s.start_time;
        const rate = (s as any).playbackRate ?? 1;
        const srcEnd = srcStart + (s.end_time - s.start_time) * rate;
        if (sourceTime >= srcStart - 0.05 && sourceTime < srcEnd + 1.5) {
          // Score: prefer preferredIndex, then preferredIndex+1, then closest forward
          let score: number;
          if (i === preferredIndex) score = 0;
          else if (i === preferredIndex + 1) score = 1;
          else if (i > preferredIndex) score = 2 + (i - preferredIndex);
          else score = 100 + (preferredIndex - i); // Strongly penalize backward matches
          if (score < bestScore) {
            bestScore = score;
            bestCandidate = { scene: s, index: i, matchType: 'extended' };
          }
        }
      }
      return bestCandidate;
    };

    const tick = () => {
      const video = getActiveVideo();
      if (!video) { rafIdRef.current = requestAnimationFrame(tick); return; }

      const gapNow = performance.now();

      // ===== TRANSITION BRANCH (highest priority, timeline-led) =====
      // Professional NLEs render transitions as an A/B overlap layer that wins
      // over ordinary clip playback. This must run before media/blackscreen
      // branches; otherwise an added clip can short-circuit the transition and
      // the user sees a hard cut.
      const earlyTransitionNow = findActiveTransition(visualTimeRef.current);
      if (earlyTransitionNow && !earlyTransitionNow.isFreeze) {
        const delta = transitionClockLastTsRef.current > 0
          ? (gapNow - transitionClockLastTsRef.current) / 1000
          : 0;
        transitionClockLastTsRef.current = gapNow;

        const nextTL = Math.min(earlyTransitionNow.tEnd, visualTimeRef.current + delta);
        visualTimeRef.current = nextTL;

        const outgoingIdx = sortedScenes.findIndex(s => s.id === earlyTransitionNow.outgoingScene.id);
        if (outgoingIdx >= 0) lastSceneIndexRef.current = outgoingIdx;

        setDisplayTime(nextTL);
        onTimeUpdateRef.current?.(nextTL);

        if (sourceAudioRef.current && !sourceAudioRef.current.paused) {
          sourceAudioRef.current.pause();
        }

        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }
      transitionClockLastTsRef.current = 0;

      // ===== MEDIA / BLACKSCREEN SCENE BRANCH (software clock) =====
      // If the scene at the current timeline position is NOT backed by the
      // original video, advance time independently. This is what allows
      // overlay-clips and empty placeholder scenes to play through cleanly
      // — like Artlist / CapCut treat distinct timeline clips.
      {
        const tlNow = visualTimeRef.current;
        const mediaScene = sortedScenes.find(s => tlNow >= s.start_time && tlNow < s.end_time);
        const isMediaMode = mediaScene && (
          mediaScene.sourceMode === 'media' ||
          mediaScene.sourceMode === 'blackscreen' ||
          (!mediaScene.sourceMode && mediaScene.isBlackscreen)
        );

        if (isMediaMode && mediaScene) {
          const delta = swClockLastTsRef.current > 0
            ? (gapNow - swClockLastTsRef.current) / 1000
            : 0;
          swClockLastTsRef.current = gapNow;

          // Pause the original-video slot + its source audio. Visibility is
          // gated below so A/B can hold the handoff frame until the media
          // overlay has decoded the exact next frame.
          if (!video.paused) video.pause();
          const standby = getStandbyVideo();
          if (sourceAudioRef.current && !sourceAudioRef.current.paused) {
            sourceAudioRef.current.pause();
          }

          // Sync overlay <video> for media scenes (image scenes have no element)
          const overlay = mediaVideoRef.current;
          const isVideoOverlay = mediaScene.sourceMode === 'media' &&
            mediaScene.additionalMedia?.type === 'video';
          const mediaRate = (mediaScene as any).playbackRate ?? 1;
          const mSrcIn = (mediaScene as any).original_start_time ?? 0;
          const mSrcOut = (mediaScene as any).original_end_time ?? Infinity;
          const expectedOverlayTime = mSrcIn + Math.max(0, tlNow - mediaScene.start_time) * mediaRate;
          let overlayReadyForHandoff = false;
          if (overlay && isVideoOverlay) {
            // (Re)bind src on scene change OR when head-trim changed OR when the
            // overlay's playhead has drifted outside the new [mSrcIn, mSrcOut] window
            // (typical right after a split that keeps the same scene id + same mSrcIn
            // but shrinks mSrcOut).
            const trimChanged = Math.abs((activeMediaSrcInRef.current ?? 0) - mSrcIn) > 0.01;
            const overlayOutOfRange =
              Number.isFinite(mSrcOut) &&
              (overlay.currentTime < expectedOverlayTime - 0.35 || overlay.currentTime > mSrcOut + 0.05);
            if (activeMediaSceneIdRef.current !== mediaScene.id || trimChanged || overlayOutOfRange) {
              activeMediaSceneIdRef.current = mediaScene.id;
              activeMediaSrcInRef.current = mSrcIn;
              if (overlay.src !== mediaScene.additionalMedia!.url) {
                overlay.src = mediaScene.additionalMedia!.url;
              }
              try { overlay.currentTime = expectedOverlayTime; } catch {}
              overlay.playbackRate = mediaRate;
              overlay.play().catch(() => {});
            } else if (overlay.paused) {
              overlay.play().catch(() => {});
            }
            // Guard: if overlay drifted before srcIn, snap back
            if (Math.abs(overlay.currentTime - expectedOverlayTime) > 0.35) {
              try { overlay.currentTime = expectedOverlayTime; } catch {}
            }
            const overlaySrcMatches = overlay.currentSrc === mediaScene.additionalMedia!.url || overlay.getAttribute('src') === mediaScene.additionalMedia!.url;
            const overlayTimeMatches = Math.abs(overlay.currentTime - expectedOverlayTime) <= 0.18;
            overlayReadyForHandoff = overlaySrcMatches && overlay.readyState >= 2 && overlayTimeMatches;
            overlay.style.opacity = overlayReadyForHandoff ? '1' : '0';
          } else {
            // Image / blackscreen — make sure overlay <video> is idle
            if (overlay && !overlay.paused) overlay.pause();
            if (activeMediaSceneIdRef.current !== mediaScene.id) {
              activeMediaSceneIdRef.current = mediaScene.id;
              activeMediaSrcInRef.current = mSrcIn;
              if (overlay) overlay.removeAttribute('src');
            }
            if (overlay) overlay.style.opacity = '0';
          }

          const keepABVisible = isVideoOverlay && !overlayReadyForHandoff;
          video.style.opacity = keepABVisible ? '1' : '0';
          if (standby && standby !== video) standby.style.opacity = keepABVisible ? standby.style.opacity : '0';
          if (postTransitionHoldFramesRef.current > 0) {
            postTransitionHoldFramesRef.current -= 1;
          }

          // Advance timeline by wall-clock delta
          const nextTL = Math.min(tlNow + delta, mediaScene.end_time);
          visualTimeRef.current = nextTL;
          // Lock lastSceneIndex to this scene so transitions don't snap back
          const idx = sortedScenes.indexOf(mediaScene);
          if (idx >= 0) lastSceneIndexRef.current = idx;

          // Throttled UI updates
          setDisplayTime(nextTL);
          onTimeUpdateRef.current?.(nextTL);

          // End of scene? Either timeline end OR overlay reached srcOut.
          const overlayPastOut = isVideoOverlay && overlay && overlay.currentTime >= mSrcOut - 0.03;
          if (nextTL >= mediaScene.end_time - 0.001 || overlayPastOut) {
            const nextScene = sortedScenes[idx + 1];
            activeMediaSceneIdRef.current = null;
            activeMediaSrcInRef.current = 0;
            if (overlay) {
              overlay.pause();
              overlay.removeAttribute('src');
            }
            if (nextScene) {
              // Seek original video to the next scene's source position so the
              // normal video-led branch can take over on the following frame.
              const nextSrc = nextScene.original_start_time ?? nextScene.start_time;
              try { video.currentTime = nextSrc + 0.02; } catch {}
              video.playbackRate = (nextScene as any).playbackRate ?? 1;
              if (isPlayingRef.current) video.play().catch(() => {});
              visualTimeRef.current = nextScene.start_time;
              pendingSceneAdvanceRef.current = { targetIndex: idx + 1, framesLeft: 15 };
              swClockLastTsRef.current = 0;
            } else {
              swClockLastTsRef.current = 0;
              handleVideoEnded();
              return;
            }
          }


          rafIdRef.current = requestAnimationFrame(tick);
          return;
        } else {
          // Not in media mode — reset overlay state
          if (activeMediaSceneIdRef.current !== null) {
            activeMediaSceneIdRef.current = null;
            const overlay = mediaVideoRef.current;
            if (overlay) {
              overlay.pause();
              overlay.removeAttribute('src');
            }
            // Make sure original video resumes if we're playing
            if (isPlayingRef.current && video.paused) {
              video.play().catch(() => {});
            }
            video.style.opacity = '1';
          }
          swClockLastTsRef.current = 0;
        }
      }

      // === GAP DETECTION: check if timeline time is in a gap between scenes ===
      // When in a gap, we manually advance timeline time and hide the video
      if (inGapRef.current) {
        const delta = gapLastTimestampRef.current > 0 ? (gapNow - gapLastTimestampRef.current) / 1000 : 0;
        gapLastTimestampRef.current = gapNow;
        const currentTL = visualTimeRef.current + delta;
        
        // Find the next scene that starts after our current position
        let nextScene: SceneAnalysis | null = null;
        for (const s of sortedScenes) {
          if (s.start_time > visualTimeRef.current + 0.01) {
            nextScene = s;
            break;
          }
        }

        if (nextScene && currentTL >= nextScene.start_time) {
          // Gap ended — seek to next scene and restore video
          inGapRef.current = false;
          gapLastTimestampRef.current = 0;
          gapCooldownRef.current = 15;
          const nextSourceStart = nextScene.original_start_time ?? nextScene.start_time;
          video.currentTime = nextSourceStart + 0.05;
          video.playbackRate = (nextScene as any).playbackRate ?? 1;
          video.style.opacity = '1';
          const standby = getStandbyVideo();
          if (standby) standby.style.opacity = '0';
          visualTimeRef.current = nextScene.start_time;

          // Set pending scene advance so scene detection picks the right scene
          const idx = sortedScenes.indexOf(nextScene);
          if (idx >= 0) {
            lastSceneIndexRef.current = idx;
            pendingSceneAdvanceRef.current = { targetIndex: idx, framesLeft: 15 };
          }

          // Play video unconditionally (was paused during gap)
          video.play().catch(() => {});

          // Resume audio after gap
          if (sourceAudioRef.current && !originalAudioMutedRef.current && !isMutedRef.current) {
            sourceAudioRef.current.currentTime = nextSourceStart;
            sourceAudioRef.current.play().catch(() => {});
          }
          if (voiceoverAudioRef.current && !isMutedRef.current) {
            voiceoverAudioRef.current.currentTime = nextScene.start_time;
            voiceoverAudioRef.current.play().catch(() => {});
          }
          if (backgroundMusicAudioRef.current && !isMutedRef.current) {
            backgroundMusicAudioRef.current.currentTime = nextScene.start_time;
            backgroundMusicAudioRef.current.play().catch(() => {});
          }
        } else if (!nextScene || currentTL >= duration - 0.05) {
          // No next scene or past end — stop
          inGapRef.current = false;
          gapLastTimestampRef.current = 0;
          handleVideoEnded();
          return;
        } else {
          // Still in gap — advance timeline, keep video hidden
          visualTimeRef.current = currentTL;
          video.style.opacity = '0';
          const standby = getStandbyVideo();
          if (standby) standby.style.opacity = '0';

          // Throttled UI updates during gap
          const lastUpdate = visualTimeRef.current;
          setDisplayTime(currentTL);
          onTimeUpdateRef.current?.(currentTL);
        }

        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }

      // NOTE: Transitions are fully handled earlier in this tick (see lines ~701–722).
      // A second `findActiveTransition` branch used to live here as a belt-and-suspenders
      // safety net, but it was unreachable — the earlier branch always `return`s first —
      // and it was a latent footgun if anyone later mutated `visualTimeRef` between the
      // two checks. Removed intentionally; do not reintroduce.
      transitionClockLastTsRef.current = 0;


      if (transitionPhaseRef.current === 'active') {
        // Give the transition renderer one frame to perform its ping-pong slot
        // handoff after visualTime reaches tEnd.
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }

      // VIDEO-LED: read video.currentTime as source of truth
      const videoSourceTime = video.currentTime;

      if (
        sourceAudioRef.current &&
        sourceAudioRef.current.paused &&
        isPlayingRef.current &&
        !isMutedRef.current &&
        !originalAudioMutedRef.current &&
        transitionPhaseRef.current === 'idle'
      ) {
        if (Math.abs(sourceAudioRef.current.currentTime - videoSourceTime) > 0.2) {
          sourceAudioRef.current.currentTime = videoSourceTime;
        }
        sourceAudioRef.current.play().catch(() => {});
      }

      // Decrement transition cooldown counter each frame
      if (transitionCooldownRef.current > 0) {
        transitionCooldownRef.current--;
      }
      if (gapCooldownRef.current > 0) {
        gapCooldownRef.current--;
      }

      // Reverse-map to timeline time
      const sceneInfo = findSceneBySourceTime(videoSourceTime, lastSceneIndexRef.current);
      let timelineTime: number;

      // Cache findActiveTransition ONCE per frame — using TIMELINE time
      // The resolver works in timeline-time, so we must query it with timeline-time
      let cachedActiveTrans: ReturnType<typeof findActiveTransition> = null;
      if (sceneInfo) {
        const approxTimelineTime = sourceToTimelineTime(sceneInfo.scene, videoSourceTime);
        cachedActiveTrans = findActiveTransition(approxTimelineTime);
      }

      if (sceneInfo) {
        timelineTime = sourceToTimelineTime(sceneInfo.scene, videoSourceTime);
        
        // During active transitions, fix timeline time to flow linearly
        // from outgoing scene's end_time through the transition window
        if (cachedActiveTrans && !cachedActiveTrans.isFreeze) {
          // Let timeline time flow past scene boundary — don't clamp to scene.end_time
          // But keep sceneInfo locked to the outgoing scene
          const outgoing = cachedActiveTrans.outgoingScene;
          if (sceneInfo.scene.id !== outgoing.id) {
            // Force sceneInfo to stay on outgoing scene during transition
            timelineTime = sourceToTimelineTime(outgoing, videoSourceTime);
          }
        } else if (!cachedActiveTrans) {
          timelineTime = Math.max(sceneInfo.scene.start_time, Math.min(timelineTime, sceneInfo.scene.end_time));
        }

        // Detect scene change → only seek when entering a NEW scene
        if (sceneInfo.index !== lastSceneIndexRef.current) {
          const prevIndex = lastSceneIndexRef.current;
          
          // Check if there's a pending advance that matches this scene change
          const isPendingAdvance = pendingSceneAdvanceRef.current && 
            pendingSceneAdvanceRef.current.targetIndex === sceneInfo.index;
          
          if (isPendingAdvance) {
            // Expected scene change from boundary advance — accept it cleanly
            pendingSceneAdvanceRef.current = null;
            lastSceneIndexRef.current = sceneInfo.index;
          } else if (sceneInfo.matchType === 'exact') {
            // Real scene change confirmed by exact match — accept it
            lastSceneIndexRef.current = sceneInfo.index;
            
            // Only seek on true non-sequential jumps (not next scene in order)
            if (prevIndex >= 0 && sceneInfo.index !== prevIndex + 1 && transitionPhaseRef.current === 'idle') {
              const expectedSource = sourceTimeForScene(sceneInfo.scene, sceneInfo.scene.start_time);
              if (Math.abs(video.currentTime - expectedSource) > 0.3) {
                video.currentTime = expectedSource;
              }
            }
          } else {
            // Extended-tolerance match during transition — update lastSceneIndexRef
            // if we're in an active transition and the matched scene is the incoming scene.
            // This prevents a false "new scene" detection when the transition ends.
            if (cachedActiveTrans) {
              if (sceneInfo.scene.id === cachedActiveTrans.incomingScene.id) {
                lastSceneIndexRef.current = sceneInfo.index;
              }
            }
          }

          // playbackRate is set in the unified SPEED RAMPING block below
        }
        
        // Decrement pending advance frame counter if active but not yet matched
        if (pendingSceneAdvanceRef.current) {
          pendingSceneAdvanceRef.current.framesLeft--;
          if (pendingSceneAdvanceRef.current.framesLeft <= 0) {
            // Pending advance expired — clear it
            pendingSceneAdvanceRef.current = null;
          }
        }

        // Scene-boundary-crossing logic: SKIP entirely during active transitions
        // Canvas handles visuals; video just keeps playing through the boundary
        if (!cachedActiveTrans && transitionCooldownRef.current <= 0 && gapCooldownRef.current <= 0 && transitionPhaseRef.current === 'idle') {
          const srcStart = sceneInfo.scene.original_start_time ?? sceneInfo.scene.start_time;
          const rate = (sceneInfo.scene as any).playbackRate ?? 1;
          const srcEnd = srcStart + (sceneInfo.scene.end_time - sceneInfo.scene.start_time) * rate;

          // Use source-time boundary for scene advancement (compare source vs source)
          const matchedRT = resolvedTransitions.find(rt => rt.outgoingSceneId === sceneInfo.scene.id);

          // If this cut has a transition, NEVER perform the normal instant scene
          // advance. That old -0.02s lookahead was causing the player to jump to
          // the next scene just before the transition window, so the transition
          // visually finished before the next clip actually appeared. Hand off to
          // the timeline-led transition branch instead.
          if (matchedRT) {
            // A transition on this cut owns both slots (via useTransitionRenderer).
            // Drop any prewarmed standby so we don't fight the transition renderer.
            standbyPrimedForRef.current = null;
            const transitionSourceBoundary = matchedRT.originalBoundary + matchedRT.offsetSeconds;
            if (videoSourceTime >= transitionSourceBoundary - 0.005) {
              // Enter the resolver-defined transition window exactly. Using
              // Math.max(..., visualTimeRef.current) allowed decoder jumps to
              // skip past tStart, so the active-transition branch never became
              // visible and the cut looked instant.
              const startAt = matchedRT.tStart;
              visualTimeRef.current = startAt;
              timelineTime = startAt;
              transitionClockLastTsRef.current = 0;
              try {
                video.currentTime = Math.max(0, matchedRT.originalBoundary - 1 / 60);
              } catch {}
              if (!video.paused) video.pause();

              setDisplayTime(startAt);
              onTimeUpdateRef.current?.(startAt);
              rafIdRef.current = requestAnimationFrame(tick);
              return;
            }
          }

          const effectiveBoundary = matchedRT 
            ? matchedRT.originalBoundary + matchedRT.offsetSeconds 
            : srcEnd;

          // ------------------------------------------------------------------
          // Ping-pong PREWARM for the non-transition, non-gap scene advance.
          // When we get close to a scene boundary that has no transition and no
          // significant gap, prime the standby <video> slot at the next scene's
          // in-point and let it start decoding. At the boundary we swap slots
          // instead of seeking the active <video>, which used to stall the
          // decoder for 100–400 ms — the freeze the user reported. Audio tracks
          // (source / VO / music) are NEVER touched here so they stay linear.
          // ------------------------------------------------------------------
          if (!matchedRT && standbyPrimedForRef.current !== sceneInfo.index + 1) {
            const remaining = effectiveBoundary - videoSourceTime;
            if (remaining > 0 && remaining < 0.4) {
              const nextSceneP = sortedScenes[sceneInfo.index + 1];
              if (nextSceneP) {
                const gapDurationP = nextSceneP.start_time - sceneInfo.scene.end_time;
                if (gapDurationP <= 0.2) {
                  const standby = getStandbyVideo();
                  if (standby) {
                    const nextSourceStartP = nextSceneP.original_start_time ?? nextSceneP.start_time;
                    const nextRateP = (nextSceneP as any).playbackRate ?? 1;
                    try {
                      if (Math.abs(standby.currentTime - nextSourceStartP) > 0.05) {
                        standby.currentTime = nextSourceStartP;
                      }
                      standby.playbackRate = nextRateP;
                      // Keep hidden until the swap — but start decoding now.
                      standby.style.opacity = '0';
                      if (isPlayingRef.current) {
                        standby.play().catch(() => {});
                      }
                      standbyPrimedForRef.current = sceneInfo.index + 1;
                    } catch {}
                  }
                }
              }
            }
          }

          if (!matchedRT && videoSourceTime >= effectiveBoundary - 0.02) {
            // Check if this boundary was already consumed by a handoff (structured match)
            const handoffMarker = lastHandoffBoundaryRef.current;
            const nextScene = sortedScenes[sceneInfo.index + 1];
            if (handoffMarker !== null && 
                handoffMarker.outgoingSceneId === sceneInfo.scene.id &&
                nextScene && handoffMarker.incomingSceneId === nextScene.id) {
              // Boundary already handled by transition handoff — skip the seek
              lastHandoffBoundaryRef.current = null;
            } else {
              // Video reached end of scene — check for gap before advancing
              const nextScene = sortedScenes[sceneInfo.index + 1];
              if (nextScene) {
                const gapDuration = nextScene.start_time - sceneInfo.scene.end_time;
                 if (gapDuration > 0.2) {
                  // Large gap detected — enter gap mode (black screen).
                  // Audio pause is intentional ONLY on gaps.
                  inGapRef.current = true;
                  gapLastTimestampRef.current = performance.now();
                  visualTimeRef.current = sceneInfo.scene.end_time;
                  video.pause();
                  sourceAudioRef.current?.pause();
                  voiceoverAudioRef.current?.pause();
                  backgroundMusicAudioRef.current?.pause();
                  video.style.opacity = '0';
                  const standby = getStandbyVideo();
                  if (standby) standby.style.opacity = '0';
                  standbyPrimedForRef.current = null;
                  rafIdRef.current = requestAnimationFrame(tick);
                  return;
                }
                // No significant gap — normal scene advance.
                // AUDIO STAYS CONTINUOUS across this cut. Do not pause / seek
                // sourceAudio, voiceover, or background music here — they run
                // on the linear timeline and their scene rate is handled in
                // the SPEED RAMPING block further down.
                const nextSourceStart = nextScene.original_start_time ?? nextScene.start_time;
                const nextRate = (nextScene as any).playbackRate ?? 1;

                // Prefer PING-PONG SLOT SWAP over a mini-seek on the active
                // <video>. A seek forces the decoder to flush and re-fill its
                // buffer (~100–400 ms freeze). A slot swap is instant because
                // the standby has been decoding at nextSourceStart already.
                const standby = getStandbyVideo();
                const canSwap =
                  standby &&
                  standbyPrimedForRef.current === sceneInfo.index + 1 &&
                  standby.readyState >= 2 /* HAVE_CURRENT_DATA */;

                if (canSwap && standby) {
                  const oldActive = video;
                  // Flip active slot BEFORE mutating visibility so downstream
                  // consumers (getActiveVideo/getStandbyVideo) see the new state.
                  activeSlotRef.current = activeSlotRef.current === 'A' ? 'B' : 'A';
                  standby.style.opacity = '1';
                  // Hide + pause the outgoing slot next frame so the swap is atomic.
                  requestAnimationFrame(() => {
                    try {
                      oldActive.style.opacity = '0';
                      if (!oldActive.paused) oldActive.pause();
                    } catch {}
                  });
                  standbyPrimedForRef.current = null;

                  // Source-audio drift correction: only nudge if drift > 60 ms
                  // to avoid an audible click on every cut.
                  const audioEl = sourceAudioRef.current;
                  if (
                    audioEl &&
                    !audioEl.paused &&
                    !originalAudioMutedRef.current &&
                    Math.abs(audioEl.currentTime - nextSourceStart) > 0.06
                  ) {
                    try { audioEl.currentTime = nextSourceStart; } catch {}
                  }
                } else {
                  // Fallback (standby not primed in time): legacy mini-seek path.
                  const seekDiff = Math.abs(video.currentTime - nextSourceStart);
                  if (seekDiff > 0.3) {
                    video.currentTime = nextSourceStart;
                  } else {
                    // Scenes are adjacent in source — nudge forward so tolerance
                    // doesn't keep matching previous scene
                    video.currentTime = nextSourceStart + 0.05;
                  }
                  video.playbackRate = nextRate;
                }

                pendingSceneAdvanceRef.current = { targetIndex: sceneInfo.index + 1, framesLeft: 15 };
                timelineTime = nextScene.start_time;
              }
            }
          }
        }

        // Ensure video is visible when we have a valid scene (not in gap)
        if (!inGapRef.current) {
          video.style.opacity = '1';
        }
      } else {
        // Fallback: no scene found — check if we're in a gap (but NOT during gap cooldown)
        if (gapCooldownRef.current > 0) {
          // During cooldown after gap exit, advance timeline from video position
          const sceneIdx = lastSceneIndexRef.current;
          if (sceneIdx >= 0 && sceneIdx < sortedScenes.length) {
            const s = sortedScenes[sceneIdx];
            const srcStart = s.original_start_time ?? s.start_time;
            const rate = (s as any).playbackRate ?? 1;
            const offset = (videoSourceTime - srcStart) / rate;
            timelineTime = s.start_time + Math.max(0, offset);
          } else {
            timelineTime = visualTimeRef.current;
          }
        } else {
          const estimatedTL = videoSourceTime;
          let inGap = false;
          for (let i = 0; i < sortedScenes.length - 1; i++) {
            const gapStart = sortedScenes[i].end_time;
            const gapEnd = sortedScenes[i + 1].start_time;
            if (gapEnd - gapStart > 0.2 && estimatedTL >= gapStart - 0.1 && estimatedTL < gapEnd + 0.1) {
              inGap = true;
              inGapRef.current = true;
              gapLastTimestampRef.current = performance.now();
              visualTimeRef.current = estimatedTL;
              video.pause();
              sourceAudioRef.current?.pause();
              voiceoverAudioRef.current?.pause();
              backgroundMusicAudioRef.current?.pause();
              video.style.opacity = '0';
              const standby = getStandbyVideo();
              if (standby) standby.style.opacity = '0';
              rafIdRef.current = requestAnimationFrame(tick);
              return;
            }
          }
          timelineTime = videoSourceTime;
        }
      }

      // Clamp timeline time
      timelineTime = Math.max(0, Math.min(timelineTime, duration));
      visualTimeRef.current = timelineTime;

      // === KEN BURNS MOTION + SCENE ANIMATION ===
      const kbWrapper = kenBurnsWrapperRef.current;
      if (kbWrapper) {
        const kbKeyframes = kenBurnsRef.current;
        let kbApplied = false;
        if (kbKeyframes && kbKeyframes.length > 0 && sceneInfo) {
          // Find matching Ken Burns keyframe for current scene
          const kbForScene = kbKeyframes.find(kb => kb.sceneId === sceneInfo.scene.id) 
            || kbKeyframes.find(kb => !kb.sceneId); // fallback to global
          if (kbForScene) {
            const sceneStart = sceneInfo.scene.start_time;
            const sceneDur = sceneInfo.scene.end_time - sceneStart;
            const progress = sceneDur > 0 ? Math.max(0, Math.min(1, (timelineTime - sceneStart) / sceneDur)) : 0;
            const zoom = kbForScene.startZoom + (kbForScene.endZoom - kbForScene.startZoom) * progress;
            const panX = kbForScene.startX + (kbForScene.endX - kbForScene.startX) * progress;
            const panY = kbForScene.startY + (kbForScene.endY - kbForScene.startY) * progress;
            const szTransform = buildSafeZoneTransform();
            kbWrapper.style.transform = `scale(${zoom}) translate(${panX}%, ${panY}%)${szTransform ? ' ' + szTransform : ''}`;
            kbApplied = true;
          }
        }
        // Scene animation fallback (when no Ken Burns is active)
        if (!kbApplied && sceneInfo) {
          const sEffects = sceneEffectsRef.current;
          const anim = sEffects?.[sceneInfo.scene.id]?.animation;
          if (anim && anim.type && anim.type !== 'none') {
            const sceneStart = sceneInfo.scene.start_time;
            const sceneDur = sceneInfo.scene.end_time - sceneStart;
            const progress = sceneDur > 0 ? Math.max(0, Math.min(1, (timelineTime - sceneStart) / sceneDur)) : 0;
            const intensity = (anim.intensity ?? 50) / 100;
            const szTransform = buildSafeZoneTransform();
            let animTransform = '';
            switch (anim.type) {
              case 'zoomIn': {
                const scale = 1 + (0.4 * intensity) * progress;
                animTransform = `scale(${scale})`;
                break;
              }
              case 'zoomOut': {
                const scale = 1 + (0.4 * intensity) * (1 - progress);
                animTransform = `scale(${scale})`;
                break;
              }
              case 'zoomInSlow': {
                const scale = 1 + (0.2 * intensity) * progress;
                animTransform = `scale(${scale})`;
                break;
              }
              case 'zoomOutSlow': {
                const scale = 1 + (0.2 * intensity) * (1 - progress);
                animTransform = `scale(${scale})`;
                break;
              }
              case 'panLeft': {
                const tx = -(15 * intensity) * progress;
                animTransform = `scale(1.15) translateX(${tx}%)`;
                break;
              }
              case 'panRight': {
                const tx = (15 * intensity) * progress;
                animTransform = `scale(1.15) translateX(${tx}%)`;
                break;
              }
              case 'panUp': {
                const ty = -(10 * intensity) * progress;
                animTransform = `scale(1.15) translateY(${ty}%)`;
                break;
              }
              case 'panDown': {
                const ty = (10 * intensity) * progress;
                animTransform = `scale(1.15) translateY(${ty}%)`;
                break;
              }
            }
            kbWrapper.style.transform = `${animTransform}${szTransform ? ' ' + szTransform : ''}`;
            kbApplied = true;
          }
        }
        if (!kbApplied) {
          const szFallback = buildSafeZoneTransform();
          kbWrapper.style.transform = szFallback || 'none';
        }
      }

      // === UNIFIED PLAYBACK RATE (Scene speed + Speed Ramping) ===
      if (video) {
        // Use scene-level playbackRate as base speed
        const sceneRate = sceneInfo ? ((sceneInfo.scene as any).playbackRate ?? 1) : 1;
        let activeSpeed = sceneRate;
        
        const sKeyframes = speedKeyframesRef.current;
        if (sKeyframes && sKeyframes.length > 0 && sceneInfo) {
          const sceneKFs = sKeyframes.filter(k => k.sceneId === sceneInfo.scene.id);
          const globalKFs = sKeyframes.filter(k => !k.sceneId);
          const relevantKFs = sceneKFs.length > 0 ? sceneKFs : globalKFs;
          
          if (relevantKFs.length > 0) {
            const useRelativeTime = sceneKFs.length > 0;
            const sceneStart = sceneInfo.scene.start_time ?? 0;
            const compareTime = useRelativeTime ? (timelineTime - sceneStart) : timelineTime;
            // Multiply scene base rate with keyframe speed for combined effect
            activeSpeed = sceneRate * getSpeedAtTime(relevantKFs, compareTime);
          }
        }
        
        const targetRate = Math.max(0.0625, Math.min(16, activeSpeed));
        if (Math.abs(video.playbackRate - targetRate) > 0.01) {
          video.playbackRate = targetRate;
        }

        // Voiceover and background music always stay at 1.0x
        if (voiceoverAudioRef.current && Math.abs(voiceoverAudioRef.current.playbackRate - 1) > 0.001) {
          voiceoverAudioRef.current.playbackRate = 1;
        }
        if (backgroundMusicAudioRef.current && Math.abs(backgroundMusicAudioRef.current.playbackRate - 1) > 0.001) {
          backgroundMusicAudioRef.current.playbackRate = 1;
        }
        
        // Source audio: sync playbackRate to video, preserve pitch, duck only at extreme speeds
        if (sourceAudioRef.current) {
          const masterVol = (audio.master_volume || 100) / 100;
          
          // Always sync playbackRate to match video
          if (Math.abs(sourceAudioRef.current.playbackRate - targetRate) > 0.01) {
            sourceAudioRef.current.playbackRate = targetRate;
          }
          
          // Only duck at extreme speeds (< 0.5x or > 2x) where pitch preservation fails
          if (targetRate < 0.5 || targetRate > 2) {
            const extremeness = targetRate < 0.5 
              ? (0.5 - targetRate) * 4   // 0.5→0 = duck 0→1
              : (targetRate - 2) * 0.5;  // 2→4 = duck 0→1
            const duckFactor = Math.max(0, 1 - Math.min(1, extremeness));
            sourceAudioRef.current.volume = clampVol(masterVol * duckFactor);
          } else {
            // Normal range (0.5x - 2x): full volume, pitch preserved by browser
            sourceAudioRef.current.volume = clampVol(masterVol);
          }
        }
      }

      // Throttled UI updates
      const now = performance.now();
      if (now - lastDisplayUpdate > 250) {
        lastDisplayUpdate = now;
        setDisplayTime(timelineTime);
      }
      if (now - lastParentUpdate > 250) {
        lastParentUpdate = now;
        onTimeUpdateRef.current?.(timelineTime);
      }

      // Drift correction for source audio — SKIP during transitions to prevent rubber-banding
      if (sourceAudioRef.current && !sourceAudioRef.current.paused && !cachedActiveTrans) {
        if (Math.abs(sourceAudioRef.current.currentTime - videoSourceTime) > 0.5) {
          sourceAudioRef.current.currentTime = videoSourceTime;
        }
      }

      // Check end of timeline
      if (timelineTime >= duration - 0.05) {
        handleVideoEnded();
        return;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => { if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current); };
  }, [isPlaying, duration, sortedScenes, sourceTimeForScene, transitions, resolvedTransitions, findActiveTransition, handleVideoEnded, getActiveVideo]);

  // ==================== VIDEO EVENT HANDLERS ====================

  // ==================== EXTERNAL isPlaying SYNC ====================
  useEffect(() => {
    if (externalIsPlaying === undefined) return;
    const video = getActiveVideo();
    if (!video) return;

    if (externalIsPlaying && !isPlaying) {
      seekToTimelineTime(visualTimeRef.current, { resetGuards: true, forcePrimarySlot: true });
      getActiveVideo()?.play().catch(() => {});
      setIsPlaying(true);
      if (!isMuted) {
        if (!originalAudioMuted) sourceAudioRef.current?.play().catch(() => {});
        voiceoverShouldRecoverRef.current = false;
        playVoiceover();
        backgroundMusicAudioRef.current?.play().catch(() => {});
      }
    } else if (!externalIsPlaying && isPlaying) {
      // Pause BOTH slots — Slot B may still be running from a transition.
      videoRefA.current?.pause();
      videoRefB.current?.pause();
      setIsPlaying(false);
      sourceAudioRef.current?.pause();
      voiceoverShouldRecoverRef.current = false;
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
    }
  }, [externalIsPlaying, isPlaying, isMuted, originalAudioMuted, playVoiceover, seekToTimelineTime, getActiveVideo]);

  // ==================== EXTERNAL TIME SYNC ====================
  useEffect(() => {
    if (isPlaying) return;

    if (Math.abs(currentTime - visualTimeRef.current) > 0.5) {
      seekToTimelineTime(currentTime, { resetGuards: true, forcePrimarySlot: true });
    }
  }, [currentTime, isPlaying, seekToTimelineTime]);

  // ==================== USER CONTROLS ====================
  const startAllAudio = useCallback(() => {
    const activeVideo = getActiveVideo();

    if (!originalAudioMuted && sourceAudioRef.current) {
      if (activeVideo && Math.abs(sourceAudioRef.current.currentTime - activeVideo.currentTime) > 0.15) {
        sourceAudioRef.current.currentTime = activeVideo.currentTime;
      }
      configurePitchPreservation(sourceAudioRef.current, true);
      sourceAudioRef.current.play().catch(() => {});
    }

    voiceoverShouldRecoverRef.current = false;
    if (voiceoverAudioRef.current) {
      voiceoverAudioRef.current.playbackRate = 1;
      configurePitchPreservation(voiceoverAudioRef.current, true);
    }
    playVoiceover();
    if (backgroundMusicAudioRef.current) {
      backgroundMusicAudioRef.current.playbackRate = 1;
      configurePitchPreservation(backgroundMusicAudioRef.current, true);
      backgroundMusicAudioRef.current.play().catch(() => {});
    }
  }, [originalAudioMuted, playVoiceover, getActiveVideo]);

  const stopAllAudio = useCallback(() => {
    sourceAudioRef.current?.pause();
    voiceoverShouldRecoverRef.current = false;
    voiceoverAudioRef.current?.pause();
    backgroundMusicAudioRef.current?.pause();
  }, []);

  const handlePlayPause = useCallback(() => {
    const video = getActiveVideo();
    if (!video) return;

    if (isPlaying) {
      // Pause BOTH slots — during a transition Slot B may be the one running.
      videoRefA.current?.pause();
      videoRefB.current?.pause();
      setIsPlaying(false);
      stopAllAudio();
      onPlayingChange?.(false);
    } else {
      if (video.ended || visualTimeRef.current >= duration - 0.1) {
        seekToTimelineTime(0, { resetGuards: true, forcePrimarySlot: true });
      } else {
        seekToTimelineTime(visualTimeRef.current, { resetGuards: true, forcePrimarySlot: true });
      }
      getActiveVideo()?.play().catch(() => {});
      setIsPlaying(true);
      if (!isMuted) startAllAudio();
      onPlayingChange?.(true);
    }
  }, [isPlaying, isMuted, duration, onPlayingChange, seekToTimelineTime, startAllAudio, stopAllAudio, getActiveVideo]);

  const handleMuteToggle = useCallback(async (e: React.MouseEvent) => {
    if (isMuted) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          if (ctx.state === 'suspended') await ctx.resume();
        }
      } catch {}

      setIsMuted(false);
      if (sourceAudioRef.current) sourceAudioRef.current.volume = clampVol((audio.master_volume || 100) / 100);
      if (voiceoverAudioRef.current) voiceoverAudioRef.current.volume = 1.0;
      if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.volume = 0.3;

      if (isPlaying) startAllAudio();
    } else {
      setIsMuted(true);
      stopAllAudio();
    }
  }, [isMuted, isPlaying, audio.master_volume, startAllAudio, stopAllAudio]);

  const handleSeek = useCallback((value: number[]) => {
    const newTime = value[0]; // timeline time
    seekToTimelineTime(newTime, { resetGuards: true, forcePrimarySlot: true });

    if (voiceoverAudioRef.current) {
      if (isPlayingRef.current && !isMutedRef.current) {
        voiceoverShouldRecoverRef.current = false;
        playVoiceover();
      }
    }
  }, [playVoiceover, seekToTimelineTime]);

  const handleReset = useCallback(() => {
    const video = getActiveVideo();
    if (!video) return;

    video.pause();
    const { sourceTime } = seekToTimelineTime(0, { resetGuards: true, forcePrimarySlot: true });
    setIsPlaying(false);
    const slotA = videoRefA.current;
    const slotB = videoRefB.current;
    if (slotA) {
      slotA.pause();
      slotA.currentTime = sourceTime;
      slotA.style.opacity = '1';
    }
    if (slotB) {
      slotB.pause();
      slotB.currentTime = 0;
      slotB.style.opacity = '0';
      slotB.style.pointerEvents = 'none';
      slotB.style.transform = 'none';
      slotB.style.clipPath = 'none';
      slotB.style.filter = 'none';
    }
    stopAllAudio();
    if (sourceAudioRef.current) sourceAudioRef.current.currentTime = sourceTime;
    if (voiceoverAudioRef.current) voiceoverAudioRef.current.currentTime = 0;
    if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.currentTime = 0;
  }, [seekToTimelineTime, stopAllAudio]);

  const handleFullscreen = useCallback(async () => {
    if (containerRef.current) {
      try {
        await containerRef.current.requestFullscreen();
        if (isMuted) setIsMuted(false);
      } catch {}
    }
  }, [isMuted]);

  // ==================== SUBTITLES ====================
  const currentSubtitles = useMemo(() => {
    if (!subtitleTrack?.visible) return [];
    return subtitleTrack.clips.filter(
      sub => displayTime >= sub.startTime && displayTime < sub.endTime
    );
  }, [subtitleTrack, displayTime]);

  // ==================== CSS FILTERS FROM EFFECTS ====================
  const currentScene = useMemo(() => {
    const exact = sortedScenes.find(s => displayTime >= s.start_time && displayTime < s.end_time);
    if (exact) return exact;
    if (sortedScenes.length > 0 && displayTime < sortedScenes[0].start_time) {
      return sortedScenes[0];
    }
    if (sortedScenes.length > 0) {
      return sortedScenes[sortedScenes.length - 1];
    }
    return undefined;
  }, [sortedScenes, displayTime]);

  const activeVisualTransition = useMemo(
    () => Boolean(
      resolverFindActiveTransition(displayTime, resolvedTransitions) ||
      transitionPhaseRef.current !== 'idle' ||
      postTransitionHoldFramesRef.current > 0
    ),
    [displayTime, resolvedTransitions],
  );

  const videoFilter = useMemo(() => {
    const filters: string[] = [];

    // Scene-specific values take priority over global
    const sceneFx = currentScene ? sceneEffects?.[currentScene.id] : undefined;

    const bright = sceneFx?.brightness ?? effects.brightness ?? 100;
    const contr = sceneFx?.contrast ?? effects.contrast ?? 100;
    const sat = sceneFx?.saturation ?? effects.saturation ?? 100;
    const sharp = sceneFx?.sharpness ?? effects.sharpness ?? 0;
    const temp = sceneFx?.temperature ?? effects.temperature ?? 0;

    if (bright !== 100) filters.push(`brightness(${bright / 100})`);
    if (contr !== 100) filters.push(`contrast(${contr / 100})`);
    if (sat !== 100) filters.push(`saturate(${sat / 100})`);

    // Temperature: warm → sepia + extra saturation, cold → hue-rotate into blue
    if (temp > 0) {
      filters.push(`sepia(${Math.min(temp / 100, 0.4)})`);
      filters.push(`saturate(${1 + temp / 200})`);
    } else if (temp < 0) {
      filters.push(`hue-rotate(${Math.max(temp * 1.2, -60)}deg)`);
      filters.push(`saturate(${1 + Math.abs(temp) / 200})`);
    }

    // Sharpness: simulate via micro contrast boost
    if (sharp > 0) {
      const sharpBoost = 1 + (sharp / 100) * 0.15;
      filters.push(`contrast(${sharpBoost})`);
    }

    // Apply scene-specific or global filter (cinematic, vintage, etc.)
    const sceneFilter = currentScene && sceneEffects?.[currentScene.id]?.filter;
    const activeFilterId = sceneFilter || effects.filter;

    if (activeFilterId && activeFilterId !== 'none') {
      const filterDef = AVAILABLE_FILTERS.find(f => f.id === activeFilterId);
      if (filterDef?.preview) {
        filters.push(filterDef.preview);
      }
    }

    return filters.length > 0 ? filters.join(' ') : undefined;
  }, [effects, sceneEffects, currentScene, sortedScenes, displayTime]);

  // Vignette value (scene-specific or global)
  const vignetteValue = useMemo(() => {
    const sceneFx = currentScene ? sceneEffects?.[currentScene.id] : undefined;
    return sceneFx?.vignette ?? effects.vignette ?? 0;
  }, [currentScene, sceneEffects, effects.vignette]);

  // Keep videoFilterRef in sync for the transition renderer
  // Track active slot changes to reapply filter after ping-pong swap
  const [activeSlotTracker, setActiveSlotTracker] = useState(activeSlotRef.current);
  useEffect(() => {
    // Slot-flips only ever happen mid-playback (transition handoff) or on explicit
    // seek/replay. So we gate the RAF poll behind `isPlayingRef` and re-check once
    // after any pause via a low-frequency safety tick. This keeps idle/background
    // tabs at 0% CPU while still catching post-seek slot changes promptly.
    let rafId = 0;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const check = () => {
      if (activeSlotRef.current !== activeSlotTracker) {
        setActiveSlotTracker(activeSlotRef.current);
      }
    };

    const tick = () => {
      check();
      if (isPlayingRef.current) {
        rafId = requestAnimationFrame(tick);
      } else {
        // Paused: stop the RAF loop, but schedule one delayed re-check to catch
        // slot changes that happen right after a seek/replay while paused.
        safetyTimer = setTimeout(() => {
          check();
          rafId = requestAnimationFrame(tick);
        }, 250);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, [activeSlotTracker]);


  useEffect(() => {
    videoFilterRef.current = videoFilter ?? '';
    // Apply filter imperatively to active video so effects work even without transitions
    const active = getActiveVideo();
    if (active) {
      active.style.filter = videoFilter || '';
    }
  }, [videoFilter, activeSlotTracker]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col ${fillContainer ? 'h-full overflow-hidden' : 'gap-3'} ${className}`}
    >
      {/* Video Player */}
      <div className={`relative bg-black rounded-lg overflow-hidden ${fillContainer ? 'flex-1 min-h-0' : 'aspect-video'}`}>
        {/* Safe Zone Reframe wrapper — hard-crops bottom band + zoom/shift */}
        <div
          ref={safeZoneOuterRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            zIndex: 0,
          }}
        >
        <div
          ref={kenBurnsWrapperRef}
          className="absolute inset-0 w-full h-full"
          style={{
            zIndex: 0,
            willChange: 'transform',
            transformOrigin: 'center center',
          }}
        >
          {/* Video Slot A */}
          <video
            ref={videoRefA}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-contain"
            style={{ zIndex: 1, opacity: 0 }}
            muted
            playsInline
            preload="auto"
            onEnded={(e) => { if (e.currentTarget === getActiveVideo()) handleVideoEnded(); }}
            onLoadedMetadata={(e) => {
              // Re-apply the trim-aware source time as soon as metadata is ready,
              // otherwise the browser paints frame 0 for a beat before our seek lands.
              const el = e.currentTarget;
              try {
                const src = timelineToSourceTime(visualTimeRef.current);
                el.currentTime = src;
              } catch {}
            }}
            onSeeked={(e) => {
              // Reveal slot A only after the first real seek finished — this
              // guarantees the first painted frame is the trimmed in-point,
              // never frame 0 of the underlying source video.
              if (activeSlotRef.current === 'A') {
                e.currentTarget.style.opacity = '1';
              }
            }}
          />

          {/* Video Slot B */}
          <video
            ref={videoRefB}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-contain"
            style={{ zIndex: 2, opacity: 0 }}
            muted
            playsInline
            preload="auto"
            onEnded={(e) => { if (e.currentTarget === getActiveVideo()) handleVideoEnded(); }}
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              try {
                const src = timelineToSourceTime(visualTimeRef.current);
                el.currentTime = src;
              } catch {}
            }}
            onSeeked={(e) => {
              // Symmetric to Slot A: only reveal Slot B once its seek to the
              // pre-handle in-point has actually landed. Prevents a one-frame
              // flash of frame 0 while the transition ramps its opacity in.
              if (activeSlotRef.current === 'B') {
                e.currentTarget.style.opacity = '1';
              }
            }}
          />

          {/* Media Overlay (uploaded video clips for `media` scenes) */}
          <video
            ref={mediaVideoRef}
            className="absolute inset-0 w-full h-full object-contain"
            style={{
              zIndex: 4,
              opacity: 0,
              pointerEvents: 'none',
              backgroundColor: '#000',
            }}
            muted={isMuted}
            playsInline
            preload="auto"
          />

          {/* Image Overlay (for `media` scenes that hold an image) */}
          {currentScene?.sourceMode === 'media' &&
            !activeVisualTransition &&
            currentScene?.additionalMedia?.type === 'image' && (
              <img
                src={currentScene.additionalMedia.url}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
                style={{ zIndex: 4, pointerEvents: 'none', backgroundColor: '#000' }}
              />
            )}

          {/* Blackscreen Overlay */}
          {(currentScene?.sourceMode === 'blackscreen' ||
            (!currentScene?.sourceMode && currentScene?.isBlackscreen)) && !activeVisualTransition && (
            <div
              className="absolute inset-0 w-full h-full"
              style={{ zIndex: 4, backgroundColor: '#000', pointerEvents: 'none' }}
            />
          )}
        </div>
        </div>

        {/* Transition canvas — used for frozen outgoing frame during opacity transitions */}
        <canvas
          ref={transitionCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ zIndex: 3, display: 'none', objectFit: 'contain' }}
        />

        {/* Lightweight effect overlays (color grading, vignette, etc.) */}
        <NativePreviewEffects
          effects={effects}
          colorGrading={colorGrading}
          sceneColorGrading={sceneColorGrading}
          scenes={sortedScenes}
          currentTime={displayTime}
        />

        {/* Vignette overlay from Step 5 color correction */}
        {vignetteValue > 0 && (
          <div
            className="absolute inset-0 pointer-events-none z-[5]"
            style={{
              background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${vignetteValue / 100 * 0.7}) 100%)`,
            }}
          />
        )}

        {/* Text Overlays */}
        {textOverlays.filter(o => displayTime >= o.startTime && (o.endTime === null || o.endTime === undefined || displayTime < o.endTime)).map(overlay => (
          <NativeTextOverlayRenderer key={overlay.id} overlay={overlay} displayTime={displayTime} isPlaying={isPlaying} />
        ))}

        {/* Fullscreen Button */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-12 h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white z-20"
          onClick={handleFullscreen}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>

        {children}

        {/* Subtitle Overlay */}
        {currentSubtitles.map(subtitle => (
          <div
            key={subtitle.id}
            className={cn(
              "absolute left-0 right-0 flex justify-center px-4 z-30 pointer-events-none",
              (subtitle.position || DEFAULT_SUBTITLE_STYLE.position) === 'top' && "top-[10%]",
              (subtitle.position || DEFAULT_SUBTITLE_STYLE.position) === 'center' && "top-1/2 -translate-y-1/2",
              (subtitle.position || DEFAULT_SUBTITLE_STYLE.position) === 'bottom' && "bottom-[15%]"
            )}
          >
            <div
              className="text-center max-w-[80%] leading-relaxed whitespace-pre-wrap"
              style={{
                fontSize: SUBTITLE_FONT_SIZES[(subtitle.fontSize || DEFAULT_SUBTITLE_STYLE.fontSize) as keyof typeof SUBTITLE_FONT_SIZES],
                fontFamily: subtitle.fontFamily || DEFAULT_SUBTITLE_STYLE.fontFamily,
                color: subtitle.color || DEFAULT_SUBTITLE_STYLE.color,
                backgroundColor: subtitle.backgroundColor || DEFAULT_SUBTITLE_STYLE.backgroundColor,
                padding: '8px 16px',
                borderRadius: '8px',
                textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                display: '-webkit-box',
                WebkitLineClamp: subtitle.maxLines || DEFAULT_SUBTITLE_STYLE.maxLines,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
                WebkitTextStroke: subtitle.textStroke
                  ? `${subtitle.textStrokeWidth || DEFAULT_SUBTITLE_STYLE.textStrokeWidth}px ${subtitle.textStrokeColor || DEFAULT_SUBTITLE_STYLE.textStrokeColor}`
                  : undefined,
                paintOrder: subtitle.textStroke ? 'stroke fill' : undefined,
              }}
            >
              {subtitle.text}
            </div>
          </div>
        ))}

        {/* Audio Activation Button */}
        {isMuted && (
          <button onClick={handleMuteToggle} className="absolute top-2 left-2 z-10 group">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/70 text-white text-xs font-medium cursor-pointer hover:bg-primary/80 hover:scale-105 transition-all duration-200 border border-white/20 hover:border-primary/50">
              <Volume2 className="w-4 h-4 group-hover:animate-pulse" />
              <span>🔊 Audio aktivieren</span>
            </div>
          </button>
        )}

        {/* Play Button Overlay */}
        {!isPlaying && (
          <button
            onClick={handlePlayPause}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
          >
            <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-8 h-8 text-black ml-1" />
            </div>
          </button>
        )}
      </div>

      {/* Controls */}
      <div className={`flex items-center ${fillContainer ? 'gap-2 py-2 shrink-0' : 'gap-3'}`}>
        <Button variant="ghost" size="icon" onClick={handlePlayPause} className="h-8 w-8">
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={handleReset} className="h-8 w-8">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground min-w-[80px]">
          {formatTime(displayTime)} / {formatTime(duration)}
        </span>
        <Slider
          value={[displayTime]}
          min={0}
          max={duration}
          step={0.1}
          onValueChange={handleSeek}
          className="flex-1"
        />
        <Button variant="ghost" size="icon" onClick={handleMuteToggle} className="h-8 w-8">
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};
