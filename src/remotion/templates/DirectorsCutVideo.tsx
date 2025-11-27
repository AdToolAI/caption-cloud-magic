import React from 'react';
import { AbsoluteFill, Video, Audio, useCurrentFrame, useVideoConfig, interpolate, Sequence } from 'remotion';
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

// Scene Schema for multi-scene support
const SceneSchema = z.object({
  id: z.string(),
  startTime: z.number(),
  endTime: z.number(),
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

// Filter CSS mappings
const FILTER_CSS: Record<string, string> = {
  cinematic: 'sepia(0.15) contrast(1.1) brightness(0.95)',
  vintage: 'sepia(0.4) contrast(0.9) brightness(1.1)',
  warm: 'sepia(0.2) saturate(1.2) brightness(1.05)',
  cool: 'saturate(0.9) hue-rotate(10deg) brightness(1.05)',
  dramatic: 'contrast(1.3) saturate(0.8) brightness(0.9)',
  vibrant: 'saturate(1.4) contrast(1.1) brightness(1.05)',
  muted: 'saturate(0.6) contrast(0.95) brightness(1.1)',
  noir: 'grayscale(0.8) contrast(1.2) brightness(0.9)',
};

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
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // Find current scene based on frame
  const getCurrentScene = () => {
    if (!scenes || scenes.length === 0) return null;
    const currentTime = frame / fps;
    return scenes.find(scene => currentTime >= scene.startTime && currentTime < scene.endTime);
  };

  // Get scene-specific effects for current frame
  const getCurrentSceneEffects = () => {
    const currentScene = getCurrentScene();
    if (!currentScene || !sceneEffects) return null;
    return sceneEffects[currentScene.id] || currentScene.effects || null;
  };

  // Calculate current speed based on keyframes with easing
  const getCurrentSpeed = () => {
    if (!speedKeyframes || speedKeyframes.length === 0) return 1;
    
    const currentTime = frame / fps;
    let speed = 1;
    
    for (let i = 0; i < speedKeyframes.length; i++) {
      const keyframe = speedKeyframes[i];
      const nextKeyframe = speedKeyframes[i + 1];
      
      if (currentTime >= keyframe.time) {
        if (nextKeyframe && currentTime < nextKeyframe.time) {
          // Interpolate between keyframes
          const progress = (currentTime - keyframe.time) / (nextKeyframe.time - keyframe.time);
          const easedProgress = applyEasing(progress, keyframe.easing || 'linear');
          speed = keyframe.speed + (nextKeyframe.speed - keyframe.speed) * easedProgress;
        } else if (!nextKeyframe) {
          speed = keyframe.speed;
        }
      }
    }
    
    return speed;
  };

  // Easing functions for speed ramping
  const applyEasing = (t: number, easing: string): number => {
    switch (easing) {
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return t * (2 - t);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      case 'bounce':
        if (t < 0.5) return 8 * t * t * t * t;
        return 1 - 8 * (--t) * t * t * t;
      default:
        return t; // linear
    }
  };

  // Build filter string with all effects (scene-specific or global)
  // FIXED: Only use numeric values - no double filters from presets
  const buildFilterString = () => {
    // Get scene-specific effects (override global if present)
    const sceneEffect = getCurrentSceneEffects();
    
    // Use scene-specific values if available, otherwise fall back to global
    // Scene effects already include filter mapping values (brightness, contrast, saturation)
    const effectiveBrightness = sceneEffect?.brightness ?? brightness;
    const effectiveContrast = sceneEffect?.contrast ?? contrast;
    const effectiveSaturation = sceneEffect?.saturation ?? saturation;
    
    // Build ONLY from numeric values - no presetCSS to avoid double filters
    let filterStr = `brightness(${effectiveBrightness / 100}) `;
    filterStr += `contrast(${effectiveContrast / 100}) `;
    filterStr += `saturate(${effectiveSaturation / 100}) `;
    
    // Temperature (approximate with sepia + hue-rotate)
    if (temperature !== 0) {
      if (temperature > 0) {
        filterStr += `sepia(${temperature / 100}) `;
      } else {
        filterStr += `hue-rotate(${temperature}deg) `;
      }
    }
    
    // NOTE: Preset filter CSS (FILTER_CSS) is NOT applied separately here
    // because scene effects already contain the numeric values from FILTER_EFFECT_MAPPING
    // This prevents double-application of filters (e.g., brightness(1.2) brightness(1.15))
    
    // Apply style transfer (these are separate effects, not duplicates)
    if (styleTransfer?.enabled && styleTransfer.style && STYLE_CSS[styleTransfer.style]) {
      filterStr += STYLE_CSS[styleTransfer.style] + ' ';
    }
    
    // Apply color grading (these are separate effects, not duplicates)
    if (colorGrading?.enabled && colorGrading.grade && GRADE_CSS[colorGrading.grade]) {
      filterStr += GRADE_CSS[colorGrading.grade] + ' ';
    }
    
    return filterStr.trim();
  };

  // Calculate transition opacity for current frame - FIXED: dynamic based on current scene
  const getCurrentTransitionOpacity = () => {
    if (!transitions || transitions.length === 0 || !scenes || scenes.length === 0) return 1;
    
    const currentTime = frame / fps;
    
    // Find which scene we're in
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const transition = transitions.find(t => t.sceneIndex === i);
      
      if (!transition || transition.type === 'none') continue;
      
      const sceneEndTime = scene.endTime;
      const transitionDuration = transition.duration || 0.5;
      const transitionStartTime = sceneEndTime - transitionDuration;
      
      // Check if we're in the transition zone for this scene
      if (currentTime >= transitionStartTime && currentTime < sceneEndTime) {
        const progress = (currentTime - transitionStartTime) / transitionDuration;
        
        // Normalize transition type (e.g., "wipe-left" → "wipe")
        const normalizedType = transition.type.split('-')[0].toLowerCase();
        
        switch (normalizedType) {
          case 'fade':
          case 'crossfade':
          case 'dissolve':
            return 1 - progress;
          case 'zoom':
            // Zoom uses scale, not opacity
            return 1;
          case 'blur':
            // Blur is handled separately
            return 1;
          case 'wipe':
          case 'push':
            // These use position, not opacity
            return 1;
          case 'flash':
            // Flash: quick white then fade
            return progress < 0.3 ? 1 - progress * 3 : 0.1 + progress * 0.9;
          case 'glitch':
            // Glitch effect handled via transform
            return 1;
          default:
            return 1 - progress;
        }
      }
    }
    
    return 1;
  };

  // Calculate transition transform for current frame
  const getCurrentTransitionTransform = () => {
    if (!transitions || transitions.length === 0 || !scenes || scenes.length === 0) return {};
    
    const currentTime = frame / fps;
    
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const transition = transitions.find(t => t.sceneIndex === i);
      
      if (!transition || transition.type === 'none') continue;
      
      const sceneEndTime = scene.endTime;
      const transitionDuration = transition.duration || 0.5;
      const transitionStartTime = sceneEndTime - transitionDuration;
      
      if (currentTime >= transitionStartTime && currentTime < sceneEndTime) {
        const progress = (currentTime - transitionStartTime) / transitionDuration;
        
        // Normalize transition type and extract direction
        const [baseType, direction] = transition.type.toLowerCase().split('-');
        
        switch (baseType) {
          case 'zoom':
            const isZoomIn = direction === 'in' || !direction;
            const scale = isZoomIn ? 1 + progress * 0.3 : 1 - progress * 0.2;
            return { transform: `scale(${Math.max(0.5, scale)})` };
          case 'blur':
            const blur = progress * 15;
            return { filter: buildFilterString() + ` blur(${blur}px)` };
          case 'wipe':
            // Support directional wipes
            if (direction === 'up') return { clipPath: `inset(${progress * 100}% 0 0 0)` };
            if (direction === 'down') return { clipPath: `inset(0 0 ${progress * 100}% 0)` };
            if (direction === 'right') return { clipPath: `inset(0 0 0 ${progress * 100}%)` };
            return { clipPath: `inset(0 ${progress * 100}% 0 0)` }; // default: left
          case 'push':
            if (direction === 'right') return { transform: `translateX(${progress * 100}%)` };
            if (direction === 'up') return { transform: `translateY(-${progress * 100}%)` };
            if (direction === 'down') return { transform: `translateY(${progress * 100}%)` };
            return { transform: `translateX(-${progress * 100}%)` }; // default: left
          case 'flash':
            // Flash white overlay handled via opacity
            return {};
          case 'glitch':
            // Random offset for glitch effect
            const offsetX = Math.sin(progress * 20) * 10;
            const offsetY = Math.cos(progress * 15) * 5;
            return { transform: `translate(${offsetX}px, ${offsetY}px)` };
          default:
            return {};
        }
      }
    }
    
    return {};
  };

  // Vignette overlay
  const vignetteStyle = vignette > 0 ? {
    background: `radial-gradient(ellipse at center, transparent 0%, transparent ${100 - vignette}%, rgba(0,0,0,${vignette / 100}) 100%)`,
  } : {};

  // Chroma key mix-blend approximation (real implementation needs WebGL)
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

      {/* Main Video with all effects */}
      <Video
        src={sourceVideoUrl}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          filter: buildFilterString(),
          opacity: getCurrentTransitionOpacity(),
          ...getCurrentTransitionTransform(),
          ...chromaKeyStyle,
        }}
        volume={masterVolume / 100}
        playbackRate={getCurrentSpeed()}
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
      {soundDesign?.enabled && soundDesign.sfxTracks?.map((sfx, index) => (
        <Sequence key={`sfx-${index}`} from={Math.floor(sfx.startTime * fps)}>
          <Audio
            src={sfx.url}
            volume={sfx.volume / 100}
            startFrom={0}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
