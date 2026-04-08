import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Palette, Sun, Contrast, Droplets, Thermometer, Eye } from 'lucide-react';
import { GlobalEffects, FilterId } from '@/types/directors-cut';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LookPanelProps {
  effects: GlobalEffects;
  onEffectsChange: (effects: GlobalEffects) => void;
  colorGrading: { enabled: boolean; grade: string | null; intensity: number };
  onColorGradingChange: (enabled: boolean, grade: string | null, intensity?: number) => void;
  styleTransfer: { enabled: boolean; style: string | null; intensity: number };
  onStyleTransferChange: (enabled: boolean, style: string | null) => void;
  selectedSceneId: string | null;
}

const FILTER_PRESETS: { id: string; name: string; icon: string; css: string }[] = [
  { id: 'none', name: 'Original', icon: '🎬', css: '' },
  { id: 'cinematic', name: 'Cinematic', icon: '🎥', css: 'contrast(1.2) saturate(0.85)' },
  { id: 'vintage', name: 'Vintage', icon: '📷', css: 'sepia(0.4) contrast(1.1)' },
  { id: 'noir', name: 'Film Noir', icon: '🖤', css: 'grayscale(1) contrast(1.4)' },
  { id: 'warm', name: 'Warm', icon: '🌅', css: 'saturate(1.3) hue-rotate(-10deg)' },
  { id: 'cool', name: 'Cool', icon: '❄️', css: 'saturate(0.9) hue-rotate(15deg)' },
  { id: 'vivid', name: 'Vivid', icon: '🌈', css: 'saturate(1.6) contrast(1.1)' },
  { id: 'muted', name: 'Muted', icon: '🌫️', css: 'saturate(0.5) brightness(1.05)' },
];

const COLOR_GRADES: { id: string; name: string; icon: string }[] = [
  { id: 'none', name: 'Keine', icon: '⚪' },
  { id: 'teal_orange', name: 'Teal & Orange', icon: '🟠' },
  { id: 'moonlight', name: 'Moonlight', icon: '🌙' },
  { id: 'golden_hour', name: 'Golden Hour', icon: '🌅' },
  { id: 'matrix', name: 'Matrix', icon: '💚' },
  { id: 'bleach_bypass', name: 'Bleach Bypass', icon: '🔲' },
];

