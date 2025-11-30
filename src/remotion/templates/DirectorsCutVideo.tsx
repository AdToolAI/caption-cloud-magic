import React, { useMemo, useEffect, useRef } from 'react';
import { AbsoluteFill, Video, Audio, Sequence, useCurrentFrame, useVideoConfig, interpolate, Img } from 'remotion';
import { z } from 'zod';
import { SVGFilters, SVG_FILTER_IDS, isSVGFilter, VHSScanlines, VignetteOverlay } from '../components/SVGFilters';
import { TextOverlayRenderer, TextOverlayProps } from '../components/TextOverlayRenderer';

// Text Overlay Schema
const TextOverlayStyleSchema = z.object({
  fontSize: z.enum(['sm', 'md', 'lg', 'xl']),
  color: z.string(),
  backgroundColor: z.string(),
  shadow: z.boolean(),
  fontFamily: z.string(),
});

const TextOverlaySchema = z.object({
  id: z.string(),
  text: z.string(),
  animation: z.enum(['fadeIn', 'scaleUp', 'bounce', 'typewriter', 'highlight', 'glitch']),
  position: z.enum(['top', 'center', 'bottom', 'bottomLeft', 'bottomRight', 'topLeft', 'topRight', 'custom']),
  customPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  startTime: z.number(),
  endTime: z.number().nullable(),
  style: TextOverlayStyleSchema,
});

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
  sharpness: z.number().optional(),
  temperature: z.number().optional(),
  vignette: z.number().optional(),
  speed: z.number().optional(),
  transition_in: z.string().optional(),
  transition_out: z.string().optional(),
});

// Additional Media Schema for added videos/images
const AdditionalMediaSchema = z.object({
  type: z.enum(['video', 'image']),
  url: z.string(),
  duration: z.number(),
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
  // Additional Media Support
  additionalMedia: AdditionalMediaSchema.optional(),
  isFromOriginalVideo: z.boolean().optional(),
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
  // Text Overlays
  textOverlays: z.array(TextOverlaySchema).optional(),
});

type DirectorsCutVideoProps = z.infer<typeof DirectorsCutVideoSchema>;

// SVG Sharpness Filter Component
const SharpnessFilter: React.FC<{ intensity: number }> = ({ intensity }) => {
  if (intensity <= 0) return null;
  const k = intensity / 100; // 0 to 1
  // Unsharp mask kernel approximation
  const kernel = `0 ${-k} 0 ${-k} ${1 + 4 * k} ${-k} 0 ${-k} 0`;
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        <filter id="sharpen-filter">
          <feConvolveMatrix
            order="3"
            kernelMatrix={kernel}
            preserveAlpha="true"
          />
        </filter>
      </defs>
    </svg>
  );
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

// Color Grade CSS approximations - IDs müssen exakt mit UI übereinstimmen (Bindestrich-Format)
const GRADE_CSS: Record<string, string> = {
  // Primäre IDs (Bindestrich-Format wie in AIColorGrading.tsx)
  'teal-orange': 'sepia(0.15) hue-rotate(-15deg) saturate(1.25) contrast(1.1)',
  'moody-blue': 'hue-rotate(200deg) saturate(0.85) brightness(0.92) contrast(1.18)',
  'warm-sunset': 'sepia(0.35) saturate(1.4) brightness(1.08) contrast(1.05)',
  'cold-steel': 'hue-rotate(195deg) saturate(0.7) brightness(1.05) contrast(1.15)',
  'forest-green': 'hue-rotate(75deg) saturate(0.85) brightness(1.02) contrast(1.08)',
  'rose-gold': 'sepia(0.22) hue-rotate(-8deg) saturate(1.15) brightness(1.06)',
  // Legacy IDs (Unterstrich-Format für Abwärtskompatibilität)
  teal_orange: 'sepia(0.15) hue-rotate(-15deg) saturate(1.25) contrast(1.1)',
  cold_blue: 'hue-rotate(195deg) saturate(0.7) brightness(1.05) contrast(1.15)',
  warm_sunset: 'sepia(0.35) saturate(1.4) brightness(1.08) contrast(1.05)',
  forest_green: 'hue-rotate(75deg) saturate(0.85) brightness(1.02) contrast(1.08)',
  purple_haze: 'hue-rotate(-30deg) saturate(1.1) brightness(1.05)',
  bleach_bypass: 'contrast(1.2) saturate(0.5) brightness(1.1)',
};

