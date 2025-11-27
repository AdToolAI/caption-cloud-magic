import React from 'react';
import { AbsoluteFill, Video, Audio, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { z } from 'zod';

export const DirectorsCutVideoSchema = z.object({
  sourceVideoUrl: z.string(),
  // Visual Effects
  brightness: z.number().optional(),
  contrast: z.number().optional(),
  saturation: z.number().optional(),
  sharpness: z.number().optional(),
  temperature: z.number().optional(),
  vignette: z.number().optional(),
  filter: z.string().optional(),
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
  speedKeyframes: z.array(z.object({
    time: z.number(),
    speed: z.number(),
  })).optional(),
  // Chroma Key
  chromaKey: z.object({
    enabled: z.boolean(),
    color: z.string().optional(),
    tolerance: z.number().optional(),
    backgroundUrl: z.string().optional(),
  }).optional(),
  // Audio
  masterVolume: z.number().optional(),
  noiseReduction: z.boolean().optional(),
  voiceEnhancement: z.boolean().optional(),
  voiceoverUrl: z.string().optional(),
  voiceoverVolume: z.number().optional(),
  backgroundMusicUrl: z.string().optional(),
  backgroundMusicVolume: z.number().optional(),
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
  styleTransfer,
  colorGrading,
  speedKeyframes,
  chromaKey,
  masterVolume = 100,
  voiceoverUrl,
  voiceoverVolume = 100,
  backgroundMusicUrl,
  backgroundMusicVolume = 30,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Calculate current speed based on keyframes
  const getCurrentSpeed = () => {
    if (!speedKeyframes || speedKeyframes.length === 0) return 1;
    
    const currentTime = frame / fps;
    let speed = 1;
    
    for (let i = 0; i < speedKeyframes.length; i++) {
      if (currentTime >= speedKeyframes[i].time) {
        speed = speedKeyframes[i].speed;
      }
    }
    
    return speed;
  };

  // Build filter string
  const buildFilterString = () => {
    let filterStr = '';
    
    // Base adjustments
    filterStr += `brightness(${brightness / 100}) `;
    filterStr += `contrast(${contrast / 100}) `;
    filterStr += `saturate(${saturation / 100}) `;
    
    // Temperature (approximate with sepia + hue-rotate)
    if (temperature !== 0) {
      if (temperature > 0) {
        filterStr += `sepia(${temperature / 100}) `;
      } else {
        filterStr += `hue-rotate(${temperature}deg) `;
      }
    }
    
    // Apply preset filter
    if (filter && FILTER_CSS[filter]) {
      filterStr += FILTER_CSS[filter] + ' ';
    }
    
    // Apply style transfer
    if (styleTransfer?.enabled && styleTransfer.style && STYLE_CSS[styleTransfer.style]) {
      const intensity = styleTransfer.intensity || 0.8;
      // Blend style with intensity (simplified)
      filterStr += STYLE_CSS[styleTransfer.style] + ' ';
    }
    
    // Apply color grading
    if (colorGrading?.enabled && colorGrading.grade && GRADE_CSS[colorGrading.grade]) {
      filterStr += GRADE_CSS[colorGrading.grade] + ' ';
    }
    
    return filterStr.trim();
  };

  // Vignette overlay
  const vignetteStyle = vignette > 0 ? {
    background: `radial-gradient(ellipse at center, transparent 0%, transparent ${100 - vignette}%, rgba(0,0,0,${vignette / 100}) 100%)`,
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

      {/* Main Video */}
      <Video
        src={sourceVideoUrl}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          filter: buildFilterString(),
          // Simple chroma key approximation (not perfect, real implementation needs WebGL)
          ...(chromaKey?.enabled && chromaKey.color ? {
            mixBlendMode: 'multiply',
          } : {}),
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
        />
      )}

      {/* Background Music */}
      {backgroundMusicUrl && (
        <Audio
          src={backgroundMusicUrl}
          volume={(backgroundMusicVolume || 30) / 100}
          loop
        />
      )}
    </AbsoluteFill>
  );
};
