import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { REALISM_PRESETS, type RealismPresetId, getRealismPreset } from '@/config/cinematicRealismPresets';
import { cn } from '@/lib/utils';

interface Props {
  value?: RealismPresetId | null;
  onChange: (id: RealismPresetId | null) => void;
  /** When true: apply via "Apply to all scenes" mode (parent decides). */
  onApplyToAll?: (id: RealismPresetId) => void;
  className?: string;
}

const STRINGS = {
  trigger: 'Realismus',
  none: 'Kein Preset',
  noneDesc: 'Kein Realismus-Preset – Scene-Director arbeitet ohne Voreinstellung.',
  applyAll: 'Auf alle Szenen anwenden',
};

export function RealismPresetPicker({ value, onChange, onApplyToAll, className }: Props) {
  const active = getRealismPreset(value ?? undefined);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-7 gap-1.5 text-[11px] px-2',
            active && 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15',
            className,
          )}
        >
          <span>{active ? active.glyph : '🎬'}</span>
          <span className="font-medium">{active ? active.label : STRINGS.trigger}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => onChange(null)}
            className={cn(
              'w-full rounded-md border border-transparent p-2 text-left transition hover:bg-muted/60',
              !value && 'border-primary/30 bg-primary/5',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{STRINGS.none}</span>
              {!value && <Check className="h-3.5 w-3.5 text-primary" />}
            </div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{STRINGS.noneDesc}</p>
          </button>
          {REALISM_PRESETS.map((p) => {
            const selected = value === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(p.id)}
                className={cn(
                  'w-full rounded-md border border-transparent p-2 text-left transition hover:bg-muted/60',
                  selected && 'border-amber-500/40 bg-amber-500/10',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{p.glyph}</span>
                    <span className="text-xs font-medium">{p.label}</span>
                  </div>
                  {selected && <Check className="h-3.5 w-3.5 text-amber-400" />}
                </div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{p.description}</p>
              </button>
            );
          })}
        </div>
        {onApplyToAll && value && (
          <div className="mt-2 border-t border-border pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-[11px]"
              onClick={() => onApplyToAll(value)}
            >
              {STRINGS.applyAll}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default RealismPresetPicker;
