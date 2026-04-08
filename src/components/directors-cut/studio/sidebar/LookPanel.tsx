import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Palette, Sun, Contrast, Droplets, Thermometer, Eye, ChevronDown, ChevronRight } from 'lucide-react';
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

const FILTER_CATEGORIES = [
  {
    name: 'Klassisch',
    filters: [
      { id: 'none', name: 'Original', icon: '🎬', css: '' },
      { id: 'cinematic', name: 'Cinematic', icon: '🎥', css: 'contrast(1.2) saturate(0.85)' },
      { id: 'vintage', name: 'Vintage', icon: '📷', css: 'sepia(0.4) contrast(1.1)' },
      { id: 'noir', name: 'Film Noir', icon: '🖤', css: 'grayscale(1) contrast(1.4)' },
      { id: 'muted', name: 'Muted', icon: '🌫️', css: 'saturate(0.5) brightness(1.05)' },
    ],
  },
  {
    name: 'Stimmung',
    filters: [
      { id: 'warm', name: 'Warm', icon: '🌅', css: 'saturate(1.3) hue-rotate(-10deg)' },
      { id: 'cool', name: 'Cool', icon: '❄️', css: 'saturate(0.9) hue-rotate(15deg)' },
      { id: 'golden_hour', name: 'Golden Hour', icon: '🌄', css: 'saturate(1.2) sepia(0.2) brightness(1.1)' },
      { id: 'dreamy', name: 'Dreamy', icon: '💫', css: 'brightness(1.1) contrast(0.9) saturate(0.8) blur(0.3px)' },
      { id: 'moody', name: 'Moody', icon: '🌑', css: 'brightness(0.85) contrast(1.3) saturate(0.7)' },
    ],
  },
  {
    name: 'Kreativ',
    filters: [
      { id: 'vivid', name: 'Vivid', icon: '🌈', css: 'saturate(1.6) contrast(1.1)' },
      { id: 'neon_nights', name: 'Neon Nights', icon: '🌃', css: 'brightness(0.9) contrast(1.4) saturate(1.5) hue-rotate(20deg)' },
      { id: 'cyberpunk', name: 'Cyberpunk', icon: '🤖', css: 'contrast(1.3) saturate(1.4) hue-rotate(-15deg) brightness(0.95)' },
      { id: 'cross_process', name: 'Cross Process', icon: '🔄', css: 'hue-rotate(30deg) saturate(1.3) contrast(1.1)' },
      { id: 'lomography', name: 'Lomo', icon: '📸', css: 'contrast(1.3) saturate(1.5) brightness(0.9)' },
    ],
  },
  {
    name: 'Film',
    filters: [
      { id: 'kodak_portra', name: 'Kodak Portra', icon: '🎞️', css: 'saturate(0.9) contrast(1.05) sepia(0.1) brightness(1.05)' },
      { id: 'fuji_velvia', name: 'Fuji Velvia', icon: '🏔️', css: 'saturate(1.4) contrast(1.2) brightness(0.95)' },
      { id: 'technicolor', name: 'Technicolor', icon: '🎭', css: 'saturate(1.5) contrast(1.15) hue-rotate(-5deg)' },
      { id: 'bleach_bypass', name: 'Bleach Bypass', icon: '⬜', css: 'saturate(0.4) contrast(1.4) brightness(1.05)' },
      { id: 'infrared', name: 'Infrared', icon: '🔴', css: 'hue-rotate(180deg) saturate(0.8) contrast(1.2)' },
    ],
  },
];

