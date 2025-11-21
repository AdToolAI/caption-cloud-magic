import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Youtube, Instagram, Music2, Facebook, Linkedin } from 'lucide-react';
import type { FormatConfig, PlatformPreset } from '@/types/universal-creator';

const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    platform: 'youtube',
    description: 'Standard Video',
    formats: [{ label: '16:9 HD', aspectRatio: '16:9', width: 1920, height: 1080 }],
    icon: 'youtube',
    color: 'bg-red-500'
  },
  {
    id: 'youtube-shorts',
    name: 'YouTube',
    platform: 'youtube-shorts',
    description: 'Shorts',
    formats: [{ label: '9:16 Vertikal', aspectRatio: '9:16', width: 1080, height: 1920 }],
    icon: 'youtube',
    color: 'bg-red-500'
  },
  {
    id: 'instagram',
    name: 'Instagram',
    platform: 'instagram',
    description: 'Feed & Stories',
    formats: [
      { label: '1:1 Quadrat', aspectRatio: '1:1', width: 1080, height: 1080 },
      { label: '9:16 Story', aspectRatio: '9:16', width: 1080, height: 1920 },
      { label: '4:5 Portrait', aspectRatio: '4:5', width: 1080, height: 1350 }
    ],
    icon: 'instagram',
    color: 'bg-gradient-to-br from-purple-500 to-pink-500'
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    platform: 'tiktok',
    description: 'Vertikal',
    formats: [{ label: '9:16 Vertikal', aspectRatio: '9:16', width: 1080, height: 1920 }],
    icon: 'music',
    color: 'bg-black'
  },
  {
    id: 'facebook',
    name: 'Facebook',
    platform: 'facebook',
    description: 'Feed & Stories',
    formats: [
      { label: '16:9 Landscape', aspectRatio: '16:9', width: 1920, height: 1080 },
      { label: '1:1 Quadrat', aspectRatio: '1:1', width: 1080, height: 1080 }
    ],
    icon: 'facebook',
    color: 'bg-blue-600'
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    platform: 'linkedin',
    description: 'Professional',
    formats: [
      { label: '16:9 Landscape', aspectRatio: '16:9', width: 1920, height: 1080 },
      { label: '1:1 Quadrat', aspectRatio: '1:1', width: 1080, height: 1080 }
    ],
    icon: 'linkedin',
    color: 'bg-blue-700'
  }
];

interface FormatSelectionStepProps {
  value: FormatConfig | null;
  onChange: (config: FormatConfig) => void;
}

export const FormatSelectionStep = ({ value, onChange }: FormatSelectionStepProps) => {
  const handlePresetSelect = (preset: PlatformPreset, formatIndex: number = 0) => {
    const format = preset.formats[formatIndex];
    onChange({
      platform: preset.platform,
      aspectRatio: format.aspectRatio,
      width: format.width,
      height: format.height,
      duration: value?.duration || 30,
      fps: value?.fps || 30
    });
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'youtube': return Youtube;
      case 'instagram': return Instagram;
      case 'music': return Music2;
      case 'facebook': return Facebook;
      case 'linkedin': return Linkedin;
      default: return Youtube;
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform Presets */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Plattform wählen</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {PLATFORM_PRESETS.map((preset) => {
            const Icon = getIcon(preset.icon);
            const isSelected = value?.platform === preset.platform;
            
            return (
              <div key={preset.id} className="space-y-2">
                <Card 
                  className={`p-4 cursor-pointer transition-all hover:shadow-lg ${
                    isSelected ? 'ring-2 ring-primary shadow-lg' : ''
                  }`}
                  onClick={() => handlePresetSelect(preset)}
                >
                  <div className="flex flex-col items-center text-center space-y-2">
                    <div className={`w-12 h-12 rounded-lg ${preset.color} flex items-center justify-center`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{preset.name}</h3>
                      <p className="text-xs text-muted-foreground">{preset.description}</p>
                    </div>
                  </div>
                </Card>
                
                {/* Format variants for selected platform */}
                {isSelected && preset.formats.length > 1 && (
                  <div className="space-y-1">
                    {preset.formats.map((format, idx) => (
                      <button
                        key={idx}
                        onClick={() => handlePresetSelect(preset, idx)}
                        className={`w-full text-xs px-3 py-2 rounded-md transition-colors ${
                          value?.aspectRatio === format.aspectRatio
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80'
                        }`}
                      >
                        {format.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Manual Settings */}
      {value && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Erweiterte Einstellungen</h2>
          <div className="space-y-6">
            {/* Aspect Ratio */}
            <div className="space-y-2">
              <Label>Seitenverhältnis</Label>
              <Select 
                value={value.aspectRatio}
                onValueChange={(ratio) => {
                  const ratioMap: Record<string, { width: number; height: number }> = {
                    '16:9': { width: 1920, height: 1080 },
                    '9:16': { width: 1080, height: 1920 },
                    '1:1': { width: 1080, height: 1080 },
                    '4:5': { width: 1080, height: 1350 },
                    '4:3': { width: 1440, height: 1080 }
                  };
                  const dimensions = ratioMap[ratio as FormatConfig['aspectRatio']];
                  onChange({ ...value, aspectRatio: ratio as FormatConfig['aspectRatio'], ...dimensions });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                  <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                  <SelectItem value="1:1">1:1 (Quadrat)</SelectItem>
                  <SelectItem value="4:5">4:5 (Instagram)</SelectItem>
                  <SelectItem value="4:3">4:3 (Classic)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Dauer (Sekunden)</Label>
                <span className="text-sm text-muted-foreground">{value.duration}s</span>
              </div>
              <Slider
                value={[value.duration]}
                onValueChange={([duration]) => onChange({ ...value, duration })}
                min={5}
                max={300}
                step={5}
              />
            </div>

            {/* FPS */}
            <div className="space-y-2">
              <Label>Frame Rate (FPS)</Label>
              <Select 
                value={String(value.fps)}
                onValueChange={(fps) => onChange({ ...value, fps: Number(fps) as 30 | 60 })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 FPS (Standard)</SelectItem>
                  <SelectItem value="60">60 FPS (Smooth)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Resolution Display */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Auflösung:</span>
                  <p className="font-medium">{value.width}x{value.height}px</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Geschätzte Größe:</span>
                  <p className="font-medium">
                    ~{Math.round((value.width * value.height * value.duration * 0.0001) / 10) * 10}MB
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
