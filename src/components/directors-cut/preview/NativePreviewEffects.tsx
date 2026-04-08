import { useMemo } from 'react';
import type { SceneAnalysis, GlobalEffects } from '@/types/directors-cut';

interface NativePreviewEffectsProps {
  effects: GlobalEffects;
  colorGrading?: {
    enabled: boolean;
    grade: string | null;
    intensity: number;
  };
  sceneColorGrading?: Record<string, { grade?: string | null; intensity?: number }>;
  scenes: SceneAnalysis[];
  currentTime: number;
}

const COLOR_GRADE_MAP: Record<string, string> = {
  warm: 'sepia(0.3) saturate(1.2)',
  cool: 'hue-rotate(10deg) saturate(0.9)',
  vintage: 'sepia(0.5) contrast(1.1) brightness(0.95)',
  cinematic: 'contrast(1.15) saturate(1.1) brightness(0.9)',
  'black-white': 'grayscale(1)',
  noir: 'grayscale(0.8) contrast(1.4) brightness(0.85)',
  muted: 'saturate(0.5) brightness(1.05)',
  vivid: 'saturate(1.5) contrast(1.05)',
  sunset: 'sepia(0.2) hue-rotate(-10deg) saturate(1.3)',
  forest: 'hue-rotate(30deg) saturate(0.8)',
  ocean: 'hue-rotate(180deg) saturate(0.6)',
  pastel: 'saturate(0.6) brightness(1.15) contrast(0.9)',
  teal_orange: 'hue-rotate(-15deg) saturate(1.4) contrast(1.15) brightness(0.95)',
  moonlight: 'hue-rotate(200deg) saturate(0.6) brightness(1.1) contrast(0.9)',
  golden_hour: 'sepia(0.35) saturate(1.3) brightness(1.1)',
  matrix: 'hue-rotate(90deg) saturate(1.2) contrast(1.3) brightness(0.9)',
  hollywood_blue: 'hue-rotate(200deg) saturate(0.8) contrast(1.2) brightness(0.85)',
  sunset_glow: 'sepia(0.25) hue-rotate(-15deg) saturate(1.4) brightness(1.05)',
  forest_green: 'hue-rotate(60deg) saturate(0.75) contrast(1.1) brightness(0.95)',
  coral_reef: 'hue-rotate(-30deg) saturate(1.3) brightness(1.1) contrast(1.05)',
  bleach_bypass: 'saturate(0.35) contrast(1.5) brightness(1.05)',
};

/**
 * Lightweight overlay for color grading and vignette.
 * No backdropFilter — uses CSS filter and background overlays only.
 */
export function NativePreviewEffects({
  effects,
  colorGrading,
  sceneColorGrading,
  scenes,
  currentTime,
}: NativePreviewEffectsProps) {
  // Find current scene
  const currentScene = useMemo(() => {
    return scenes.find(s => currentTime >= s.start_time && currentTime < s.end_time);
  }, [scenes, currentTime]);

  // Determine active color grade
  const gradeFilter = useMemo(() => {
    // Scene-level grade takes priority
    if (currentScene && sceneColorGrading?.[currentScene.id]) {
      const sg = sceneColorGrading[currentScene.id];
      if (sg.grade && COLOR_GRADE_MAP[sg.grade]) {
        return COLOR_GRADE_MAP[sg.grade];
      }
    }
    // Global grade
    if (colorGrading?.enabled && colorGrading.grade && COLOR_GRADE_MAP[colorGrading.grade]) {
      return COLOR_GRADE_MAP[colorGrading.grade];
    }
    return null;
  }, [currentScene, sceneColorGrading, colorGrading]);

  const showVignette = (effects.vignette ?? 0) > 0;

  if (!gradeFilter && !showVignette) return null;

  return (
    <>
      {/* Color grading overlay */}
      {gradeFilter && (
        <div
          className="absolute inset-0 pointer-events-none z-[4]"
          style={{
            mixBlendMode: 'color',
            filter: gradeFilter,
            backgroundColor: 'transparent',
          }}
        />
      )}
      {/* Vignette */}
      {showVignette && (
        <div
          className="absolute inset-0 pointer-events-none z-[4]"
          style={{
            background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${(effects.vignette || 0) / 100 * 0.7}) 100%)`,
          }}
        />
      )}
    </>
  );
}
