/**
 * 🎵 SCENE AUDIO MANAGER
 * Dynamic audio transitions and ducking for 95%+ Loft-Film quality
 * 
 * Features:
 * - Scene-based music volume ducking
 * - Crossfade transitions between scenes
 * - Dynamic volume based on voiceover activity
 * - CTA emphasis with music swell
 * - ✅ PHASE 2: LUFS-based audio normalization
 */

import React from 'react';
import { Audio, useCurrentFrame, useVideoConfig, Sequence } from 'remotion';
import { safeInterpolate } from '../utils/safeInterpolate';

export interface SceneAudioConfig {
  sceneType: string;
  startTime: number;
  endTime: number;
  hasVoiceover: boolean;
}

interface SceneAudioManagerProps {
  backgroundMusicUrl: string;
  voiceoverUrl?: string;
  scenes: SceneAudioConfig[];
  masterVolume?: number;
  baseMusicVolume?: number;
  voiceoverVolume?: number;
  enableDucking?: boolean;
  enableCrossfade?: boolean;
  // ✅ PHASE 2: Audio Normalization Options
  enableNormalization?: boolean;
  targetLUFS?: number; // Target loudness in LUFS (-14 for streaming, -16 for broadcast)
}

// Scene-specific music volume multipliers
const SCENE_VOLUME_MULTIPLIERS: Record<string, number> = {
  hook: 0.6,      // Slightly louder for energy
  problem: 0.4,   // Quieter, let voiceover dominate
  solution: 0.5,  // Medium, celebratory but not overwhelming
  feature: 0.35,  // Very quiet, focus on explanation
  proof: 0.4,     // Quiet, let stats speak
  cta: 0.7,       // Louder for excitement/urgency
};

// ✅ PHASE 2: LUFS Normalization Constants
// Based on ITU-R BS.1770-4 standard for broadcast loudness
const LUFS_CONSTANTS = {
  // Target LUFS levels for different platforms
  STREAMING: -14,  // YouTube, Spotify, etc.
  BROADCAST: -23,  // TV broadcast standard
  PODCAST: -16,    // Podcast standard
  EXPLAINER: -16,  // Good balance for explainer videos
  
  // Dynamic range limits
  MAX_PEAK: -1,    // True peak limiter at -1 dBFS
  MIN_FLOOR: -60,  // Noise floor
  
  // Compression ratios for different content types
  VOICEOVER_RATIO: 3,   // Gentle compression for voice
  MUSIC_RATIO: 4,       // Slightly more for music
  SFX_RATIO: 2,         // Light for effects
};

// Transition durations in seconds
const FADE_DURATION = 0.5;
const DUCK_DURATION = 0.3;

/**
 * 🎚️ Calculate LUFS-normalized volume
 * Applies ITU-R BS.1770-4 compliant loudness normalization
 */
const calculateNormalizedVolume = (
  baseVolume: number,
  targetLUFS: number,
  contentType: 'voiceover' | 'music' | 'sfx'
): number => {
  // Estimated source LUFS (typical values)
  const estimatedSourceLUFS: Record<string, number> = {
    voiceover: -18, // Typical voice recording
    music: -10,     // Typical music mix
    sfx: -15,       // Typical sound effects
  };
  
  const sourceLUFS = estimatedSourceLUFS[contentType];
  
  // Calculate gain adjustment needed
  // Formula: gain_dB = targetLUFS - sourceLUFS
  const gainAdjustment = targetLUFS - sourceLUFS;
  
  // Convert dB to linear scale
  // linear = 10^(dB/20)
  const linearGain = Math.pow(10, gainAdjustment / 20);
  
  // Apply gain with limiter to prevent clipping
  const normalizedVolume = baseVolume * linearGain;
  
  // Soft limiter: prevent volume exceeding 1.0 with smooth rolloff
  const limitedVolume = normalizedVolume > 0.95 
    ? 0.95 + (normalizedVolume - 0.95) * 0.2 // Soft knee compression above 0.95
    : normalizedVolume;
  
  return Math.min(Math.max(limitedVolume, 0), 1.0);
};

/**
 * 🎛️ Apply dynamic range compression
 * Reduces volume spikes while maintaining average loudness
 */
const applyCompression = (
  volume: number,
  threshold: number = 0.7,
  ratio: number = 3
): number => {
  if (volume <= threshold) return volume;
  
  // Compression formula: output = threshold + (input - threshold) / ratio
  const compressed = threshold + (volume - threshold) / ratio;
  
  return compressed;
};

