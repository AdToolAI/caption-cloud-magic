import { useState } from 'react';
import { AIVideoUpscaling } from '../features/AIVideoUpscaling';
import { AIFrameInterpolation } from '../features/AIFrameInterpolation';
import { AIVideoRestoration } from '../features/AIVideoRestoration';

interface QualityEnhancementStepProps {
  onUpscalingChange?: (enabled: boolean, resolution: string) => void;
  onInterpolationChange?: (enabled: boolean, fps: number) => void;
  onRestorationChange?: (enabled: boolean, level: string) => void;
}

export function QualityEnhancementStep({ 
  onUpscalingChange,
  onInterpolationChange,
  onRestorationChange
}: QualityEnhancementStepProps) {
  const [upscalingSettings, setUpscalingSettings] = useState({
    enabled: false,
    targetResolution: '4k' as '2k' | '4k' | '8k',
    enhanceDetails: true,
    denoiseStrength: 30,
    sharpnessBoost: 20,
  });
  
  const [interpolationSettings, setInterpolationSettings] = useState({
    enabled: false,
    targetFps: 60 as 60 | 120 | 240,
    motionSmoothing: 50,
    preserveMotionBlur: true,
    slowMotionFactor: 1,
  });
  
  const [restorationSettings, setRestorationSettings] = useState({
    enabled: false,
    removeGrain: false,
    grainStrength: 50,
    removeScratches: false,
    scratchDetection: 50,
    stabilizeFootage: false,
    stabilizationStrength: 50,
    colorCorrection: false,
    enhanceFaces: false,
    deinterlace: false,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">KI-Qualität</h3>
        <p className="text-sm text-muted-foreground">
          Verbessere Auflösung, Framerate und Bildqualität mit KI
        </p>
      </div>

      {/* Quality Enhancement Features */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AIVideoUpscaling
          settings={upscalingSettings}
          onSettingsChange={(settings) => {
            setUpscalingSettings(settings);
            onUpscalingChange?.(settings.enabled, settings.targetResolution);
          }}
        />
        <AIFrameInterpolation
          settings={interpolationSettings}
          onSettingsChange={(settings) => {
            setInterpolationSettings(settings);
            onInterpolationChange?.(settings.enabled, settings.targetFps);
          }}
        />
        <AIVideoRestoration
          settings={restorationSettings}
          onSettingsChange={(settings) => {
            setRestorationSettings(settings);
            onRestorationChange?.(settings.enabled, settings.enabled ? 'standard' : '');
          }}
        />
      </div>
    </div>
  );
}
