import React from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Zap, Gauge, Move, ArrowUpCircle, Film } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FXPanelProps {
  chromaKey: { enabled: boolean; color: string; tolerance: number; backgroundUrl?: string };
  onChromaKeyChange: (ck: { enabled: boolean; color: string; tolerance: number; backgroundUrl?: string }) => void;
  upscaling: { enabled: boolean; targetResolution: string };
  onUpscalingChange: (enabled: boolean, resolution: string) => void;
  interpolation: { enabled: boolean; targetFps: number };
  onInterpolationChange: (enabled: boolean, fps: number) => void;
  restoration: { enabled: boolean; level: string };
  onRestorationChange: (enabled: boolean, level: string) => void;
}

export const FXPanel: React.FC<FXPanelProps> = ({
  chromaKey,
  onChromaKeyChange,
  upscaling,
  onUpscalingChange,
  interpolation,
  onInterpolationChange,
  restoration,
  onRestorationChange,
}) => {
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#00d4ff]" />
          <span className="text-sm font-medium text-white">Effekte & Qualität</span>
        </div>

        {/* Green Screen / Chroma Key */}
        <div className="space-y-2 p-2.5 rounded bg-[#2a2a2a] border border-[#3a3a3a]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Film className="h-3 w-3 text-green-400" />
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
                  className="w-6 h-6 rounded cursor-pointer border border-[#3a3a3a]"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-[10px] text-white/50">Toleranz</label>
                  <span className="text-[10px] text-white/40">{chromaKey.tolerance}%</span>
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
        <div className="border-t border-[#3a3a3a] pt-3 space-y-3">
          <span className="text-xs text-white/50 font-medium uppercase tracking-wider">Qualität</span>

          {/* Upscaling */}
          <div className="space-y-2 p-2.5 rounded bg-[#2a2a2a] border border-[#3a3a3a]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ArrowUpCircle className="h-3 w-3 text-purple-400" />
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
                <SelectTrigger className="h-7 text-[10px] bg-[#1e1e1e] border-[#3a3a3a] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
                  <SelectItem value="1080p" className="text-white text-xs">1080p</SelectItem>
                  <SelectItem value="2k" className="text-white text-xs">2K</SelectItem>
                  <SelectItem value="4k" className="text-white text-xs">4K</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Frame Interpolation */}
          <div className="space-y-2 p-2.5 rounded bg-[#2a2a2a] border border-[#3a3a3a]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Gauge className="h-3 w-3 text-cyan-400" />
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
                <SelectTrigger className="h-7 text-[10px] bg-[#1e1e1e] border-[#3a3a3a] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
                  <SelectItem value="48" className="text-white text-xs">48 fps</SelectItem>
                  <SelectItem value="60" className="text-white text-xs">60 fps</SelectItem>
                  <SelectItem value="120" className="text-white text-xs">120 fps</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Restoration */}
          <div className="space-y-2 p-2.5 rounded bg-[#2a2a2a] border border-[#3a3a3a]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Move className="h-3 w-3 text-amber-400" />
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
                <SelectTrigger className="h-7 text-[10px] bg-[#1e1e1e] border-[#3a3a3a] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
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
