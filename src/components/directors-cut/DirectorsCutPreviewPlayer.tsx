import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
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
import { resolveTransitions, findActiveTransition as resolverFindActiveTransition, findFreezePhase } from '@/utils/transitionResolver';

const SUBTITLE_FONT_SIZES = {
  small: '16px',
  medium: '24px',
  large: '32px',
  xl: '48px',
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
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const incomingVideoRef = useRef<HTMLVideoElement>(null);
  const transitionCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

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

  useEffect(() => { setIsMuted(initialMuted); }, [initialMuted]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { originalAudioMutedRef.current = originalAudioMuted; }, [originalAudioMuted]);

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
          leadIn: freezeRT.duration * 0.05,
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
          leadIn: rt.duration * 0.05,
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
      src.volume = isMuted ? 0 : (audio.master_volume || 100) / 100;
      sourceAudioRef.current = src;
    }
    if (voiceoverUrl) {
      const vo = new Audio(voiceoverUrl);
      vo.preload = 'auto';
      vo.volume = isMuted ? 0 : 1.0;
      voiceoverAudioRef.current = vo;
    }
    if (backgroundMusicUrl) {
      const bg = new Audio(backgroundMusicUrl);
      bg.preload = 'auto';
      bg.volume = isMuted ? 0 : 0.3;
      bg.loop = true;
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
      sourceAudioRef.current.volume = (audio.master_volume || 100) / 100;
    }
  }, [audio.master_volume]);

  // ==================== VIDEO EVENT HANDLERS ====================
  const handleVideoEnded = useCallback(() => {
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
    onPlayingChange?.(false);
  }, [onPlayingChange]);

  // ==================== FRAME CAPTURE & TRANSITION RENDERER ====================
  const frameCache = useFrameCapture(videoUrl, sortedScenes);
  const frameCacheRef = useRef(frameCache);
  useEffect(() => { frameCacheRef.current = frameCache; }, [frameCache]);

  const videoFilterRef = useRef('');

  useTransitionRenderer(videoRef, incomingVideoRef, transitionCanvasRef, visualTimeRef, sortedScenes, transitions, videoFilterRef, frameCacheRef);


  // ==================== rAF PLAYBACK LOOP (VIDEO-LED) ====================
  // Track last scene index to detect scene changes (only seek on scene entry)
  const lastSceneIndexRef = useRef<number>(-1);
  // Guard: when boundary-advance triggers a seek, suppress false "non-sequential jump" detection
  // for a few frames until the decoder settles into the new scene
  const pendingSceneAdvanceRef = useRef<{ targetIndex: number; framesLeft: number } | null>(null);

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
      const video = videoRef.current;
      if (!video) { rafIdRef.current = requestAnimationFrame(tick); return; }

      // VIDEO-LED: read video.currentTime as source of truth
      const videoSourceTime = video.currentTime;

      // Reverse-map to timeline time
      const sceneInfo = findSceneBySourceTime(videoSourceTime, lastSceneIndexRef.current);
      let timelineTime: number;

      // Cache findActiveTransition ONCE per frame — using SOURCE time directly
      let cachedActiveTrans: ReturnType<typeof findActiveTransition> = null;
      cachedActiveTrans = findActiveTransition(videoSourceTime);

      if (sceneInfo) {
        timelineTime = sourceToTimelineTime(sceneInfo.scene, videoSourceTime);
        // Only clamp to scene boundaries if NO transition is active
        // During transitions, timeline time must flow past scene.end_time
        if (!cachedActiveTrans) {
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
            if (prevIndex >= 0 && sceneInfo.index !== prevIndex + 1) {
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

          // Apply playback rate for the matched scene
          const sceneRate = (sceneInfo.scene as any).playbackRate ?? 1;
          if (Math.abs(video.playbackRate - sceneRate) > 0.01) {
            video.playbackRate = sceneRate;
          }
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
        if (!cachedActiveTrans) {
          const srcStart = sceneInfo.scene.original_start_time ?? sceneInfo.scene.start_time;
          const rate = (sceneInfo.scene as any).playbackRate ?? 1;
          const srcEnd = srcStart + (sceneInfo.scene.end_time - sceneInfo.scene.start_time) * rate;

          // Use the resolver to find the effective boundary including offset
          const matchedRT = resolvedTransitions.find(rt => rt.outgoingSceneId === sceneInfo.scene.id);
          const effectiveBoundary = matchedRT ? matchedRT.tEnd : srcEnd;

          if (videoSourceTime >= effectiveBoundary - 0.02) {
            // Video reached end of scene (or end of transition window) — advance to next scene
            const nextScene = sortedScenes[sceneInfo.index + 1];
            if (nextScene) {
              const nextSourceStart = nextScene.original_start_time ?? nextScene.start_time;
              if (Math.abs(video.currentTime - nextSourceStart) > 0.3) {
                video.currentTime = nextSourceStart;
              }
              pendingSceneAdvanceRef.current = { targetIndex: sceneInfo.index + 1, framesLeft: 15 };
              const nextRate = (nextScene as any).playbackRate ?? 1;
              if (Math.abs(video.playbackRate - nextRate) > 0.01) {
                video.playbackRate = nextRate;
              }
              timelineTime = nextScene.start_time;
            }
          }
        }
      } else {
        // Fallback: no scene found, estimate timeline time
        timelineTime = videoSourceTime;
      }

      // Clamp timeline time
      timelineTime = Math.max(0, Math.min(timelineTime, duration));
      visualTimeRef.current = timelineTime;

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
        if (Math.abs(sourceAudioRef.current.currentTime - timelineTime) > 0.5) {
          sourceAudioRef.current.currentTime = timelineTime;
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
  }, [isPlaying, duration, sortedScenes, sourceTimeForScene, transitions, resolvedTransitions, findActiveTransition, handleVideoEnded]);

  // ==================== VIDEO EVENT HANDLERS ====================

  // ==================== EXTERNAL isPlaying SYNC ====================
  useEffect(() => {
    if (externalIsPlaying === undefined) return;
    const video = videoRef.current;
    if (!video) return;

    if (externalIsPlaying && !isPlaying) {
      video.play().catch(() => {});
      setIsPlaying(true);
      if (!isMuted) {
        if (!originalAudioMuted) sourceAudioRef.current?.play().catch(() => {});
        voiceoverShouldRecoverRef.current = false;
        playVoiceover();
        backgroundMusicAudioRef.current?.play().catch(() => {});
      }
    } else if (!externalIsPlaying && isPlaying) {
      video.pause();
      setIsPlaying(false);
      sourceAudioRef.current?.pause();
      voiceoverShouldRecoverRef.current = false;
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
    }
  }, [externalIsPlaying, isPlaying, isMuted, originalAudioMuted, playVoiceover]);

  // ==================== EXTERNAL TIME SYNC ====================
  useEffect(() => {
    if (isPlaying) return;
    const video = videoRef.current;
    if (!video) return;
    if (currentTime === 0 && visualTimeRef.current > 0.5) return;

    if (Math.abs(currentTime - visualTimeRef.current) > 0.5) {
      const sourceTime = timelineToSourceTime(currentTime);
      video.currentTime = sourceTime;
      visualTimeRef.current = currentTime;
      setDisplayTime(currentTime);
      if (sourceAudioRef.current) sourceAudioRef.current.currentTime = currentTime;
      if (voiceoverAudioRef.current) voiceoverAudioRef.current.currentTime = currentTime;
      if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.currentTime = currentTime;
    }
  }, [currentTime, isPlaying, timelineToSourceTime]);

  // ==================== USER CONTROLS ====================
  const startAllAudio = useCallback(() => {
    if (!originalAudioMuted) sourceAudioRef.current?.play().catch(() => {});
    voiceoverShouldRecoverRef.current = false;
    playVoiceover();
    backgroundMusicAudioRef.current?.play().catch(() => {});
  }, [originalAudioMuted, playVoiceover]);

  const stopAllAudio = useCallback(() => {
    sourceAudioRef.current?.pause();
    voiceoverShouldRecoverRef.current = false;
    voiceoverAudioRef.current?.pause();
    backgroundMusicAudioRef.current?.pause();
  }, []);

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      stopAllAudio();
      onPlayingChange?.(false);
    } else {
      if (video.ended || video.currentTime >= duration - 0.1) {
        video.currentTime = 0;
        visualTimeRef.current = 0;
        setDisplayTime(0);
        if (sourceAudioRef.current) sourceAudioRef.current.currentTime = 0;
        if (voiceoverAudioRef.current) voiceoverAudioRef.current.currentTime = 0;
        if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.currentTime = 0;
      }
      video.play().catch(() => {});
      setIsPlaying(true);
      if (!isMuted) startAllAudio();
      onPlayingChange?.(true);
    }
  }, [isPlaying, isMuted, duration, onPlayingChange, startAllAudio, stopAllAudio]);

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
      if (sourceAudioRef.current) sourceAudioRef.current.volume = (audio.master_volume || 100) / 100;
      if (voiceoverAudioRef.current) voiceoverAudioRef.current.volume = 1.0;
      if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.volume = 0.3;

      if (isPlaying) startAllAudio();
    } else {
      setIsMuted(true);
      stopAllAudio();
    }
  }, [isMuted, isPlaying, audio.master_volume, startAllAudio, stopAllAudio]);

  const handleSeek = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = value[0]; // timeline time
    const sourceTime = timelineToSourceTime(newTime);
    video.currentTime = sourceTime;
    visualTimeRef.current = newTime;
    setDisplayTime(newTime);
    onTimeUpdateRef.current?.(newTime);
    // Reset scene tracking on manual seek
    lastSceneIndexRef.current = -1;
    pendingSceneAdvanceRef.current = null;

    // No incoming video sync needed — canvas snapshots handle transitions

    if (sourceAudioRef.current) sourceAudioRef.current.currentTime = newTime;
    if (voiceoverAudioRef.current) {
      voiceoverAudioRef.current.currentTime = newTime;
      if (isPlayingRef.current && !isMutedRef.current) {
        voiceoverShouldRecoverRef.current = false;
        playVoiceover();
      }
    }
    if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.currentTime = newTime;
  }, [playVoiceover, timelineToSourceTime, findActiveTransition]);

  const handleReset = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.currentTime = 0;
    visualTimeRef.current = 0;
    setDisplayTime(0);
    setIsPlaying(false);
    stopAllAudio();
    if (sourceAudioRef.current) sourceAudioRef.current.currentTime = 0;
    if (voiceoverAudioRef.current) voiceoverAudioRef.current.currentTime = 0;
    if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.currentTime = 0;
  }, [stopAllAudio]);

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
    return sortedScenes.find(s => displayTime >= s.start_time && displayTime < s.end_time);
  }, [sortedScenes, displayTime]);

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
  useEffect(() => { videoFilterRef.current = videoFilter ?? ''; }, [videoFilter]);

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
        {/* Base (outgoing) video */}
        <video
          ref={videoRef}
          src={videoUrl}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ filter: videoFilter, zIndex: 1 }}
          muted
          playsInline
          preload="auto"
          onEnded={handleVideoEnded}
        />

        {/* Incoming (transition) video — no crossOrigin to avoid CORS */}
        <video
          ref={incomingVideoRef}
          src={videoUrl}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ zIndex: 2, display: 'none' }}
          muted
          playsInline
          preload="auto"
        />

        {/* Transition canvas — legacy fallback, hidden by default */}
        <canvas
          ref={transitionCanvasRef}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ zIndex: 3, display: 'none' }}
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
        {textOverlays.filter(o => displayTime >= o.startTime && displayTime < o.endTime).map(overlay => (
          <div
            key={overlay.id}
            className="absolute pointer-events-none z-[15]"
            style={{
              top: overlay.customPosition?.y != null ? `${overlay.customPosition.y}%` : overlay.position === 'top' ? '10%' : overlay.position === 'center' ? '50%' : '80%',
              left: overlay.customPosition?.x != null ? `${overlay.customPosition.x}%` : '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: overlay.style?.fontSize || '32px',
              fontWeight: (overlay.style as any)?.fontWeight || 'bold',
              color: overlay.style?.color || '#ffffff',
              textShadow: '2px 2px 8px rgba(0,0,0,0.8)',
              fontFamily: overlay.style?.fontFamily || 'sans-serif',
            }}
          >
            {overlay.text}
          </div>
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