const COLOR_GRADES: { id: string; name: string; icon: string }[] = [
  { id: 'none', name: 'Keine', icon: '⚪' },
  { id: 'teal_orange', name: 'Teal & Orange', icon: '🟠' },
  { id: 'moonlight', name: 'Moonlight', icon: '🌙' },
  { id: 'golden_hour', name: 'Golden Hour', icon: '🌅' },
  { id: 'matrix', name: 'Matrix', icon: '💚' },
  { id: 'bleach_bypass', name: 'Bleach Bypass', icon: '🔲' },
  { id: 'hollywood_blue', name: 'Hollywood Blue', icon: '🔵' },
  { id: 'sunset_glow', name: 'Sunset Glow', icon: '🌇' },
  { id: 'forest_green', name: 'Forest Green', icon: '🌲' },
  { id: 'coral_reef', name: 'Coral Reef', icon: '🪸' },
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
  const [expandedCategory, setExpandedCategory] = useState<string>('Klassisch');

  const updateEffect = (key: keyof GlobalEffects, value: number) => {
    onEffectsChange({ ...effects, [key]: value });
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-[#F5C76A]" />
          <Palette className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]" />
          <span className="text-sm font-medium text-white">Look & Farbe</span>
        </div>

        {selectedSceneId && (
          <p className="text-[10px] text-[#F5C76A]/80">
            ⚠️ Änderungen gelten global. Szenen-spezifische Effekte folgen.
          </p>
        )}

        {/* Filter Presets — Categorized */}
        <div className="space-y-1">
          <span className="text-xs text-[#F5C76A]/60 font-medium uppercase tracking-wider">Filter</span>
          {FILTER_CATEGORIES.map(category => (
            <div key={category.name} className="space-y-1.5">
              <button
                onClick={() => setExpandedCategory(expandedCategory === category.name ? '' : category.name)}
                className="flex items-center gap-1.5 w-full text-left py-1 text-[11px] text-white/60 hover:text-white/90 transition-colors"
              >
                {expandedCategory === category.name ? (
                  <ChevronDown className="h-3 w-3 text-cyan-400" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <span>{category.name}</span>
                <span className="text-[9px] text-white/30 ml-auto">{category.filters.length}</span>
              </button>
              {expandedCategory === category.name && (
                <div className="grid grid-cols-4 gap-1.5 pl-1">
                  {category.filters.map(filter => {
                    const isActive = effects.filter === filter.id || (!effects.filter && filter.id === 'none');
                    return (
                      <button
                        key={filter.id}
                        onClick={() => {
                          const filterId = filter.id === 'none' ? undefined : filter.id;
                          onEffectsChange({ ...effects, filter: filterId as FilterId | undefined });
                        }}
                        className={cn(
                          "flex flex-col items-center gap-1 p-2 rounded-lg transition-all text-center border",
                          isActive
                            ? "bg-cyan-500/15 border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.15)]"
                            : "bg-[#0a0a1a]/60 border-white/5 hover:bg-white/5 hover:border-white/10"
                        )}
                      >
                        <span className="text-lg">{filter.icon}</span>
                        <span className={cn("text-[9px]", isActive ? "text-cyan-300" : "text-white/60")}>{filter.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Color Grading */}
        <div className="space-y-2 border-t border-[#F5C76A]/10 pt-3">
          <span className="text-xs text-[#F5C76A]/60 font-medium uppercase tracking-wider">Color Grading</span>
          <div className="grid grid-cols-3 gap-1.5">
            {COLOR_GRADES.map(grade => {
              const isActive = (colorGrading.enabled && colorGrading.grade === grade.id) || (!colorGrading.enabled && grade.id === 'none');
              return (
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
                    "flex flex-col items-center gap-1 p-2 rounded-lg transition-all border",
                    isActive
                      ? "bg-cyan-500/15 border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.15)]"
                      : "bg-[#0a0a1a]/60 border-white/5 hover:bg-white/5 hover:border-white/10"
                  )}
                >
                  <span className="text-sm">{grade.icon}</span>
                  <span className={cn("text-[9px]", isActive ? "text-cyan-300" : "text-white/60")}>{grade.name}</span>
                </button>
              );
            })}
          </div>
          {colorGrading.enabled && (
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-[10px] text-white/50">Intensität</label>
                <span className="text-[10px] text-cyan-400/60">{Math.round(colorGrading.intensity * 100)}%</span>
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
        <div className="space-y-3 border-t border-[#F5C76A]/10 pt-3">
          <span className="text-xs text-[#F5C76A]/60 font-medium uppercase tracking-wider">Anpassungen</span>

          {/* Brightness */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Sun className="h-3 w-3 text-[#F5C76A]/60" />
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
                <Droplets className="h-3 w-3 text-cyan-400/60" />
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
            className="w-full text-[10px] border-[#F5C76A]/20 text-white/50 hover:bg-[#F5C76A]/10 hover:text-[#F5C76A]/80"
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
