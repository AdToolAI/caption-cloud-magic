import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, VolumeX, Volume2, Maximize2, RotateCcw } from 'lucide-react';
import { GlobalEffects, AudioEnhancements, SceneEffects, SceneAnalysis, TransitionAssignment, TextOverlay, AVAILABLE_FILTERS } from '@/types/directors-cut';
import type { KenBurnsKeyframe } from './features/KenBurnsEffect';
import { SubtitleTrack, DEFAULT_SUBTITLE_STYLE } from '@/types/timeline';
import { cn } from '@/lib/utils';
import { useTransitionRenderer } from './preview/useTransitionRenderer';
import { NativePreviewEffects } from './preview/NativePreviewEffects';

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

  // Helper: find active transition at a given timeline time (with overlap clamping)
  const findActiveTransition = useCallback((timelineTime: number) => {
    let prevEnd = -Infinity;
    for (let i = 0; i < sortedScenes.length - 1; i++) {
      const scene = sortedScenes[i];
      const t = transitions.find(tr => tr.sceneId === scene.id);
      if (!t || t.transitionType === 'none') continue;
      const tDuration = Math.max(0.8, t.duration || 1.2);
      const leadIn = tDuration * 0.3;
      const leadOut = tDuration * 0.7;
      const boundary = t.anchorTime ?? scene.end_time;
      // Clamp start so transitions never overlap
      const tStart = Math.max(boundary - leadIn, prevEnd);
      const tEnd = boundary + leadOut;
      const effectiveDuration = tEnd - tStart;
      prevEnd = tEnd;
      if (timelineTime >= tStart && timelineTime < tEnd) {
        return {
          outgoingScene: scene,
          incomingScene: sortedScenes[i + 1],
          boundary,
          half,
          tDuration: effectiveDuration,
          progress: (timelineTime - tStart) / effectiveDuration,
        };
      }
    }
    return null;
  }, [sortedScenes, transitions]);

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

  // ==================== TRANSITION RENDERER (zero re-renders) ====================
  const videoFilterRef = useRef('');
  useTransitionRenderer(videoRef, incomingVideoRef, visualTimeRef, sortedScenes, transitions, videoFilterRef);


  // ==================== rAF PLAYBACK LOOP (TIMELINE-LED) ====================
  useEffect(() => {
    if (!isPlaying) {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      return;
    }

    let lastTimestamp: number | null = null;
    let lastDisplayUpdate = 0;
    let lastParentUpdate = 0;

    const tick = (timestamp: number) => {
      const video = videoRef.current;
      if (!video) { rafIdRef.current = requestAnimationFrame(tick); return; }

      // Timeline-led: advance timeline time by wall-clock delta
      if (lastTimestamp !== null) {
        const delta = (timestamp - lastTimestamp) / 1000;
        visualTimeRef.current = Math.min(visualTimeRef.current + delta, duration);
      }
      lastTimestamp = timestamp;

      const timelineTime = visualTimeRef.current;

      // Check if we're in a transition window
      const activeTrans = findActiveTransition(timelineTime);
      const incoming = incomingVideoRef.current;

      if (activeTrans) {
        // DURING TRANSITION: base video stays on OUTGOING scene, incoming shows NEXT scene
        const { outgoingScene, incomingScene, boundary, progress, tDuration } = activeTrans;

        // Base video: keep on outgoing scene (clamp time to not exceed boundary)
        const outgoingTime = sourceTimeForScene(outgoingScene, Math.min(timelineTime, outgoingScene.end_time));
        if (Math.abs(video.currentTime - outgoingTime) > 0.15) {
          video.currentTime = outgoingTime;
        }
        const outRate = (outgoingScene as any).playbackRate ?? 1;
        if (Math.abs(video.playbackRate - outRate) > 0.01) {
          video.playbackRate = outRate;
        }

        // Incoming video: use sourceTimeForScene for seamless handoff to base video
        if (incoming) {
          const incomingSourceStart = incomingScene.original_start_time ?? incomingScene.start_time;
          const inRate = (incomingScene as any).playbackRate ?? 1;
          // Use sourceTimeForScene when timeline is past incoming scene start,
          // otherwise clamp to source start to avoid negative offsets
          const expectedIncoming = timelineTime >= incomingScene.start_time
            ? sourceTimeForScene(incomingScene, timelineTime)
            : incomingSourceStart;
          if (Math.abs(incoming.currentTime - expectedIncoming) > 0.15) {
            incoming.currentTime = expectedIncoming;
          }
          if (incoming.paused) {
            incoming.play().catch(() => {});
          }
          if (Math.abs(incoming.playbackRate - inRate) > 0.01) {
            incoming.playbackRate = inRate;
          }
        }
      } else {
        // PRE-SYNC: 200ms before next transition, pre-seek incoming video
        if (incoming) {
          const nextTrans = findActiveTransition(timelineTime + 0.2);
          if (nextTrans && incoming.paused) {
            const incomingSourceStart = nextTrans.incomingScene.original_start_time ?? nextTrans.incomingScene.start_time;
            const expectedIncoming = timelineTime + 0.2 >= nextTrans.incomingScene.start_time
              ? sourceTimeForScene(nextTrans.incomingScene, timelineTime + 0.2)
              : incomingSourceStart;
            if (Math.abs(incoming.currentTime - expectedIncoming) > 0.3) {
              incoming.currentTime = expectedIncoming;
            }
          }
        }

        // NOT in transition: normal scene sync
        const activeScene = sortedScenes.find(s => timelineTime >= s.start_time && timelineTime < s.end_time);
        if (activeScene) {
          const expectedSource = sourceTimeForScene(activeScene, timelineTime);
          if (Math.abs(video.currentTime - expectedSource) > 0.15) {
            video.currentTime = expectedSource;
          }
          const sceneRate = (activeScene as any).playbackRate ?? 1;
          if (Math.abs(video.playbackRate - sceneRate) > 0.01) {
            video.playbackRate = sceneRate;
          }
        }

        // Pause incoming video when not in transition
        if (incoming && !incoming.paused) {
          incoming.pause();
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

      // Drift correction for source audio
      if (sourceAudioRef.current && !sourceAudioRef.current.paused) {
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
  }, [isPlaying, duration, sortedScenes, sourceTimeForScene, transitions, findActiveTransition, handleVideoEnded]);

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

    // Sync incoming video if seeking into a transition window
    const incoming = incomingVideoRef.current;
    const activeTrans = findActiveTransition(newTime);
    if (incoming && activeTrans) {
      const incomingSourceStart = activeTrans.incomingScene.original_start_time ?? activeTrans.incomingScene.start_time;
      // Use sourceTimeForScene for consistent position with base video handoff
      incoming.currentTime = newTime >= activeTrans.incomingScene.start_time
        ? sourceTimeForScene(activeTrans.incomingScene, newTime)
        : incomingSourceStart;
    }

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
  const videoFilter = useMemo(() => {
    const filters: string[] = [];
    if (effects.brightness !== undefined && effects.brightness !== 100) {
      filters.push(`brightness(${effects.brightness / 100})`);
    }
    if (effects.contrast !== undefined && effects.contrast !== 100) {
      filters.push(`contrast(${effects.contrast / 100})`);
    }
    if (effects.saturation !== undefined && effects.saturation !== 100) {
      filters.push(`saturate(${effects.saturation / 100})`);
    }

    // Apply scene-specific or global filter (cinematic, vintage, etc.)
    const currentScene = sortedScenes.find(s => displayTime >= s.start_time && displayTime < s.end_time);
    const sceneFilter = currentScene && sceneEffects?.[currentScene.id]?.filter;
    const activeFilterId = sceneFilter || effects.filter;

    if (activeFilterId && activeFilterId !== 'none') {
      const filterDef = AVAILABLE_FILTERS.find(f => f.id === activeFilterId);
      if (filterDef?.preview) {
        filters.push(filterDef.preview);
      }
    }

    return filters.length > 0 ? filters.join(' ') : undefined;
  }, [effects.brightness, effects.contrast, effects.saturation, effects.filter, sceneEffects, sortedScenes, displayTime]);

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

        {/* Incoming (next scene) video — only visible during transitions */}
        <video
          ref={incomingVideoRef}
          src={videoUrl}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ filter: videoFilter, zIndex: 2, display: 'none' }}
          muted
          playsInline
          preload="auto"
        />

        {/* Lightweight effect overlays (color grading, vignette, etc.) */}
        <NativePreviewEffects
          effects={effects}
          colorGrading={colorGrading}
          sceneColorGrading={sceneColorGrading}
          scenes={sortedScenes}
          currentTime={displayTime}
        />

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
