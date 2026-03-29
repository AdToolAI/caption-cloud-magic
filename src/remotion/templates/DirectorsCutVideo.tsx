import React, { useMemo, useEffect, useRef } from 'react';
import { AbsoluteFill, Video, Audio, Sequence, useCurrentFrame, useVideoConfig, Img, delayRender, continueRender, staticFile } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { resolveTransitions, findActiveTransition } from '../../utils/transitionResolver';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { safeInterpolate as interpolate, safeDuration } from '../utils/safeInterpolate';
import { z } from 'zod';
import { SVGFilters, SVG_FILTER_IDS, isSVGFilter, VHSScanlines, VignetteOverlay } from '../components/SVGFilters';
import { TextOverlayRenderer, TextOverlayProps } from '../components/TextOverlayRenderer';

// Font: Inter loaded via native FontFace API
const fontFamily = 'Inter';

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
  position: z.enum(['top', 'center', 'bottom', 'bottomLeft', 'bottomRight', 'topLeft', 'topRight', 'centerLeft', 'centerRight', 'custom']),
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
  sceneId: z.string().optional(), // Scene-specific or global
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

// Subtitle Clip Schema
const SubtitleClipSchema = z.object({
  id: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
  position: z.enum(['top', 'center', 'bottom']).optional(),
  fontSize: z.enum(['small', 'medium', 'large', 'xl']).optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  fontFamily: z.string().optional(),
});

