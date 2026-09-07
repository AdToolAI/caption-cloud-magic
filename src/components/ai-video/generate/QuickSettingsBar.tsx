import { Check, Clock, Crop, Sparkle, Volume2, VolumeX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { tx } from '@/lib/i18nText';

/**
 * Compact chip row for the three settings every clip needs (duration, aspect
 * ratio, quality) plus the audio switch. Each chip opens the exact same option
 * list the previous three-column settings card offered — nothing was removed,
 * it just no longer occupies a full screen row.
 */
interface Option {
  value: string;
  label: string;
  /** Secondary line, e.g. the exact pixel frame "3840×2160". */
  hint?: string;
  /** Locked tier: rendered, but never selectable (no smoke test yet). */
  disabled?: boolean;
}

/** Native resolution tier as delivered by the canonical capability selector. */
export interface ResolutionChoice {
  label: string;
  startable: boolean;
  lockedReason?: string;
  /** Exact provider-backed frame for the current aspect ratio, if documented. */
  pixels?: string | null;
}

interface Props {
  duration: number;
  onDurationChange: (value: number) => void;
  durations: number[];
  smartDuration?: boolean;

  aspectRatio: string;
  onAspectRatioChange: (value: string) => void;
  aspectRatios: string[];

  resolution: string;
  onResolutionChange: (value: string) => void;
  resolutions?: string[];
  /**
   * Native tiers from the canonical registry (incl. locked ones). When set it
   * wins over `resolutions` — this is the technical truth the UI must show.
   */
  resolutionChoices?: ResolutionChoice[];
  /** Shown when the model offers exactly one resolution. */
  fixedResolution: string;
  /** Exact pixel frame of the current selection, e.g. "2160×3840". */
  pixelLabel?: string | null;

  audioSupported: boolean;
  audioEnabled: boolean;
  audioDisabled?: boolean;
  /**
   * The current mode produces no sound at all. The chip stays visible while
   * sound is still switched on so the user can switch it off — the request is
   * blocked meanwhile, never silently muted.
   */
  audioUnsupported?: boolean;
  onAudioChange: (value: boolean) => void;
}

function Chip({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors',
        active
          ? 'border-primary/50 bg-primary/10 text-foreground'
          : 'border-border/60 bg-background/40 text-foreground/80 hover:border-primary/40',
      )}
    >
      <span className="text-primary">{icon}</span>
      {label}
    </button>
  );
}

function OptionList({
  options,
  value,
  onSelect,
}: {
  options: Option[];
  value: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => { if (!o.disabled) onSelect(o.value); }}
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-primary/10',
            o.value === value && 'text-primary',
            o.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
          )}
        >
          <span className="flex flex-col">
            <span>{o.label}</span>
            {o.hint && <span className="text-[10px] text-muted-foreground">{o.hint}</span>}
          </span>
          {o.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
        </button>
      ))}
    </div>
  );
}

export function QuickSettingsBar({
  duration,
  onDurationChange,
  durations,
  smartDuration,
  aspectRatio,
  onAspectRatioChange,
  aspectRatios,
  resolution,
  onResolutionChange,
  resolutions,
  resolutionChoices,
  fixedResolution,
  pixelLabel,
  audioSupported,
  audioEnabled,
  audioDisabled,
  audioUnsupported,
  onAudioChange,
}: Props) {
  const maxDuration = durations.length ? Math.max(...durations) : 0;
  const durationOptions: Option[] = [
    ...durations.map((d) => ({ value: String(d), label: `${d}s` })),
    ...(smartDuration
      ? [{
          value: '-1',
          label: tx({
            de: `Auto (Modell entscheidet, max. ${maxDuration}s)`,
            en: `Auto (model decides, max ${maxDuration}s)`,
            es: `Auto (el modelo decide, máx. ${maxDuration}s)`,
          }),
        }]
      : []),
  ];
  const durationLabel = duration === -1
    ? tx({ de: 'Auto', en: 'Auto', es: 'Auto' })
    : `${duration}s`;

  const resolutionOptions: Option[] = resolutionChoices?.length
    ? resolutionChoices.map((r) => ({
        value: r.label,
        label: r.startable ? r.label : `${r.label} — ${tx({ de: 'gesperrt', en: 'locked', es: 'bloqueado' })}`,
        hint: r.startable ? (r.pixels ?? undefined) : r.lockedReason,
        disabled: !r.startable,
      }))
    : (resolutions ?? []).map((r) => ({ value: r, label: r }));
  const hasResolutionChoice = resolutionOptions.length > 1;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <div>
            <Chip icon={<Clock className="h-3.5 w-3.5" />} label={durationLabel} />
          </div>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1.5">
          <p className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {tx({ de: 'Dauer', en: 'Duration', es: 'Duración' })}
          </p>
          <OptionList
            options={durationOptions}
            value={String(duration)}
            onSelect={(v) => onDurationChange(Number(v))}
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <div>
            <Chip icon={<Crop className="h-3.5 w-3.5" />} label={aspectRatio} />
          </div>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-44 p-1.5">
          <p className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {tx({ de: 'Format', en: 'Aspect ratio', es: 'Formato' })}
          </p>
          <OptionList
            options={aspectRatios.map((a) => ({ value: a, label: a }))}
            value={aspectRatio}
            onSelect={onAspectRatioChange}
          />
        </PopoverContent>
      </Popover>

      {hasResolutionChoice ? (
        <Popover>
          <PopoverTrigger asChild>
            <div>
              <Chip
                icon={<Sparkle className="h-3.5 w-3.5" />}
                label={pixelLabel ? `${resolution} · ${pixelLabel}` : resolution}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1.5">
            <p className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {tx({ de: 'Qualität', en: 'Quality', es: 'Calidad' })}
            </p>
            <OptionList
              options={resolutionOptions}
              value={resolution}
              onSelect={onResolutionChange}
            />
          </PopoverContent>
        </Popover>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-3.5 py-2 text-xs font-medium text-muted-foreground">
          <Sparkle className="h-3.5 w-3.5 text-primary" />
          {fixedResolution}
        </span>
      )}

      {audioSupported && (
        <Chip
          icon={audioEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          active={audioEnabled}
          label={
            audioUnsupported
              ? tx({ de: 'Ton nicht möglich', en: 'Sound not available', es: 'Sonido no disponible' })
              : audioEnabled
              ? tx({ de: 'Ton an', en: 'Sound on', es: 'Sonido activado' })
              : tx({ de: 'Ton aus', en: 'Sound off', es: 'Sonido desactivado' })
          }
          onClick={() => { if (!audioDisabled) onAudioChange(!audioEnabled); }}
        />
      )}
    </div>
  );
}

export default QuickSettingsBar;