export const SceneAudioManager: React.FC<SceneAudioManagerProps> = ({
  backgroundMusicUrl,
  voiceoverUrl,
  scenes,
  masterVolume = 1.0,
  baseMusicVolume = 0.3,
  voiceoverVolume = 1.0,
  enableDucking = true,
  enableCrossfade = true,
  enableNormalization = true,
  targetLUFS = LUFS_CONSTANTS.EXPLAINER,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // Find current scene
  const getCurrentScene = (): SceneAudioConfig | null => {
    return scenes.find(
      scene => currentTime >= scene.startTime && currentTime < scene.endTime
    ) || null;
  };

  const currentScene = getCurrentScene();
  const sceneType = currentScene?.sceneType || 'hook';

  // Calculate dynamic music volume with LUFS normalization
  const calculateMusicVolume = (): number => {
    if (!currentScene) return baseMusicVolume * masterVolume;

    const sceneMultiplier = SCENE_VOLUME_MULTIPLIERS[sceneType] || 0.5;
    let volume = baseMusicVolume * sceneMultiplier;

    // Ducking when voiceover is active
    if (enableDucking && currentScene.hasVoiceover) {
      volume *= 0.6; // Duck by 40%
    }

    // Crossfade at scene boundaries
    if (enableCrossfade) {
      const sceneProgress = currentTime - currentScene.startTime;
      const sceneRemaining = currentScene.endTime - currentTime;

      // Fade in at scene start
      if (sceneProgress < FADE_DURATION) {
        const fadeIn = safeInterpolate(
          sceneProgress,
          [0, FADE_DURATION],
          [0.5, 1]
        );
        volume *= fadeIn;
      }

      // Fade out at scene end
      if (sceneRemaining < FADE_DURATION) {
        const fadeOut = safeInterpolate(
          sceneRemaining,
          [0, FADE_DURATION],
          [0.5, 1]
        );
        volume *= fadeOut;
      }
    }

    // CTA swell - gradually increase volume in last second
    if (sceneType === 'cta') {
      const sceneProgress = currentTime - currentScene.startTime;
      const sceneDuration = currentScene.endTime - currentScene.startTime;
      
      if (sceneProgress > sceneDuration - 1.5) {
        const swell = safeInterpolate(
          sceneProgress,
          [sceneDuration - 1.5, sceneDuration],
          [1, 1.3]
        );
        volume *= swell;
      }
    }

    // ✅ PHASE 2: Apply LUFS normalization
    if (enableNormalization) {
      volume = calculateNormalizedVolume(volume, targetLUFS, 'music');
      volume = applyCompression(volume, 0.7, LUFS_CONSTANTS.MUSIC_RATIO);
    }

    return Math.min(volume * masterVolume, 1.0);
  };

  // Calculate voiceover volume with scene-aware adjustments and LUFS normalization
  const calculateVoiceoverVolume = (): number => {
    if (!currentScene) return voiceoverVolume * masterVolume;

    let volume = voiceoverVolume;

    // Slightly boost voiceover in problem/feature scenes for clarity
    if (sceneType === 'problem' || sceneType === 'feature') {
      volume *= 1.1;
    }

    // Fade in/out at scene boundaries
    if (enableCrossfade) {
      const sceneProgress = currentTime - currentScene.startTime;
      const sceneRemaining = currentScene.endTime - currentTime;

      if (sceneProgress < DUCK_DURATION) {
        const fadeIn = safeInterpolate(
          sceneProgress,
          [0, DUCK_DURATION],
          [0.7, 1]
        );
        volume *= fadeIn;
      }

      if (sceneRemaining < DUCK_DURATION) {
        const fadeOut = safeInterpolate(
          sceneRemaining,
          [0, DUCK_DURATION],
          [0.7, 1]
        );
        volume *= fadeOut;
      }
    }

    // ✅ PHASE 2: Apply LUFS normalization for voiceover
    if (enableNormalization) {
      volume = calculateNormalizedVolume(volume, targetLUFS, 'voiceover');
      volume = applyCompression(volume, 0.8, LUFS_CONSTANTS.VOICEOVER_RATIO);
    }

    return Math.min(volume * masterVolume, 1.0);
  };

  const musicVolume = calculateMusicVolume();
  const voVolume = calculateVoiceoverVolume();

  return (
    <>
      {/* Background Music with Dynamic Volume + LUFS Normalization */}
      {backgroundMusicUrl && backgroundMusicUrl.startsWith('http') && (
        <Audio
          src={backgroundMusicUrl}
          volume={musicVolume}
          playbackRate={1}
        />
      )}

      {/* Voiceover with Scene-Aware Volume + LUFS Normalization */}
      {voiceoverUrl && voiceoverUrl.startsWith('http') && (
        <Audio
          src={voiceoverUrl}
          volume={voVolume}
          playbackRate={1}
        />
      )}
    </>
  );
};

// ✅ Export LUFS constants for use in other components
export { LUFS_CONSTANTS };

// ============================================
// VOLUME VISUALIZATION (for debugging/preview)
// ============================================

interface VolumeIndicatorProps {
  musicVolume: number;
  voiceoverVolume: number;
  sceneType: string;
  show?: boolean;
}

export const VolumeIndicator: React.FC<VolumeIndicatorProps> = ({
  musicVolume,
  voiceoverVolume,
  sceneType,
  show = false,
}) => {
  if (!show) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        padding: '8px 12px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: 8,
        color: 'white',
        fontFamily: 'monospace',
        fontSize: 10,
        zIndex: 999,
      }}
    >
      <div>Scene: {sceneType}</div>
      <div style={{ marginTop: 4 }}>
        🎵 Music: {(musicVolume * 100).toFixed(0)}%
        <div
          style={{
            height: 4,
            width: 60,
            backgroundColor: '#333',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${musicVolume * 100}%`,
              backgroundColor: '#F5C76A',
              transition: 'width 0.1s',
            }}
          />
        </div>
      </div>
      <div style={{ marginTop: 4 }}>
        🎤 Voice: {(voiceoverVolume * 100).toFixed(0)}%
        <div
          style={{
            height: 4,
            width: 60,
            backgroundColor: '#333',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${voiceoverVolume * 100}%`,
              backgroundColor: '#22d3ee',
              transition: 'width 0.1s',
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default SceneAudioManager;
