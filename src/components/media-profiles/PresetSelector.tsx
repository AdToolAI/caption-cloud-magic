import { Platform } from '@/lib/mediaProfileSchema';
import { getPresetsForPlatform, PLATFORM_PRESETS } from '@/lib/mediaProfilePresets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

interface PresetSelectorProps {
  platform: Platform;
  onSelectPreset: (presetKey: string) => void;
  disabled?: boolean;
}

export function PresetSelector({ platform, onSelectPreset, disabled }: PresetSelectorProps) {
  const presets = getPresetsForPlatform(platform);

  if (presets.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Presets für {platform}</label>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset, idx) => {
          const presetKey = Object.keys(PLATFORM_PRESETS[platform])[idx];
          return (
            <Button
              key={presetKey}
              variant="outline"
              size="sm"
              onClick={() => onSelectPreset(presetKey)}
              disabled={disabled}
              className="group"
            >
              <Sparkles className="h-3 w-3 mr-1.5 group-hover:text-primary" />
              {preset.name}
              <Badge variant="secondary" className="ml-2 text-xs">
                {preset.config.type}
              </Badge>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
