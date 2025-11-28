import React, { useMemo } from 'react';
import { AbsoluteFill, Video, Audio, useCurrentFrame, useVideoConfig, interpolate

 } from 'remotion';
import { z } from 'zod';

// Transition Schema
const TransitionSchema = z.object({
  type: z.enum(['none', 'fade', 'crossfade', 'slide', 'zoom', 'wipe', 'blur', 'push']),
  duration: z.number(),
  direction: z.enum(['left', 'right', 'up', 'down']).optional(),
});

// Speed Keyframe Schema
const SpeedKeyframeSchema = z.object({
  time: z.number(),
  speed: z.number(),
  easing: z.string().optional(),
});

// Scene Effects Schema
const SceneEffectsSchema = z.object({
  filter: z.string().optional(),
  brightness: z.number().optional(),
  contrast: z.number().optional(),
  saturation: z.number().optional(),
  speed: z.number().optional(),
  transition_in: z.string().optional(),
  transition_out: z.string().optional(),
});

// Scene Schema for multi-scene support with Time Remapping
const SceneSchema = z.object({
  id: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  // Time Remapping fields
  originalStartTime: z.number().optional(),
  originalEndTime: z.number().optional(),
  playbackRate: z.number().optional(), // 1.0 = normal, <1 = slow-mo, >1 = fast
  transition: TransitionSchema.optional(),
  effects: SceneEffectsSchema.optional(),
});

export const DirectorsCutVideoSchema = z.object({
  sourceVideoUrl: z.string(),
  // Visual Effects (global)
  brightness: z.number().optional(),
  contrast: z.number().optional(),
  saturation: z.number().optional(),
  sharpness: z.number().optional(),
  temperature: z.number().optional(),
  vignette: z.number().optional(),
  filter: z.string().optional(),
  // Scene-specific effects
  sceneEffects: z.record(z.string(), SceneEffectsSchema).optional(),
  // Style Transfer
  styleTransfer: z.object({
    enabled: z.boolean(),
    style: z.string().optional(),
    intensity: z.number().optional(),
  }).optional(),
  // Color Grading
  colorGrading: z.object({
    enabled: z.boolean(),
    grade: z.string().optional(),
    intensity: z.number().optional(),
  }).optional(),
  // Speed Ramping
  speedKeyframes: z.array(SpeedKeyframeSchema).optional(),
  // Chroma Key
  chromaKey: z.object({
    enabled: z.boolean(),
    color: z.string().optional(),
    tolerance: z.number().optional(),
    edgeSoftness: z.number().optional(),
    spillSuppression: z.number().optional(),
    backgroundUrl: z.string().optional(),
  }).optional(),
  // Transitions
  transitions: z.array(z.object({
    sceneIndex: z.number(),
    type: z.string(),
    duration: z.number(),
  })).optional(),
  // Scenes
  scenes: z.array(SceneSchema).optional(),
  // Audio
  masterVolume: z.number().optional(),
  noiseReduction: z.boolean().optional(),
  voiceEnhancement: z.boolean().optional(),
  voiceoverUrl: z.string().optional(),
  voiceoverVolume: z.number().optional(),
  backgroundMusicUrl: z.string().optional(),
  backgroundMusicVolume: z.number().optional(),
  // Sound Design
  soundDesign: z.object({
    enabled: z.boolean(),
    ambientUrl: z.string().optional(),
    ambientVolume: z.number().optional(),
    sfxTracks: z.array(z.object({
      url: z.string(),
      startTime: z.number(),
      volume: z.number(),
    })).optional(),
  }).optional(),
  // Upscaling
  upscaling: z.object({
    enabled: z.boolean(),
    targetResolution: z.string().optional(),
  }).optional(),
  // Frame Interpolation
  interpolation: z.object({
    enabled: z.boolean(),
    targetFps: z.number().optional(),
  }).optional(),
  // Dimensions
  targetWidth: z.number().optional(),
  targetHeight: z.number().optional(),
  // Duration
  durationInSeconds: z.number().optional(),
});

