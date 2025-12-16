/**
 * 🎵 SCENE AUDIO MANAGER
 * Dynamic audio transitions and ducking for 95%+ Loft-Film quality
 * 
 * Features:
 * - Scene-based music volume ducking
 * - Crossfade transitions between scenes
 * - Dynamic volume based on voiceover activity
 * - CTA emphasis with music swell
 */

import React from 'react';
import { Audio, useCurrentFrame, useVideoConfig, interpolate, Sequence } from 'remotion';

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

// Transition durations in seconds
const FADE_DURATION = 0.5;
const DUCK_DURATION = 0.3;

export const SceneAudioManager: React.FC<SceneAudioManagerProps> = ({
  backgroundMusicUrl,
  voiceoverUrl,
  scenes,
  masterVolume = 1.0,
  baseMusicVolume = 0.3,
  voiceoverVolume = 1.0,
  enableDucking = true,
  enableCrossfade = true,
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

  // Calculate dynamic music volume
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
      const sceneDuration = currentScene.endTime - currentScene.startTime;

      // Fade in at scene start
      if (sceneProgress < FADE_DURATION) {
        const fadeIn = interpolate(
          sceneProgress,
          [0, FADE_DURATION],
          [0.5, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        volume *= fadeIn;
      }

      // Fade out at scene end
      if (sceneRemaining < FADE_DURATION) {
        const fadeOut = interpolate(
          sceneRemaining,
          [0, FADE_DURATION],
          [0.5, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        volume *= fadeOut;
      }
    }

    // CTA swell - gradually increase volume in last second
    if (sceneType === 'cta') {
      const sceneProgress = currentTime - currentScene.startTime;
      const sceneDuration = currentScene.endTime - currentScene.startTime;
      
      if (sceneProgress > sceneDuration - 1.5) {
        const swell = interpolate(
          sceneProgress,
          [sceneDuration - 1.5, sceneDuration],
          [1, 1.3],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        volume *= swell;
      }
    }

    return Math.min(volume * masterVolume, 1.0);
  };

  // Calculate voiceover volume with scene-aware adjustments
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
        const fadeIn = interpolate(
          sceneProgress,
          [0, DUCK_DURATION],
          [0.7, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        volume *= fadeIn;
      }

      if (sceneRemaining < DUCK_DURATION) {
        const fadeOut = interpolate(
          sceneRemaining,
          [0, DUCK_DURATION],
          [0.7, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        volume *= fadeOut;
      }
    }

    return Math.min(volume * masterVolume, 1.0);
  };

  const musicVolume = calculateMusicVolume();
  const voVolume = calculateVoiceoverVolume();

  return (
    <>
      {/* Background Music with Dynamic Volume */}
      {backgroundMusicUrl && backgroundMusicUrl.startsWith('http') && (
        <Audio
          src={backgroundMusicUrl}
          volume={musicVolume}
          playbackRate={1}
        />
      )}

      {/* Voiceover with Scene-Aware Volume */}
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