// SubtitleTrack Schema
const SubtitleTrackSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  clips: z.array(SubtitleClipSchema),
  visible: z.boolean().optional(),
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
  // Color Grading (global)
  colorGrading: z.object({
    enabled: z.boolean(),
    grade: z.string().optional(),
    intensity: z.number().optional(),
  }).optional(),
  // Scene-specific Color Grading
  sceneColorGrading: z.record(z.string(), z.object({
    grade: z.string().optional(),
    intensity: z.number().optional(),
  })).optional(),
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
    sceneId: z.string().optional().nullable(),
    type: z.string(),
    duration: z.number(),
    offsetSeconds: z.number().optional(),
  })).optional(),
  // Ken Burns Effect
  kenBurns: z.array(z.object({
    id: z.string(),
    sceneId: z.string().optional(),
    startZoom: z.number(),
    endZoom: z.number(),
    startX: z.number(),
    startY: z.number(),
    endX: z.number(),
    endY: z.number(),
    easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']),
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
  // Subtitle Track
  subtitleTrack: SubtitleTrackSchema.optional(),
  // Preview mode: skip audio, less aggressive buffering
  previewMode: z.boolean().optional(),
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

// Easing functions for Ken Burns
const applyEasing = (t: number, easing: string): number => {
  switch (easing) {
    case 'easeIn': return t * t;
    case 'easeOut': return t * (2 - t);
    case 'easeInOut': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default: return t; // linear
  }
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
  sceneColorGrading?: Record<string, { grade?: string; intensity?: number }>;
  sceneEffects?: Record<string, z.infer<typeof SceneEffectsSchema>>;
  transitions?: Array<{ sceneIndex?: number; type?: string; duration?: number }>;
  chromaKey?: { enabled?: boolean; color?: string; tolerance?: number; edgeSoftness?: number; spillSuppression?: number; backgroundUrl?: string };
  kenBurns?: Array<{ id?: string; sceneId?: string; startZoom?: number; endZoom?: number; startX?: number; startY?: number; endX?: number; endY?: number; easing?: string }>;
  sceneDurationFrames: number;
  previewMode?: boolean;
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
  sceneColorGrading,
  sceneEffects,
  transitions,
  chromaKey,
  kenBurns,
  sceneDurationFrames,
  previewMode = false,
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
    
    // Scene-specific Color Grading has priority over global
    const sceneGrading = sceneColorGrading?.[scene.id];
    const effectiveGrading = sceneGrading?.grade 
      ? { enabled: true, grade: sceneGrading.grade, intensity: sceneGrading.intensity }
      : colorGrading;
    
    if (effectiveGrading?.enabled && effectiveGrading.grade && GRADE_CSS[effectiveGrading.grade]) {
      // Intensity skaliert die Stärke des Grading-Effekts (0.0 - 1.0)
      const gradeIntensity = effectiveGrading.intensity ?? 0.7;
      const gradeFilter = GRADE_CSS[effectiveGrading.grade];
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
  }, [effectiveBrightness, effectiveContrast, effectiveSaturation, effectiveTemperature, effectiveSharpness, effectiveFilter, styleTransfer, colorGrading, sceneColorGrading, scene.id]);

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

  // TransitionSeries handles all transition effects — no manual calculation needed
  const transitionEffects = { opacity: 1, transform: '', clipPath: '', additionalFilter: '' };

  // Calculate Ken Burns transform
  const kenBurnsTransform = useMemo(() => {
    // Find matching keyframe (scene-specific or global)
    const keyframe = kenBurns?.find(k => 
      k.sceneId === scene.id || !k.sceneId
    );
    
    if (!keyframe || keyframe.startZoom === undefined) return '';
    
    // Progress 0-1 based on localFrame / sceneDurationFrames
    const rawProgress = sceneDurationFrames > 0 ? localFrame / sceneDurationFrames : 0;
    const progress = Math.min(1, Math.max(0, rawProgress));
    
    // Apply easing function
    const easedProgress = applyEasing(progress, keyframe.easing || 'linear');
    
    // Interpolate between start and end values (with defaults)
    const startZoom = keyframe.startZoom ?? 1;
    const endZoom = keyframe.endZoom ?? 1;
    const startX = keyframe.startX ?? 0;
    const endX = keyframe.endX ?? 0;
    const startY = keyframe.startY ?? 0;
    const endY = keyframe.endY ?? 0;
    
    const zoom = interpolate(easedProgress, [0, 1], [startZoom, endZoom], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const x = interpolate(easedProgress, [0, 1], [startX, endX], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const y = interpolate(easedProgress, [0, 1], [startY, endY], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    
    return `scale(${zoom}) translate(${x}%, ${y}%)`;
  }, [kenBurns, scene.id, localFrame, sceneDurationFrames]);

  // Combine transitions transform with Ken Burns transform
  const combinedTransform = useMemo(() => {
    const transforms: string[] = [];
    if (kenBurnsTransform) transforms.push(kenBurnsTransform);
    if (transitionEffects.transform) transforms.push(transitionEffects.transform);
    return transforms.length > 0 ? transforms.join(' ') : undefined;
  }, [kenBurnsTransform, transitionEffects.transform]);

  const finalFilter = transitionEffects.additionalFilter 
    ? `${filterString} ${transitionEffects.additionalFilter}` 
    : filterString;

  const chromaKeyStyle = chromaKey?.enabled ? { mixBlendMode: 'multiply' as const } : {};


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
            transform: combinedTransform,
            transformOrigin: 'center center',
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
          pauseWhenBuffering={!previewMode}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: finalFilter,
            opacity: transitionEffects.opacity,
            transform: combinedTransform,
            transformOrigin: 'center center',
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
  sceneColorGrading,
  speedKeyframes,
  chromaKey,
  transitions,
  kenBurns,
  scenes,
  masterVolume = 100,
  voiceoverUrl,
  voiceoverVolume = 100,
  backgroundMusicUrl,
  backgroundMusicVolume = 30,
  soundDesign,
  textOverlays = [],
  subtitleTrack,
  previewMode = false,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const currentTimeSeconds = frame / fps;

  // Load font using native FontFace API (same as UniversalVideo.tsx)
  useEffect(() => {
    const handle = delayRender('Loading Inter font for Director\'s Cut...');
    
    const font = new FontFace(
      fontFamily,
      `url('${staticFile('Inter-Regular.woff2')}') format('woff2')`,
      { weight: '400' }
    );
    
    font.load()
      .then(() => {
        document.fonts.add(font);
        continueRender(handle);
      })
      .catch((err) => {
        console.error('[DirectorsCutVideo] Font loading error:', err);
        continueRender(handle);
      });
  }, []);

  // Sort scenes by startTime
  const sortedScenes = useMemo(() => {
    if (!scenes || scenes.length === 0) return [];
    return [...scenes].sort((a, b) => a.startTime - b.startTime);
  }, [scenes]);

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
          pauseWhenBuffering={!previewMode}
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
        {/* Original Audio - skip in preview mode (native audio handles it) */}
        {!previewMode && !voiceoverUrl && !backgroundMusicUrl && (
          <Audio src={sourceVideoUrl} volume={masterVolume / 100} startFrom={0} pauseWhenBuffering />
        )}
        {vignette > 0 && <AbsoluteFill style={{ ...vignetteStyle, pointerEvents: 'none', zIndex: 10 }} />}
        {/* Voiceover - skip in preview mode */}
        {!previewMode && voiceoverUrl && frame >= 15 && <Audio src={voiceoverUrl} volume={(voiceoverVolume || 100) / 100} startFrom={0} pauseWhenBuffering />}
        {/* Background Music - skip in preview mode */}
        {!previewMode && backgroundMusicUrl && frame >= 30 && <Audio src={backgroundMusicUrl} volume={(backgroundMusicVolume || 30) / 100} loop pauseWhenBuffering />}
      </AbsoluteFill>
    );
  }

  // ========== PREVIEW MODE: Single continuous video + CSS overlays ==========
  if (previewMode && sortedScenes.length > 0) {
    // Find current scene based on time
    const currentSceneIndex = sortedScenes.findIndex((scene, idx) => {
      const nextScene = sortedScenes[idx + 1];
      if (!nextScene) return currentTimeSeconds >= scene.startTime;
      return currentTimeSeconds >= scene.startTime && currentTimeSeconds < nextScene.startTime;
    });
    const activeIdx = currentSceneIndex >= 0 ? currentSceneIndex : 0;
    const activeScene = sortedScenes[activeIdx];
    const nextScene = sortedScenes[activeIdx + 1];
    // nextSceneStartFrame no longer needed — single video architecture

    // Get scene-specific effects
    const currentSceneEffect = sceneEffects?.[activeScene.id] || activeScene.effects || null;
    const effectiveBrightness = currentSceneEffect?.brightness ?? brightness;
    const effectiveContrast = currentSceneEffect?.contrast ?? contrast;
    const effectiveSaturation = currentSceneEffect?.saturation ?? saturation;
    const effectiveSharpness = currentSceneEffect?.sharpness ?? sharpness;
    const effectiveTemperature = currentSceneEffect?.temperature ?? temperature;
    const effectiveVignette = currentSceneEffect?.vignette ?? vignette;
    const effectiveFilter = currentSceneEffect?.filter ?? filter;
    // Next scene filter no longer needed — single video, no overlay

    // Build filter string for active scene
    let previewFilter = `brightness(${effectiveBrightness / 100}) `;
    previewFilter += `contrast(${effectiveContrast / 100}) `;
    previewFilter += `saturate(${effectiveSaturation / 100}) `;
    if (effectiveTemperature !== 0) {
      if (effectiveTemperature > 0) {
        const warmth = effectiveTemperature / 50;
        previewFilter += `sepia(${Math.min(0.5, warmth * 0.3)}) saturate(${1 + warmth * 0.3}) `;
      } else {
        const coldness = Math.abs(effectiveTemperature) / 50;
        previewFilter += `hue-rotate(${effectiveTemperature * 1.5}deg) saturate(${1 + coldness * 0.2}) `;
      }
    }
    if (effectiveSharpness > 0) previewFilter += `url(#sharpen-filter) `;
    if (effectiveFilter && isSVGFilter(effectiveFilter)) {
      previewFilter += SVG_FILTER_IDS[effectiveFilter] + ' ';
    } else if (effectiveFilter && FILTER_CSS[effectiveFilter]) {
      previewFilter += FILTER_CSS[effectiveFilter] + ' ';
    }
    if (styleTransfer?.enabled && styleTransfer.style && STYLE_CSS[styleTransfer.style]) {
      previewFilter += STYLE_CSS[styleTransfer.style] + ' ';
    }
    const sceneGrading = sceneColorGrading?.[activeScene.id];
    const effectiveGrading = sceneGrading?.grade
      ? { enabled: true, grade: sceneGrading.grade, intensity: sceneGrading.intensity }
      : colorGrading;
    if (effectiveGrading?.enabled && effectiveGrading.grade && GRADE_CSS[effectiveGrading.grade]) {
      previewFilter += GRADE_CSS[effectiveGrading.grade] + ' ';
    }

    // Calculate CSS-based transition effects per type
    let transitionOverlayOpacity = 0;
    let transitionBlur = 0;
    let transitionTransform = '';
    let transitionClipPath = '';
    let transitionVideoOpacity = 1;
    if (nextScene) {
      // Match transition by scene ID (robust) or by finding the original index
      const currentTransition = transitions?.find(t => 
        (t as any).sceneId ? activeScene.id === (t as any).sceneId || activeScene.id === (t as any).sceneId.replace('scene-', '') || (t as any).sceneId === activeScene.id.replace('scene-', '')
        : t.sceneIndex === activeIdx
      );
      if (currentTransition && currentTransition.type && currentTransition.type !== 'none') {
        const tDuration = Math.max(0.6, currentTransition.duration || 0.8);
        const tStart = nextScene.startTime - tDuration;
        const fullType = currentTransition.type.toLowerCase();
        const transitionType = fullType.split('-')[0];
        const transitionDir = fullType.split('-')[1] || 'left';
        if (currentTimeSeconds >= tStart && currentTimeSeconds < nextScene.startTime) {
          const progress = (currentTimeSeconds - tStart) / tDuration;
          const eased = Math.pow(0.5 - 0.5 * Math.cos(progress * Math.PI), 0.7); // stronger start for visibility
          switch (transitionType) {
            case 'fade':
              transitionVideoOpacity = 1 - eased * 0.8;
              transitionOverlayOpacity = eased * 0.6;
              break;
            case 'crossfade':
            case 'dissolve':
              // Simulate crossfade with opacity dip + black flash
              transitionVideoOpacity = 1 - eased * 0.7;
              transitionOverlayOpacity = eased * 0.4;
              break;
            case 'blur':
              transitionBlur = eased * 15;
              transitionVideoOpacity = 1 - eased * 0.3;
              break;
            case 'zoom':
              transitionTransform = `scale(${1 + eased * 0.3})`;
              transitionVideoOpacity = 1 - eased * 0.4;
              break;
            case 'wipe': {
              // Clip-path on base video to simulate wipe reveal
              if (transitionDir === 'left') transitionClipPath = `inset(0 0 0 ${eased * 100}%)`;
              else if (transitionDir === 'right') transitionClipPath = `inset(0 ${eased * 100}% 0 0)`;
              else if (transitionDir === 'up') transitionClipPath = `inset(0 0 0 0)`;
              else transitionClipPath = `inset(0 0 0 0)`;
              transitionVideoOpacity = 1;
              transitionOverlayOpacity = eased * 0.15;
              break;
            }
            case 'slide': {
              // Slide the base video out
              if (transitionDir === 'left') transitionTransform = `translateX(${-eased * 30}%)`;
              else if (transitionDir === 'right') transitionTransform = `translateX(${eased * 30}%)`;
              else if (transitionDir === 'up') transitionTransform = `translateY(${-eased * 30}%)`;
              else transitionTransform = `translateY(${eased * 30}%)`;
              transitionVideoOpacity = 1 - eased * 0.5;
              break;
            }
            case 'push': {
              // Push base video fully out of frame
              if (transitionDir === 'left') transitionTransform = `translateX(${-eased * 100}%)`;
              else if (transitionDir === 'right') transitionTransform = `translateX(${eased * 100}%)`;
              else if (transitionDir === 'up') transitionTransform = `translateY(${-eased * 100}%)`;
              else transitionTransform = `translateY(${eased * 100}%)`;
              break;
            }
            default:
              transitionVideoOpacity = 1 - eased * 0.5;
              transitionOverlayOpacity = eased * 0.3;
              break;
          }
        }
      }
    }

    // Ken Burns for active scene
    let kenBurnsStyle = '';
    const kbKeyframe = kenBurns?.find(k => k.sceneId === activeScene.id || !k.sceneId);
    if (kbKeyframe && kbKeyframe.startZoom !== undefined) {
      const sceneDur = activeScene.endTime - activeScene.startTime;
      const sceneProgress = sceneDur > 0 ? Math.min(1, Math.max(0, (currentTimeSeconds - activeScene.startTime) / sceneDur)) : 0;
      const easedP = applyEasing(sceneProgress, kbKeyframe.easing || 'linear');
      const zoom = (kbKeyframe.startZoom ?? 1) + easedP * ((kbKeyframe.endZoom ?? 1) - (kbKeyframe.startZoom ?? 1));
      const x = (kbKeyframe.startX ?? 0) + easedP * ((kbKeyframe.endX ?? 0) - (kbKeyframe.startX ?? 0));
      const y = (kbKeyframe.startY ?? 0) + easedP * ((kbKeyframe.endY ?? 0) - (kbKeyframe.startY ?? 0));
      kenBurnsStyle = `scale(${zoom}) translate(${x}%, ${y}%)`;
    }

    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        <SVGFilters />
        <SharpnessFilter intensity={effectiveSharpness} />
        {chromaKey?.enabled && chromaKey.backgroundUrl && (
          <AbsoluteFill>
            <img src={chromaKey.backgroundUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </AbsoluteFill>
        )}
        {/* Single continuous video — no decoder switches */}
        <Video
          src={sourceVideoUrl}
          startFrom={0}
          pauseWhenBuffering={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: transitionVideoOpacity,
            filter: `${previewFilter.trim()}${transitionBlur > 0 ? ` blur(${transitionBlur}px)` : ''}`,
            transform: [kenBurnsStyle, transitionTransform].filter(Boolean).join(' ') || undefined,
            clipPath: transitionClipPath || undefined,
            transformOrigin: 'center center',
          }}
          volume={0}
        />
        {/* No second Video element — all transitions are CSS-only on the base video */}
        {/* Darkening overlay for fade transitions */}
        {transitionOverlayOpacity > 0 && (
          <AbsoluteFill style={{
            backgroundColor: `rgba(0,0,0,${transitionOverlayOpacity})`,
            pointerEvents: 'none',
            zIndex: 5,
          }} />
        )}
        {/* VHS Scanlines */}
        {effectiveFilter === 'retro_vhs' && <VHSScanlines intensity={0.25} />}
        {/* Vignette */}
        {effectiveVignette > 0 && (
          <AbsoluteFill style={{
            background: `radial-gradient(ellipse at center, transparent 0%, transparent ${Math.max(0, 50 - effectiveVignette * 0.5)}%, rgba(0,0,0,${Math.min(1, effectiveVignette / 50)}) 100%)`,
            pointerEvents: 'none',
            zIndex: 10,
          }} />
        )}
        {/* Text Overlays */}
        {textOverlays.map((overlay) => {
          const startFrame = Math.floor(overlay.startTime * fps);
          const endFrame = overlay.endTime ? Math.floor(overlay.endTime * fps) : durationInFrames;
          const overlayDuration = endFrame - startFrame;
          return (
            <Sequence key={overlay.id} from={startFrame} durationInFrames={overlayDuration}>
              <TextOverlayRenderer overlay={overlay as TextOverlayProps} />
            </Sequence>
          );
        })}
        {/* Subtitles */}
        {subtitleTrack?.clips?.map((clip) => {
          const startFrame = Math.floor(clip.startTime * fps);
          const endFrame = Math.floor(clip.endTime * fps);
          const clipDuration = Math.max(1, endFrame - startFrame);
          const fontSizeMap: Record<string, string> = { small: '24px', medium: '36px', large: '48px', xl: '64px' };
          return (
            <Sequence key={clip.id} from={startFrame} durationInFrames={clipDuration}>
              <AbsoluteFill style={{
                display: 'flex', justifyContent: 'center',
                alignItems: clip.position === 'top' ? 'flex-start' : clip.position === 'center' ? 'center' : 'flex-end',
                padding: '5%', pointerEvents: 'none', zIndex: 100,
              }}>
                <div style={{
                  backgroundColor: clip.backgroundColor || 'rgba(0,0,0,0.7)',
                  color: clip.color || '#FFFFFF', padding: '12px 24px', borderRadius: '8px',
                  fontSize: fontSizeMap[clip.fontSize || 'medium'] || '36px',
                  fontFamily: clip.fontFamily || fontFamily, fontWeight: 'bold',
                  textAlign: 'center', maxWidth: '90%', lineHeight: 1.4,
                }}>
                  {clip.text}
                </div>
              </AbsoluteFill>
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  }

  // ========== RENDER MODE: TransitionSeries with per-scene Video for frame-perfect output ==========
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

      {/* SCENES — rendered via TransitionSeries for automatic overlap, z-order, and premounting */}
      <TransitionSeries>
        {sortedScenes.map((scene, idx) => {
          const sceneStartFrame = Math.floor(scene.startTime * fps);
          const sceneEndFrame = Math.floor(scene.endTime * fps);
          const sceneDurationFrames = Math.max(1, sceneEndFrame - sceneStartFrame);

          // Find transition by sceneId (robust) with fallback to sceneIndex
          const currentTransition = transitions?.find(t =>
            t.sceneId ? t.sceneId === scene.id : t.sceneIndex === idx
          );
          const hasTransitionToNext = idx < sortedScenes.length - 1 && currentTransition && currentTransition.type && currentTransition.type !== 'none';
          const transitionDurationFrames = hasTransitionToNext ? Math.max(1, Math.floor((currentTransition!.duration || 0.5) * fps)) : 0;

          // Build the presentation based on transition type
          const getPresentation = (): any => {
            if (!currentTransition || !currentTransition.type) return fade();
            const [baseType, direction = 'left'] = currentTransition.type.toLowerCase().split('-');
            
            const directionMap: Record<string, 'from-left' | 'from-right' | 'from-top' | 'from-bottom'> = {
              left: 'from-left',
              right: 'from-right',
              up: 'from-top',
              down: 'from-bottom',
            };

            switch (baseType) {
              case 'crossfade':
              case 'dissolve':
                return fade();
              case 'fade':
                return fade();
              case 'blur':
                return fade();
              case 'zoom':
                return slide({ direction: 'from-bottom' });
              case 'wipe':
                return wipe({ direction: directionMap[direction] || 'from-left' });
              case 'slide':
                return slide({ direction: directionMap[direction] || 'from-left' });
              case 'push':
                return slide({ direction: directionMap[direction] || 'from-left' });
              default:
                return fade();
            }
          };

          return (
            <React.Fragment key={scene.id}>
              <TransitionSeries.Sequence durationInFrames={sceneDurationFrames} premountFor={60}>
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
                    sceneColorGrading={sceneColorGrading}
                    sceneEffects={sceneEffects}
                    transitions={[]}
                    chromaKey={chromaKey}
                    kenBurns={kenBurns}
                    sceneDurationFrames={sceneDurationFrames}
                    previewMode={false}
                  />
                </AbsoluteFill>
              </TransitionSeries.Sequence>
              {hasTransitionToNext && transitionDurationFrames > 0 && (
                <TransitionSeries.Transition
                  presentation={getPresentation()}
                  timing={linearTiming({ durationInFrames: transitionDurationFrames })}
                />
              )}
            </React.Fragment>
          );
        })}
      </TransitionSeries>
      {/* AUDIO - Skip all Remotion audio in preview mode (native audio handles it) */}
      {!previewMode && !voiceoverUrl && !backgroundMusicUrl && (
        <Audio
          src={sourceVideoUrl}
          volume={masterVolume / 100}
          startFrom={0}
          pauseWhenBuffering
        />
      )}

      {/* Vignette Overlay */}
      {vignette > 0 && (
        <AbsoluteFill style={{ ...vignetteStyle, pointerEvents: 'none', zIndex: 10 }} />
      )}

      {/* Voiceover Audio */}
      {!previewMode && voiceoverUrl && frame >= 15 && (
        <Audio
          src={voiceoverUrl}
          volume={(voiceoverVolume || 100) / 100}
          startFrom={0}
          pauseWhenBuffering
        />
      )}

      {/* Background Music */}
      {!previewMode && backgroundMusicUrl && frame >= 30 && (
        <Audio
          src={backgroundMusicUrl}
          volume={(backgroundMusicVolume || 30) / 100}
          loop
          pauseWhenBuffering
        />
      )}

      {/* Sound Design Audio */}
      {!previewMode && soundDesign?.enabled && soundDesign.ambientUrl && (
        <Audio
          src={soundDesign.ambientUrl}
          volume={(soundDesign.ambientVolume || 50) / 100}
          loop
          pauseWhenBuffering
        />
      )}

      {!previewMode && soundDesign?.enabled && soundDesign.sfxTracks?.map((sfx, idx) => (
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

      {/* Subtitles */}
      {subtitleTrack?.clips?.map((clip) => {
        const startFrame = Math.floor(clip.startTime * fps);
        const endFrame = Math.floor(clip.endTime * fps);
        const clipDuration = Math.max(1, endFrame - startFrame);
        
        const fontSizeMap: Record<string, string> = {
          small: '24px',
          medium: '36px',
          large: '48px',
          xl: '64px',
        };
        
        return (
          <Sequence key={clip.id} from={startFrame} durationInFrames={clipDuration}>
            <AbsoluteFill style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: clip.position === 'top' ? 'flex-start' : 
                         clip.position === 'center' ? 'center' : 'flex-end',
              padding: '5%',
              pointerEvents: 'none',
              zIndex: 100,
            }}>
              <div style={{
                backgroundColor: clip.backgroundColor || 'rgba(0,0,0,0.7)',
                color: clip.color || '#FFFFFF',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: fontSizeMap[clip.fontSize || 'medium'] || '36px',
                fontFamily: clip.fontFamily || fontFamily,
                fontWeight: 'bold',
                textAlign: 'center',
                maxWidth: '90%',
                lineHeight: 1.4,
              }}>
                {clip.text}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