type DirectorsCutVideoProps = z.infer<typeof DirectorsCutVideoSchema>;

// Style Transfer CSS approximations
const STYLE_CSS: Record<string, string> = {
  cinematic_pro: 'contrast(1.15) saturate(0.9) brightness(0.95) sepia(0.1)',
  anime: 'saturate(1.5) contrast(1.2) brightness(1.1)',
  vintage_film: 'sepia(0.5) contrast(0.85) brightness(1.15)',
  noir_classic: 'grayscale(1) contrast(1.3) brightness(0.85)',
  neon_glow: 'saturate(1.8) contrast(1.3) brightness(1.1)',
  pastel: 'saturate(0.7) brightness(1.2) contrast(0.9)',
};

// Color Grade CSS approximations
const GRADE_CSS: Record<string, string> = {
  teal_orange: 'sepia(0.1) hue-rotate(-15deg) saturate(1.2)',
  cold_blue: 'hue-rotate(15deg) saturate(0.9) brightness(1.05)',
  warm_sunset: 'sepia(0.25) saturate(1.3) brightness(1.05)',
  forest_green: 'hue-rotate(60deg) saturate(0.8) brightness(1)',
  purple_haze: 'hue-rotate(-30deg) saturate(1.1) brightness(1.05)',
  bleach_bypass: 'contrast(1.2) saturate(0.5) brightness(1.1)',
};

