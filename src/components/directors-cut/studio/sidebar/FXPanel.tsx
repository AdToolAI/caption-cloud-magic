import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Zap, Gauge, Move, ArrowUpCircle, Film, ZoomIn, ZoomOut, MoveLeft, MoveRight, MoveUp, MoveDown, Timer, RotateCcw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SceneAnalysis, SceneEffects } from '@/types/directors-cut';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

interface FXPanelProps {
  chromaKey: { enabled: boolean; color: string; tolerance: number; backgroundUrl?: string };
  onChromaKeyChange: (ck: { enabled: boolean; color: string; tolerance: number; backgroundUrl?: string }) => void;
  upscaling: { enabled: boolean; targetResolution: string };
  onUpscalingChange: (enabled: boolean, resolution: string) => void;
  interpolation: { enabled: boolean; targetFps: number };
  onInterpolationChange: (enabled: boolean, fps: number) => void;
  restoration: { enabled: boolean; level: string };
  onRestorationChange: (enabled: boolean, level: string) => void;
  // New props for animations & speed
  selectedSceneId?: string | null;
  scenes?: SceneAnalysis[];
  sceneEffects?: Record<string, SceneEffects>;
  onSceneEffectsChange?: (sceneEffects: Record<string, SceneEffects>) => void;
  onScenePlaybackRateChange?: (sceneId: string, rate: number) => void;
}

const ANIMATION_OPTIONS = [
  { type: 'none' as const, label: 'Keine', icon: RotateCcw },
  { type: 'zoomIn' as const, label: 'Zoom In', icon: ZoomIn },
  { type: 'zoomOut' as const, label: 'Zoom Out', icon: ZoomOut },
  { type: 'zoomInSlow' as const, label: 'Zoom In (Slow)', icon: ZoomIn },
  { type: 'zoomOutSlow' as const, label: 'Zoom Out (Slow)', icon: ZoomOut },
  { type: 'panLeft' as const, label: 'Pan Links', icon: MoveLeft },
  { type: 'panRight' as const, label: 'Pan Rechts', icon: MoveRight },
  { type: 'panUp' as const, label: 'Pan Hoch', icon: MoveUp },
  { type: 'panDown' as const, label: 'Pan Runter', icon: MoveDown },
] as const;

const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3];

