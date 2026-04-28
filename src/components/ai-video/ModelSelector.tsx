import { useMemo } from 'react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AI_VIDEO_TOOLKIT_MODELS,
  TOOLKIT_GROUP_LABELS,
  type ToolkitModel,
  type ToolkitModelGroup,
} from '@/config/aiVideoModelRegistry';
import type { Currency } from '@/config/pricing';
import { useTranslation } from '@/hooks/useTranslation';
import { Lock } from 'lucide-react';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  currency: Currency;
  hasSora2Access: boolean;
  /** Optional subset of toolkit models. Defaults to the full registry. */
  models?: ToolkitModel[];
  /** Optional className for the trigger (e.g. compact size). */
  className?: string;
}

const GROUP_ORDER: ToolkitModelGroup[] = ['recommended', 'audio', 'fast', 'premium'];

export function ModelSelector({ value, onChange, currency, hasSora2Access, models, className }: ModelSelectorProps) {
  const { language } = useTranslation();
  const lang = (['de', 'en', 'es'].includes(language) ? language : 'en') as 'de' | 'en' | 'es';
  const symbol = currency === 'USD' ? '$' : '€';
  const list = models ?? AI_VIDEO_TOOLKIT_MODELS;

  const grouped = useMemo(() => {
    const map: Record<ToolkitModelGroup, ToolkitModel[]> = {
      recommended: [], audio: [], fast: [], premium: [],
    };
    list.forEach((m) => {
      map[m.group].push(m);
    });
    return map;
  }, [list]);

  const selected = list.find((m) => m.id === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? "h-14 bg-card/60 backdrop-blur-sm border-border/60 hover:border-primary/40 transition-colors"}>
        <SelectValue placeholder="Modell wählen…">
          {selected && (
            <div className="flex items-center gap-3 text-left">
              <div className="p-1.5 rounded-md bg-primary/10">
                <selected.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{selected.name}</span>
                  {selected.badge && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                      {selected.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {selected.provider} · {selected.resolution} · {symbol}{selected.costPerSecond[currency].toFixed(2)}/s
                </p>
              </div>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[480px] bg-card/95 backdrop-blur-xl border-border/60">
        {GROUP_ORDER.map((g) => {
          const models = grouped[g];
          if (!models.length) return null;
          return (
            <SelectGroup key={g}>
              <SelectLabel className="text-[11px] uppercase tracking-wider text-primary/80">
                {TOOLKIT_GROUP_LABELS[g][lang]}
              </SelectLabel>
              {models.map((m) => {
                const locked = m.requiresAccess === 'sora2' && !hasSora2Access;
                return (
                  <SelectItem
                    key={m.id}
                    value={m.id}
                    disabled={locked}
                    className="py-2.5"
                  >
                    <div className="flex items-center gap-3 w-full">
                      <m.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{m.name}</span>
                          {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                          {m.badge && !locked && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-primary/30">
                              {m.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {m.tagline} · {m.resolution}
                        </p>
                      </div>
                      <span className="text-[11px] tabular-nums text-primary font-medium shrink-0">
                        {symbol}{m.costPerSecond[currency].toFixed(2)}/s
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
