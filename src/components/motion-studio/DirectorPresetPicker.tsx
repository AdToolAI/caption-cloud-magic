import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, X, Wand2 } from 'lucide-react';
import {
  CATEGORY_LABELS,
  DIRECTOR_PRESETS,
  PRESETS_BY_CATEGORY,
  applyDirectorModifiers,
  getPresetById,
  type DirectorModifiers,
  type PresetCategory,
} from '@/lib/motion-studio/directorPresets';

interface DirectorPresetPickerProps {
  modifiers: DirectorModifiers;
  basePrompt: string;
  onChange: (modifiers: DirectorModifiers, mergedPrompt: string) => void;
}

const CATEGORY_ORDER: PresetCategory[] = ['camera', 'lens', 'lighting', 'mood', 'film-stock'];

/**
 * Director Preset Picker — Phase 3.
 *
 * Lets the user attach professional cinematography modifiers to an AI scene
 * prompt: camera, lens, lighting, color grade, film stock. Modifier phrases
 * are appended to the base prompt deterministically (so the user always sees
 * what gets sent to Sora/Kling/Hailuo).
 */
export default function DirectorPresetPicker({
  modifiers,
  basePrompt,
  onChange,
}: DirectorPresetPickerProps) {
  const activeCount = Object.values(modifiers).filter(Boolean).length;

  const activeChips = useMemo(() => {
    return CATEGORY_ORDER
      .map((cat) => {
        const key = cat === 'film-stock' ? 'filmStock' : cat;
        const preset = getPresetById(modifiers[key as keyof DirectorModifiers]);
        return preset ? { cat, preset, key } : null;
      })
      .filter(Boolean) as Array<{ cat: PresetCategory; preset: typeof DIRECTOR_PRESETS[number]; key: string }>;
  }, [modifiers]);

  const togglePreset = (cat: PresetCategory, presetId: string) => {
    const key = cat === 'film-stock' ? 'filmStock' : cat;
    const next: DirectorModifiers = { ...modifiers };
    if (next[key as keyof DirectorModifiers] === presetId) {
      delete next[key as keyof DirectorModifiers];
    } else {
      (next as any)[key] = presetId;
    }
    const merged = applyDirectorModifiers(basePrompt, next);
    onChange(next, merged);
  };

  const clearAll = () => {
    onChange({}, basePrompt);
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
          <Wand2 className="h-3 w-3" />
          Director Presets
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              {activeCount}
            </Badge>
          )}
        </div>
        <div className="flex gap-1">
          {activeCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={clearAll}
            >
              Reset
            </Button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1">
                <Sparkles className="h-3 w-3" />
                {activeCount > 0 ? 'Anpassen' : 'Hinzufügen'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0" align="end">
              <Tabs defaultValue="camera">
                <TabsList className="grid w-full grid-cols-5 rounded-none">
                  {CATEGORY_ORDER.map((cat) => (
                    <TabsTrigger key={cat} value={cat} className="text-[10px] px-1">
                      {CATEGORY_LABELS[cat]}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {CATEGORY_ORDER.map((cat) => {
                  const key = cat === 'film-stock' ? 'filmStock' : cat;
                  const activeId = modifiers[key as keyof DirectorModifiers];
                  return (
                    <TabsContent key={cat} value={cat} className="mt-0 max-h-[320px] overflow-y-auto p-2">
                      <div className="grid gap-1.5">
                        {PRESETS_BY_CATEGORY[cat].map((preset) => {
                          const isActive = activeId === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => togglePreset(cat, preset.id)}
                              className={`flex items-start gap-2 rounded-md border p-2 text-left transition-colors ${
                                isActive
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border hover:border-primary/40 hover:bg-muted/50'
                              }`}
                            >
                              <span className="text-base leading-none mt-0.5">{preset.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium">{preset.label}</div>
                                <div className="text-[10px] text-muted-foreground line-clamp-2">
                                  {preset.description}
                                </div>
                                <div className="mt-1 text-[9px] font-mono text-primary/80 line-clamp-1">
                                  {preset.modifier}
                                </div>
                              </div>
                              {isActive && (
                                <Badge variant="default" className="h-4 px-1 text-[9px] shrink-0">
                                  Aktiv
                                </Badge>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeChips.map(({ cat, preset, key }) => (
            <Badge
              key={preset.id}
              variant="secondary"
              className="h-5 gap-1 pr-1 text-[10px]"
            >
              <span>{preset.icon}</span>
              <span>{preset.label}</span>
              <button
                type="button"
                onClick={() => togglePreset(cat, preset.id)}
                className="ml-0.5 rounded-sm hover:bg-background/40 p-0.5"
                aria-label={`Remove ${preset.label}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