export const DirectorsCutVideo: React.FC<DirectorsCutVideoProps> = ({
  sourceVideoUrl,
  brightness = 100,
  contrast = 100,
  saturation = 100,
  sharpness = 0,
  temperature = 0,
  vignette = 0,
  filter,
  sceneEffects,
  styleTransfer,
  colorGrading,
  speedKeyframes,
  chromaKey,
  transitions,
  scenes,
  masterVolume = 100,
  voiceoverUrl,
  voiceoverVolume = 100,
  backgroundMusicUrl,
  backgroundMusicVolume = 30,
  soundDesign,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeSeconds = frame / fps;

  // Find current scene index based on time
  const currentSceneIndex = useMemo(() => {
    if (!scenes || scenes.length === 0) return -1;
    return scenes.findIndex(
      (scene) => currentTimeSeconds >= scene.startTime && currentTimeSeconds < scene.endTime
    );
  }, [scenes, currentTimeSeconds]);

  const currentScene = scenes && currentSceneIndex >= 0 ? scenes[currentSceneIndex] : null;

  // Get scene-specific effects for current scene
  const currentSceneEffect = useMemo(() => {
    if (!currentScene || !sceneEffects) return null;
    return sceneEffects[currentScene.id] || currentScene.effects || null;
  }, [currentScene, sceneEffects]);

  // SCENE-BASED VIDEO TIME CALCULATION
  // Video jumps to original positions from AI analysis, audio plays linearly
  const sceneVideoStartFrame = useMemo(() => {
    if (!currentScene) return 0;
    
    // Use original start time from AI scene analysis
    const originalStart = currentScene.originalStartTime ?? currentScene.startTime;
    return Math.floor(originalStart * fps);
  }, [currentScene, fps]);

  // Calculate playback rate for current scene (time remapping)
  const scenePlaybackRate = useMemo(() => {
    if (!currentScene) return 1;
    
    // If explicit playbackRate is set, use it
    if (currentScene.playbackRate) return currentScene.playbackRate;
    
    // Otherwise calculate from duration difference
    const originalStart = currentScene.originalStartTime ?? currentScene.startTime;
    const originalEnd = currentScene.originalEndTime ?? currentScene.endTime;
    const originalDuration = originalEnd - originalStart;
    const currentDuration = currentScene.endTime - currentScene.startTime;
    
    // Avoid division by zero
    if (currentDuration <= 0) return 1;
    
    // Rate = original / current (e.g., 3s original stretched to 6s = 0.5x speed)
    return Math.max(0.25, Math.min(4, originalDuration / currentDuration));
  }, [currentScene]);

  // Calculate current speed based on keyframes
  const getCurrentSpeed = useMemo(() => {
    if (!speedKeyframes || speedKeyframes.length === 0) return 1;
    
    let speed = 1;
    for (let i = 0; i < speedKeyframes.length; i++) {
      const keyframe = speedKeyframes[i];
      const nextKeyframe = speedKeyframes[i + 1];
      
      if (currentTimeSeconds >= keyframe.time) {
        if (nextKeyframe && currentTimeSeconds < nextKeyframe.time) {
          const progress = (currentTimeSeconds - keyframe.time) / (nextKeyframe.time - keyframe.time);
          // Simple linear interpolation
          speed = keyframe.speed + (nextKeyframe.speed - keyframe.speed) * progress;
        } else if (!nextKeyframe) {
          speed = keyframe.speed;
        }
      }
    }
    return speed;
  }, [speedKeyframes, currentTimeSeconds]);

  // Build filter string based on current scene effects
  const filterString = useMemo(() => {
    const effectiveBrightness = currentSceneEffect?.brightness ?? brightness;
    const effectiveContrast = currentSceneEffect?.contrast ?? contrast;
    const effectiveSaturation = currentSceneEffect?.saturation ?? saturation;
    
    let filterStr = `brightness(${effectiveBrightness / 100}) `;
    filterStr += `contrast(${effectiveContrast / 100}) `;
    filterStr += `saturate(${effectiveSaturation / 100}) `;
    
    // Temperature
    if (temperature !== 0) {
      if (temperature > 0) {
        filterStr += `sepia(${temperature / 100}) `;
      } else {
        filterStr += `hue-rotate(${temperature}deg) `;
      }
    }
    
    // Style transfer
    if (styleTransfer?.enabled && styleTransfer.style && STYLE_CSS[styleTransfer.style]) {
      filterStr += STYLE_CSS[styleTransfer.style] + ' ';
    }
    
    // Color grading
    if (colorGrading?.enabled && colorGrading.grade && GRADE_CSS[colorGrading.grade]) {
      filterStr += GRADE_CSS[colorGrading.grade] + ' ';
    }
    
    return filterStr.trim();
  }, [currentSceneEffect, brightness, contrast, saturation, temperature, styleTransfer, colorGrading]);

  // Calculate transition effects for ALL transitions (single video with visual effects)
  const transitionEffects = useMemo(() => {
    if (!transitions || transitions.length === 0 || !scenes || scenes.length === 0) {
      return { opacity: 1, transform: '', clipPath: '', additionalFilter: '' };
    }

    let opacity = 1;
    let transform = '';
    let clipPath = '';
    let additionalFilter = '';

    // Apply OUT transition only (end of current scene going to next)
    // IN-transitions removed to prevent double-application of effects
    if (currentSceneIndex >= 0 && currentSceneIndex < scenes.length - 1) {
      const currentTransition = transitions.find(t => t.sceneIndex === currentSceneIndex);
      if (currentTransition && currentTransition.type !== 'none') {
        const sceneEndTime = scenes[currentSceneIndex].endTime;
        const transitionDuration = currentTransition.duration || 0.5;
        const transitionStartTime = sceneEndTime - transitionDuration;

        if (currentTimeSeconds >= transitionStartTime && currentTimeSeconds < sceneEndTime) {
          const progress = (currentTimeSeconds - transitionStartTime) / transitionDuration;
          const [baseType, direction = 'left'] = currentTransition.type.toLowerCase().split('-');

          switch (baseType) {
            case 'crossfade':
            case 'dissolve':
              // Brightness pulse effect - brightens in the middle, then back to normal
              const pulseOut = Math.sin(progress * Math.PI);
              additionalFilter = `brightness(${1 + pulseOut * 0.25})`;
              break;
            case 'fade':
              // Fade to black at the transition point
              opacity = interpolate(progress, [0, 0.5, 1], [1, 0.2, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
              break;
            case 'zoom':
              opacity = 1 - progress;
              transform = `scale(${1 + progress * 0.3})`;
              break;
            case 'blur':
              opacity = 1 - progress;
              additionalFilter = `blur(${progress * 15}px)`;
              break;
            case 'wipe':
              if (direction === 'left') clipPath = `inset(0 ${progress * 100}% 0 0)`;
              else if (direction === 'right') clipPath = `inset(0 0 0 ${progress * 100}%)`;
              else if (direction === 'up') clipPath = `inset(0 0 ${progress * 100}% 0)`;
              else clipPath = `inset(${progress * 100}% 0 0 0)`;
              break;
            case 'push':
            case 'slide':
              if (direction === 'left') transform = `translateX(-${progress * 100}%)`;
              else if (direction === 'right') transform = `translateX(${progress * 100}%)`;
              else if (direction === 'up') transform = `translateY(-${progress * 100}%)`;
              else transform = `translateY(${progress * 100}%)`;
              break;
          }
        }
      }
    }

    return { opacity, transform, clipPath, additionalFilter };
  }, [transitions, scenes, currentSceneIndex, currentTimeSeconds]);

  // Final combined filter
  const finalFilter = useMemo(() => {
    if (transitionEffects.additionalFilter) {
      return `${filterString} ${transitionEffects.additionalFilter}`;
    }
    return filterString;
  }, [filterString, transitionEffects.additionalFilter]);

  // Vignette style
  const vignetteStyle = vignette > 0 ? {
    background: `radial-gradient(ellipse at center, transparent 0%, transparent ${100 - vignette}%, rgba(0,0,0,${vignette / 100}) 100%)`,
  } : {};

  // Chroma key style
  const chromaKeyStyle = chromaKey?.enabled ? {
    mixBlendMode: 'multiply' as const,
  } : {};

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Chroma Key Background */}
      {chromaKey?.enabled && chromaKey.backgroundUrl && (
        <AbsoluteFill>
          <img
            src={chromaKey.backgroundUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </AbsoluteFill>
      )}

      {/* VIDEO - Scene-based (jumps to original positions from AI analysis) */}
      {/* Audio is MUTED here - separate linear Audio track handles sound */}
      <AbsoluteFill>
        <Video
          key={`video-scene-${currentSceneIndex}`}
          src={sourceVideoUrl}
          startFrom={sceneVideoStartFrame}
          playbackRate={scenePlaybackRate}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: finalFilter,
            opacity: transitionEffects.opacity,
            transform: transitionEffects.transform || undefined,
            clipPath: transitionEffects.clipPath || undefined,
            ...chromaKeyStyle,
          }}
          volume={0}
        />
      </AbsoluteFill>

      {/* AUDIO - Linear playback (runs continuously undisturbed) */}
      {/* Original video audio as separate track */}
      <Audio
        src={sourceVideoUrl}
        volume={masterVolume / 100}
        startFrom={0}
      />

      {/* Vignette Overlay */}
      {vignette > 0 && (
        <AbsoluteFill style={vignetteStyle} />
      )}

      {/* Voiceover Audio */}
      {voiceoverUrl && (
        <Audio
          src={voiceoverUrl}
          volume={(voiceoverVolume || 100) / 100}
          startFrom={0}
        />
      )}

      {/* Background Music */}
      {backgroundMusicUrl && (
        <Audio
          src={backgroundMusicUrl}
          volume={(backgroundMusicVolume || 30) / 100}
          loop
          startFrom={0}
        />
      )}

      {/* Sound Design - Ambient */}
      {soundDesign?.enabled && soundDesign.ambientUrl && (
        <Audio
          src={soundDesign.ambientUrl}
          volume={(soundDesign.ambientVolume || 20) / 100}
          loop
          startFrom={0}
        />
      )}

      {/* Sound Design - SFX Tracks */}
      {soundDesign?.enabled && soundDesign.sfxTracks?.map((sfx, index) => {
        const sfxStartFrame = Math.floor(sfx.startTime * fps);
        // Only render if we're past the start time
        if (frame >= sfxStartFrame) {
          return (
            <Audio
              key={`sfx-${index}`}
              src={sfx.url}
              volume={sfx.volume / 100}
              startFrom={0}
            />
          );
        }
        return null;
      })}
    </AbsoluteFill>
  );
};