export const LookPanel: React.FC<LookPanelProps> = ({
  effects,
  onEffectsChange,
  colorGrading,
  onColorGradingChange,
  styleTransfer,
  onStyleTransferChange,
  selectedSceneId,
}) => {
  const updateEffect = (key: keyof GlobalEffects, value: number) => {
    onEffectsChange({ ...effects, [key]: value });
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-[#00d4ff]" />
          <span className="text-sm font-medium text-white">Look & Farbe</span>
        </div>

        {selectedSceneId && (
          <p className="text-[10px] text-amber-400/80">
            ⚠️ Änderungen gelten global. Szenen-spezifische Effekte folgen.
          </p>
        )}

        {/* Filter Presets */}
        <div className="space-y-2">
          <span className="text-xs text-white/50 font-medium uppercase tracking-wider">Filter</span>
          <div className="grid grid-cols-4 gap-1.5">
            {FILTER_PRESETS.map(filter => (
              <button
                key={filter.id}
                onClick={() => {
                  const filterId = filter.id === 'none' ? undefined : filter.id;
                  onEffectsChange({ ...effects, filter: filterId as FilterId | undefined });
                }}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors text-center",
                  effects.filter === filter.id || (!effects.filter && filter.id === 'none')
                    ? "bg-[#00d4ff]/20 border border-[#00d4ff]/50"
                    : "bg-[#2a2a2a] border border-transparent hover:bg-[#333]"
                )}
              >
                <span className="text-lg">{filter.icon}</span>
                <span className="text-[9px] text-white/70">{filter.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Color Grading */}
        <div className="space-y-2 border-t border-[#3a3a3a] pt-3">
          <span className="text-xs text-white/50 font-medium uppercase tracking-wider">Color Grading</span>
          <div className="grid grid-cols-3 gap-1.5">
            {COLOR_GRADES.map(grade => (
              <button
                key={grade.id}
                onClick={() => {
                  if (grade.id === 'none') {
                    onColorGradingChange(false, null);
                  } else {
                    onColorGradingChange(true, grade.id);
                  }
                }}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
                  (colorGrading.enabled && colorGrading.grade === grade.id) || (!colorGrading.enabled && grade.id === 'none')
                    ? "bg-[#00d4ff]/20 border border-[#00d4ff]/50"
                    : "bg-[#2a2a2a] border border-transparent hover:bg-[#333]"
                )}
              >
                <span className="text-sm">{grade.icon}</span>
                <span className="text-[9px] text-white/70">{grade.name}</span>
              </button>
            ))}
          </div>
          {colorGrading.enabled && (
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-[10px] text-white/50">Intensität</label>
                <span className="text-[10px] text-white/40">{Math.round(colorGrading.intensity * 100)}%</span>
              </div>
              <Slider
                value={[colorGrading.intensity * 100]}
                onValueChange={([v]) => onColorGradingChange(true, colorGrading.grade, v / 100)}
                min={10}
                max={100}
                step={5}
                className="cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Manual Adjustments */}
        <div className="space-y-3 border-t border-[#3a3a3a] pt-3">
          <span className="text-xs text-white/50 font-medium uppercase tracking-wider">Anpassungen</span>

          {/* Brightness */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Sun className="h-3 w-3 text-yellow-400/60" />
                <label className="text-[11px] text-white/70">Helligkeit</label>
              </div>
              <span className="text-[10px] text-white/40">{effects.brightness}%</span>
            </div>
            <Slider
              value={[effects.brightness]}
              onValueChange={([v]) => updateEffect('brightness', v)}
              min={50}
              max={150}
              step={1}
              className="cursor-pointer"
            />
          </div>

          {/* Contrast */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Contrast className="h-3 w-3 text-white/60" />
                <label className="text-[11px] text-white/70">Kontrast</label>
              </div>
              <span className="text-[10px] text-white/40">{effects.contrast}%</span>
            </div>
            <Slider
              value={[effects.contrast]}
              onValueChange={([v]) => updateEffect('contrast', v)}
              min={50}
              max={150}
              step={1}
              className="cursor-pointer"
            />
          </div>

          {/* Saturation */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Droplets className="h-3 w-3 text-blue-400/60" />
                <label className="text-[11px] text-white/70">Sättigung</label>
              </div>
              <span className="text-[10px] text-white/40">{effects.saturation}%</span>
            </div>
            <Slider
              value={[effects.saturation]}
              onValueChange={([v]) => updateEffect('saturation', v)}
              min={0}
              max={200}
              step={1}
              className="cursor-pointer"
            />
          </div>

          {/* Temperature */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Thermometer className="h-3 w-3 text-orange-400/60" />
                <label className="text-[11px] text-white/70">Temperatur</label>
              </div>
              <span className="text-[10px] text-white/40">{effects.temperature}</span>
            </div>
            <Slider
              value={[effects.temperature + 50]}
              onValueChange={([v]) => updateEffect('temperature', v - 50)}
              min={0}
              max={100}
              step={1}
              className="cursor-pointer"
            />
          </div>

          {/* Vignette */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Eye className="h-3 w-3 text-white/40" />
                <label className="text-[11px] text-white/70">Vignette</label>
              </div>
              <span className="text-[10px] text-white/40">{effects.vignette}%</span>
            </div>
            <Slider
              value={[effects.vignette]}
              onValueChange={([v]) => updateEffect('vignette', v)}
              min={0}
              max={100}
              step={1}
              className="cursor-pointer"
            />
          </div>

          {/* Reset */}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-[10px] border-[#3a3a3a] text-white/50 hover:bg-[#333]"
            onClick={() => onEffectsChange({
              brightness: 100, contrast: 100, saturation: 100,
              sharpness: 0, temperature: 0, vignette: 0,
            })}
          >
            Auf Standard zurücksetzen
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
};