// Filter/LUT CSS - Basic filters only, creative filters use SVG
const FILTER_CSS: Record<string, string> = {
  // Basic filters (CSS-based for performance)
  cinematic: 'saturate(1.35) contrast(1.3) brightness(0.95)',
  vintage: 'sepia(0.4) contrast(1.35) brightness(0.88)',
  noir: 'grayscale(1) contrast(1.6) brightness(0.9)',
  warm: 'sepia(0.35) saturate(1.45) brightness(1.05)',
  cool: 'hue-rotate(-40deg) saturate(0.8) brightness(0.96)',
  vibrant: 'saturate(1.8) contrast(1.25) brightness(1.05)',
  muted: 'saturate(0.45) brightness(1.15) contrast(0.88)',
  highkey: 'brightness(1.45) contrast(0.75) saturate(0.9)',
  lowkey: 'brightness(0.65) contrast(1.45) saturate(0.85)',
};

// Scene Video Component - renders inside a Sequence with local frame
const SceneVideo: React.FC<{
  sourceVideoUrl: string;
  scene: z.infer<typeof SceneSchema>;
  sceneIndex: number;
  totalScenes: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  temperature: number;
  vignette: number;
  globalFilter?: string;
  styleTransfer?: { enabled?: boolean; style?: string; intensity?: number };
  colorGrading?: { enabled?: boolean; grade?: string; intensity?: number };
  sceneEffects?: Record<string, z.infer<typeof SceneEffectsSchema>>;
  transitions?: Array<{ sceneIndex?: number; type?: string; duration?: number }>;
  chromaKey?: { enabled?: boolean; color?: string; tolerance?: number; edgeSoftness?: number; spillSuppression?: number; backgroundUrl?: string };
  sceneDurationFrames: number;
}> = ({
  sourceVideoUrl,
  scene,
  sceneIndex,
  totalScenes,
  brightness,
  contrast,
  saturation,
  sharpness,
  temperature,
  vignette,
  globalFilter,
  styleTransfer,
  colorGrading,
  sceneEffects,
  transitions,
  chromaKey,
  sceneDurationFrames,
}) => {
  const localFrame = useCurrentFrame(); // Local frame within this Sequence (0 to sceneDurationFrames)
  const { fps } = useVideoConfig();

  // Original video position for this scene
  const originalStart = scene.originalStartTime ?? scene.startTime;
  const sourceStartFrame = Math.floor(originalStart * fps);
  const playbackRate = scene.playbackRate ?? 1;

  // Get scene-specific effects
  const currentSceneEffect = sceneEffects?.[scene.id] || scene.effects || null;

  // Calculate effective values (scene-specific or global fallback)
  const effectiveBrightness = currentSceneEffect?.brightness ?? brightness;
  const effectiveContrast = currentSceneEffect?.contrast ?? contrast;
  const effectiveSaturation = currentSceneEffect?.saturation ?? saturation;
  const effectiveSharpness = currentSceneEffect?.sharpness ?? sharpness;
  const effectiveTemperature = currentSceneEffect?.temperature ?? temperature;
  const effectiveVignette = currentSceneEffect?.vignette ?? vignette;

  // Determine if current filter is SVG-based
  const effectiveFilter = currentSceneEffect?.filter ?? globalFilter;
  const usesSVGFilter = effectiveFilter ? isSVGFilter(effectiveFilter) : false;

  // Build filter string
  const filterString = useMemo(() => {
    let filterStr = `brightness(${effectiveBrightness / 100}) `;
    filterStr += `contrast(${effectiveContrast / 100}) `;
    filterStr += `saturate(${effectiveSaturation / 100}) `;
    
    // Temperature - verstärkte Warm/Kalt-Effekte (now using effectiveTemperature)
    if (effectiveTemperature !== 0) {
      if (effectiveTemperature > 0) {
        // Warm: Orange/Gelb-Töne mit sepia + saturate + brightness
        const warmth = effectiveTemperature / 50;
        filterStr += `sepia(${Math.min(0.5, warmth * 0.3)}) saturate(${1 + warmth * 0.3}) brightness(${1 + warmth * 0.05}) `;
      } else {
        // Kalt: Blau-Töne mit hue-rotate + saturate
        const coldness = Math.abs(effectiveTemperature) / 50;
        filterStr += `hue-rotate(${effectiveTemperature * 1.5}deg) saturate(${1 + coldness * 0.2}) brightness(${1 + coldness * 0.02}) `;
      }
    }
    
    // Sharpness via SVG filter (now using effectiveSharpness)
    if (effectiveSharpness > 0) {
      filterStr += `url(#sharpen-filter) `;
    }
    
    // Apply LUT/Filter (scene-specific or global)
    // Check if it's an SVG-based creative filter
    if (effectiveFilter && isSVGFilter(effectiveFilter)) {
      // Use SVG filter URL for transformative effects
      filterStr += SVG_FILTER_IDS[effectiveFilter] + ' ';
    } else if (effectiveFilter && FILTER_CSS[effectiveFilter]) {
      // Use CSS filter for basic filters
      filterStr += FILTER_CSS[effectiveFilter] + ' ';
    }
    
    if (styleTransfer?.enabled && styleTransfer.style && STYLE_CSS[styleTransfer.style]) {
      filterStr += STYLE_CSS[styleTransfer.style] + ' ';
    }
    
    if (colorGrading?.enabled && colorGrading.grade && GRADE_CSS[colorGrading.grade]) {
      // Intensity skaliert die Stärke des Grading-Effekts (0.0 - 1.0)
      const gradeIntensity = colorGrading.intensity ?? 0.7;
      const gradeFilter = GRADE_CSS[colorGrading.grade];
      // Bei voller Intensität den vollen Filter anwenden, sonst abgeschwächt via opacity-blend Workaround
      if (gradeIntensity >= 0.9) {
        filterStr += gradeFilter + ' ';
      } else if (gradeIntensity > 0) {
        // Skaliere die Filter-Werte proportional zur Intensität
        filterStr += gradeFilter + ' ';
        // Zusätzlich Opacity-Adjustment für feinere Kontrolle
        filterStr += `opacity(${0.3 + gradeIntensity * 0.7}) `;
      }
    }
    
    return filterStr.trim();
  }, [effectiveBrightness, effectiveContrast, effectiveSaturation, effectiveTemperature, effectiveSharpness, effectiveFilter, styleTransfer, colorGrading]);

  // Check if VHS filter needs scanlines overlay
  const needsVHSScanlines = effectiveFilter === 'retro_vhs';

  // Vignette style for this scene
  const sceneVignetteStyle = useMemo(() => {
    if (effectiveVignette <= 0) return null;
    const opacity = effectiveVignette / 100;
    const size = Math.max(30, 70 - effectiveVignette * 0.4);
    return {
      background: `radial-gradient(circle, transparent ${size}%, rgba(0,0,0,${opacity}) 100%)`,
      pointerEvents: 'none' as const,
      zIndex: 10,
    };
  }, [effectiveVignette]);

  // Calculate transition effects (OUT transition only at end of scene)
  const transitionEffects = useMemo(() => {
    let opacity = 1;
    let transform = '';
    let clipPath = '';
    let additionalFilter = '';

    // Only apply OUT transition if not the last scene
    if (sceneIndex < totalScenes - 1) {
      const currentTransition = transitions?.find(t => t.sceneIndex === sceneIndex);
      if (currentTransition && currentTransition.type && currentTransition.type !== 'none') {
        const transitionDurationFrames = Math.floor((currentTransition.duration || 0.5) * fps);
        const transitionStartFrame = sceneDurationFrames - transitionDurationFrames;

        if (localFrame >= transitionStartFrame) {
          const progress = (localFrame - transitionStartFrame) / transitionDurationFrames;
          const [baseType, direction = 'left'] = currentTransition.type.toLowerCase().split('-');

          switch (baseType) {
            case 'crossfade':
            case 'dissolve':
              const pulseOut = Math.sin(progress * Math.PI);
              additionalFilter = `brightness(${1 + pulseOut * 0.25})`;
              break;
            case 'fade':
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
  }, [transitions, sceneIndex, totalScenes, localFrame, sceneDurationFrames, fps]);

  const finalFilter = transitionEffects.additionalFilter 
    ? `${filterString} ${transitionEffects.additionalFilter}` 
    : filterString;

  const chromaKeyStyle = chromaKey?.enabled ? { mixBlendMode: 'multiply' as const } : {};

  // Debug log on mount
  useEffect(() => {
    console.log(`[SceneVideo] Scene ${scene.id} mounted: startFrom=${sourceStartFrame} frames (${originalStart.toFixed(2)}s), rate=${playbackRate}, duration=${sceneDurationFrames} frames`);
  }, []);

  // Determine if this scene uses additional media (video or image)
  const hasAdditionalMedia = scene.additionalMedia && scene.isFromOriginalVideo === false;
  const isImage = hasAdditionalMedia && scene.additionalMedia?.type === 'image';
  const mediaUrl = hasAdditionalMedia && scene.additionalMedia?.url ? scene.additionalMedia.url : sourceVideoUrl;

  return (
    <>
      {isImage ? (
        // Render image for additionalMedia type 'image'
        <Img
          src={scene.additionalMedia!.url}
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
        />
      ) : (
        // Render video (original source or additionalMedia video)
        <Video
          src={mediaUrl}
          startFrom={hasAdditionalMedia ? 0 : sourceStartFrame}
          playbackRate={playbackRate}
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
      )}
      {/* VHS Scanlines Overlay for retro_vhs filter */}
      {needsVHSScanlines && <VHSScanlines intensity={0.25} />}
      {/* Scene-specific Vignette Overlay */}
      {sceneVignetteStyle && <AbsoluteFill style={sceneVignetteStyle} />}
    </>
  );
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
  textOverlays = [],
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const currentTimeSeconds = frame / fps;

  // DEBUG: Log received effect props
  useEffect(() => {
    console.log('[DirectorsCutVideo] ========== EFFECT PROPS RECEIVED ==========');
    console.log('[DirectorsCutVideo] brightness:', brightness);
    console.log('[DirectorsCutVideo] contrast:', contrast);
    console.log('[DirectorsCutVideo] saturation:', saturation);
    console.log('[DirectorsCutVideo] sharpness:', sharpness);
    console.log('[DirectorsCutVideo] temperature:', temperature);
    console.log('[DirectorsCutVideo] vignette:', vignette);
    console.log('[DirectorsCutVideo] =============================================');
  }, [brightness, contrast, saturation, sharpness, temperature, vignette]);

  // Sort scenes by startTime
  const sortedScenes = useMemo(() => {
    if (!scenes || scenes.length === 0) return [];
    return [...scenes].sort((a, b) => a.startTime - b.startTime);
  }, [scenes]);

  // Debug log on mount
  useEffect(() => {
    console.log('[DirectorsCutVideo] ========== SEQUENCE-BASED RENDERING ==========');
    console.log('[DirectorsCutVideo] Total scenes:', sortedScenes.length);
    sortedScenes.forEach((s, i) => {
      const startFrame = Math.floor(s.startTime * fps);
      const endFrame = Math.floor(s.endTime * fps);
      const durationFrames = endFrame - startFrame;
      const originalStart = s.originalStartTime ?? s.startTime;
      console.log(`[DirectorsCutVideo] Scene ${i}: id=${s.id}`);
      console.log(`  Timeline: ${s.startTime.toFixed(2)}-${s.endTime.toFixed(2)}s (frames ${startFrame}-${endFrame}, ${durationFrames} frames)`);
      console.log(`  Original: ${originalStart.toFixed(2)}s → startFrom=${Math.floor(originalStart * fps)} frames`);
      console.log(`  PlaybackRate: ${s.playbackRate ?? 1}`);
    });
    console.log('[DirectorsCutVideo] ================================================');
  }, [sortedScenes, fps]);

  // Vignette style - korrigierte Formel für sichtbaren Effekt
  const vignetteStyle = vignette > 0 ? {
    background: `radial-gradient(ellipse at center, transparent 0%, transparent ${Math.max(0, 50 - vignette * 0.5)}%, rgba(0,0,0,${Math.min(1, vignette / 50)}) 100%)`,
  } : {};

  // If no scenes, render single video with global effects
  if (sortedScenes.length === 0) {
    // Build filter string for fallback
    let filterStr = `brightness(${brightness / 100}) `;
    filterStr += `contrast(${contrast / 100}) `;
    filterStr += `saturate(${saturation / 100}) `;
    // Temperature - verstärkte Warm/Kalt-Effekte
    if (temperature !== 0) {
      if (temperature > 0) {
        const warmth = temperature / 50;
        filterStr += `sepia(${Math.min(0.5, warmth * 0.3)}) saturate(${1 + warmth * 0.3}) brightness(${1 + warmth * 0.05}) `;
      } else {
        const coldness = Math.abs(temperature) / 50;
        filterStr += `hue-rotate(${temperature * 1.5}deg) saturate(${1 + coldness * 0.2}) brightness(${1 + coldness * 0.02}) `;
      }
    }
    // Sharpness via SVG filter
    if (sharpness > 0) {
      filterStr += `url(#sharpen-filter) `;
    }
    // Apply LUT/Filter - check for SVG filters first
    if (filter && isSVGFilter(filter)) {
      filterStr += SVG_FILTER_IDS[filter] + ' ';
    } else if (filter && FILTER_CSS[filter]) {
      filterStr += FILTER_CSS[filter] + ' ';
    }
    if (styleTransfer?.enabled && styleTransfer.style && STYLE_CSS[styleTransfer.style]) {
      filterStr += STYLE_CSS[styleTransfer.style] + ' ';
    }
    if (colorGrading?.enabled && colorGrading.grade && GRADE_CSS[colorGrading.grade]) {
      filterStr += GRADE_CSS[colorGrading.grade] + ' ';
    }

    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        {/* SVG Filter Definitions */}
        <SVGFilters />
        <SharpnessFilter intensity={sharpness} />
        <Video
          src={sourceVideoUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: filterStr.trim(),
          }}
          volume={0}
        />
        {/* VHS Scanlines for retro_vhs filter */}
        {filter === 'retro_vhs' && <VHSScanlines intensity={0.25} />}
        <Audio src={sourceVideoUrl} volume={masterVolume / 100} startFrom={0} />
        {vignette > 0 && <AbsoluteFill style={{ ...vignetteStyle, pointerEvents: 'none', zIndex: 10 }} />}
        {voiceoverUrl && <Audio src={voiceoverUrl} volume={(voiceoverVolume || 100) / 100} startFrom={0} />}
        {backgroundMusicUrl && <Audio src={backgroundMusicUrl} volume={(backgroundMusicVolume || 30) / 100} loop />}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* SVG Filter Definitions for all creative filters */}
      <SVGFilters />
      
      {/* SVG Sharpness Filter */}
      <SharpnessFilter intensity={sharpness} />
      
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

      {/* SCENES - Each scene is a Sequence with its own Video */}
      {sortedScenes.map((scene, idx) => {
        const sceneStartFrame = Math.floor(scene.startTime * fps);
        const sceneEndFrame = Math.floor(scene.endTime * fps);
        const sceneDurationFrames = Math.max(1, sceneEndFrame - sceneStartFrame);

        return (
          <Sequence
            key={scene.id}
            from={sceneStartFrame}
            durationInFrames={sceneDurationFrames}
          >
            <AbsoluteFill>
              <SceneVideo
                sourceVideoUrl={sourceVideoUrl}
                scene={scene}
                sceneIndex={idx}
                totalScenes={sortedScenes.length}
                brightness={brightness}
                contrast={contrast}
                saturation={saturation}
                sharpness={sharpness}
                temperature={temperature}
                vignette={vignette}
                globalFilter={filter}
                styleTransfer={styleTransfer}
                colorGrading={colorGrading}
                sceneEffects={sceneEffects}
                transitions={transitions}
                chromaKey={chromaKey}
                sceneDurationFrames={sceneDurationFrames}
              />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* AUDIO - Linear playback (runs continuously undisturbed) */}
      <Audio
        src={sourceVideoUrl}
        volume={masterVolume / 100}
        startFrom={0}
        pauseWhenBuffering
      />

      {/* Vignette Overlay */}
      {vignette > 0 && (
        <AbsoluteFill style={{ ...vignetteStyle, pointerEvents: 'none', zIndex: 10 }} />
      )}

      {/* Voiceover Audio */}
      {voiceoverUrl && (
        <Audio
          src={voiceoverUrl}
          volume={(voiceoverVolume || 100) / 100}
          startFrom={0}
          pauseWhenBuffering
        />
      )}

      {/* Background Music */}
      {backgroundMusicUrl && (
        <Audio
          src={backgroundMusicUrl}
          volume={(backgroundMusicVolume || 30) / 100}
          loop
          pauseWhenBuffering
        />
      )}

      {/* Sound Design Audio */}
      {soundDesign?.enabled && soundDesign.ambientUrl && (
        <Audio
          src={soundDesign.ambientUrl}
          volume={(soundDesign.ambientVolume || 50) / 100}
          loop
          pauseWhenBuffering
        />
      )}

      {soundDesign?.enabled && soundDesign.sfxTracks?.map((sfx, idx) => (
        <Sequence key={`sfx-${idx}`} from={Math.floor(sfx.startTime * fps)}>
          <Audio
            src={sfx.url}
            volume={sfx.volume / 100}
            pauseWhenBuffering
          />
        </Sequence>
      ))}

      {/* Text Overlays */}
      {textOverlays.map((overlay) => {
        const startFrame = Math.floor(overlay.startTime * fps);
        const endFrame = overlay.endTime 
          ? Math.floor(overlay.endTime * fps) 
          : durationInFrames;
        const overlayDuration = endFrame - startFrame;
        
        return (
          <Sequence
            key={overlay.id}
            from={startFrame}
            durationInFrames={overlayDuration}
          >
            <TextOverlayRenderer overlay={overlay as TextOverlayProps} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