export const FXPanel: React.FC<FXPanelProps> = ({
  chromaKey,
  onChromaKeyChange,
  upscaling,
  onUpscalingChange,
  interpolation,
  onInterpolationChange,
  restoration,
  onRestorationChange,
  selectedSceneId,
  scenes = [],
  sceneEffects = {},
  onSceneEffectsChange,
  onScenePlaybackRateChange,
}) => {
  const selectedScene = scenes.find(s => s.id === selectedSceneId);
  const currentAnimation = selectedSceneId ? sceneEffects[selectedSceneId]?.animation?.type || 'none' : 'none';
  const currentAnimIntensity = selectedSceneId ? sceneEffects[selectedSceneId]?.animation?.intensity ?? 50 : 50;
  const currentSpeed = selectedScene?.playbackRate ?? sceneEffects[selectedSceneId || '']?.speed ?? 1;

  const handleAnimationChange = (type: string) => {
    if (!selectedSceneId || !onSceneEffectsChange) return;
    const existing = sceneEffects[selectedSceneId] || {};
    onSceneEffectsChange({
      ...sceneEffects,
      [selectedSceneId]: {
        ...existing,
        animation: { type: type as any, intensity: currentAnimIntensity },
      },
    });
  };

  const handleAnimIntensityChange = (intensity: number) => {
    if (!selectedSceneId || !onSceneEffectsChange) return;
    const existing = sceneEffects[selectedSceneId] || {};
    onSceneEffectsChange({
      ...sceneEffects,
      [selectedSceneId]: {
        ...existing,
        animation: { type: currentAnimation as any, intensity },
      },
    });
  };

  const handleSpeedChange = (speed: number) => {
    if (!selectedSceneId || !onScenePlaybackRateChange) return;
    onScenePlaybackRateChange(selectedSceneId, speed);
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-[#F5C76A]" />
          <Zap className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]" />
          <span className="text-sm font-medium text-white">Effekte & Qualität</span>
        </div>

        {/* Scene Animation */}
        <div className="space-y-2 p-2.5 rounded-xl backdrop-blur-md bg-[#0a0a1a]/60 border border-white/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Move className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.4)]" />
            <span className="text-[11px] text-white/70">Szenen-Animation</span>
            {!selectedSceneId && (
              <span className="text-[9px] text-white/30 ml-auto">Szene auswählen</span>
            )}
          </div>
          <div className={cn("grid grid-cols-3 gap-1.5", !selectedSceneId && "opacity-40 pointer-events-none")}>
            {ANIMATION_OPTIONS.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                onClick={() => handleAnimationChange(type)}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-lg text-[9px] transition-all border",
                  currentAnimation === type
                    ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.2)]"
                    : "bg-[#0a0a1a]/80 border-white/5 text-white/50 hover:border-white/20 hover:text-white/70"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="leading-tight text-center">{label}</span>
              </button>
            ))}
          </div>
          {selectedSceneId && currentAnimation !== 'none' && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between">
                <label className="text-[10px] text-white/50">Intensität</label>
                <span className="text-[10px] text-cyan-400/60">{currentAnimIntensity}%</span>
              </div>
              <Slider
                value={[currentAnimIntensity]}
                onValueChange={([v]) => handleAnimIntensityChange(v)}
                min={10}
                max={100}
                step={1}
                className="cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Speed Control */}
        <div className="space-y-2 p-2.5 rounded-xl backdrop-blur-md bg-[#0a0a1a]/60 border border-white/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Timer className="h-3 w-3 text-[#F5C76A] drop-shadow-[0_0_4px_rgba(245,199,106,0.4)]" />
            <span className="text-[11px] text-white/70">Geschwindigkeit</span>
            {!selectedSceneId && (
              <span className="text-[9px] text-white/30 ml-auto">Szene auswählen</span>
            )}
          </div>
          <div className={cn(!selectedSceneId && "opacity-40 pointer-events-none")}>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-white/50">Speed</span>
                <span className="text-[12px] font-mono text-[#F5C76A] drop-shadow-[0_0_4px_rgba(245,199,106,0.3)]">
                  {currentSpeed.toFixed(2)}x
                </span>
              </div>
              <Slider
                value={[currentSpeed]}
                onValueChange={([v]) => handleSpeedChange(v)}
                min={0.1}
                max={3}
                step={0.05}
                className="cursor-pointer"
              />
              <div className="flex gap-1 flex-wrap">
                {SPEED_PRESETS.map(preset => (
                  <button
                    key={preset}
                    onClick={() => handleSpeedChange(preset)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[9px] font-medium transition-all border",
                      Math.abs(currentSpeed - preset) < 0.06
                        ? "bg-[#F5C76A]/20 border-[#F5C76A]/50 text-[#F5C76A] shadow-[0_0_6px_rgba(245,199,106,0.2)]"
                        : "bg-[#0a0a1a]/80 border-white/5 text-white/40 hover:border-white/20 hover:text-white/60"
                    )}
                  >
                    {preset}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Green Screen / Chroma Key */}
        <div className="space-y-2 p-2.5 rounded-xl backdrop-blur-md bg-[#0a0a1a]/60 border border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Film className="h-3 w-3 text-green-400 drop-shadow-[0_0_4px_rgba(74,222,128,0.4)]" />
              <span className="text-[11px] text-white/70">Green Screen</span>
            </div>
            <Switch
              checked={chromaKey.enabled}
              onCheckedChange={(v) => onChromaKeyChange({ ...chromaKey, enabled: v })}
              className="scale-75"
            />
          </div>
          {chromaKey.enabled && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-white/50">Farbe</label>
                <input
                  type="color"
                  value={chromaKey.color}
                  onChange={(e) => onChromaKeyChange({ ...chromaKey, color: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer border border-white/10"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-[10px] text-white/50">Toleranz</label>
                  <span className="text-[10px] text-cyan-400/60">{chromaKey.tolerance}%</span>
                </div>
                <Slider
                  value={[chromaKey.tolerance]}
                  onValueChange={([v]) => onChromaKeyChange({ ...chromaKey, tolerance: v })}
                  min={5}
                  max={80}
                  step={1}
                  className="cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Quality Enhancement */}
        <div className="border-t border-[#F5C76A]/10 pt-3 space-y-3">
          <span className="text-xs text-[#F5C76A]/60 font-medium uppercase tracking-wider">Qualität</span>

          {/* Upscaling */}
          <div className="space-y-2 p-2.5 rounded-xl backdrop-blur-md bg-[#0a0a1a]/60 border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ArrowUpCircle className="h-3 w-3 text-purple-400 drop-shadow-[0_0_4px_rgba(192,132,252,0.4)]" />
                <span className="text-[11px] text-white/70">KI-Upscaling</span>
              </div>
              <Switch
                checked={upscaling.enabled}
                onCheckedChange={(v) => onUpscalingChange(v, upscaling.targetResolution)}
                className="scale-75"
              />
            </div>
            {upscaling.enabled && (
              <Select
                value={upscaling.targetResolution}
                onValueChange={(v) => onUpscalingChange(true, v)}
              >
                <SelectTrigger className="h-7 text-[10px] bg-[#0a0a1a]/80 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0a1a] border-white/10">
                  <SelectItem value="1080p" className="text-white text-xs">1080p</SelectItem>
                  <SelectItem value="2k" className="text-white text-xs">2K</SelectItem>
                  <SelectItem value="4k" className="text-white text-xs">4K</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Frame Interpolation */}
          <div className="space-y-2 p-2.5 rounded-xl backdrop-blur-md bg-[#0a0a1a]/60 border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Gauge className="h-3 w-3 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.4)]" />
                <span className="text-[11px] text-white/70">Frame-Interpolation</span>
              </div>
              <Switch
                checked={interpolation.enabled}
                onCheckedChange={(v) => onInterpolationChange(v, interpolation.targetFps)}
                className="scale-75"
              />
            </div>
            {interpolation.enabled && (
              <Select
                value={String(interpolation.targetFps)}
                onValueChange={(v) => onInterpolationChange(true, Number(v))}
              >
                <SelectTrigger className="h-7 text-[10px] bg-[#0a0a1a]/80 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0a1a] border-white/10">
                  <SelectItem value="48" className="text-white text-xs">48 fps</SelectItem>
                  <SelectItem value="60" className="text-white text-xs">60 fps</SelectItem>
                  <SelectItem value="120" className="text-white text-xs">120 fps</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Restoration */}
          <div className="space-y-2 p-2.5 rounded-xl backdrop-blur-md bg-[#0a0a1a]/60 border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Move className="h-3 w-3 text-[#F5C76A] drop-shadow-[0_0_4px_rgba(245,199,106,0.4)]" />
                <span className="text-[11px] text-white/70">Restaurierung</span>
              </div>
              <Switch
                checked={restoration.enabled}
                onCheckedChange={(v) => onRestorationChange(v, restoration.level)}
                className="scale-75"
              />
            </div>
            {restoration.enabled && (
              <Select
                value={restoration.level}
                onValueChange={(v) => onRestorationChange(true, v)}
              >
                <SelectTrigger className="h-7 text-[10px] bg-[#0a0a1a]/80 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0a1a] border-white/10">
                  <SelectItem value="light" className="text-white text-xs">Leicht</SelectItem>
                  <SelectItem value="standard" className="text-white text-xs">Standard</SelectItem>
                  <SelectItem value="heavy" className="text-white text-xs">Intensiv</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
};
