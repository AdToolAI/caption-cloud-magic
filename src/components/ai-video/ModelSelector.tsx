import { tx } from "@/lib/i18nText";
import { useMemo } from 'react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AI_VIDEO_TOOLKIT_MODELS,
  TOOLKIT_GROUP_LABELS,
  SPEC_GROUP_LABELS,
  LEGACY_GROUP_TO_SPEC_GROUP,
  type ToolkitModel,
  type ToolkitModelGroup,
} from '@/config/aiVideoModelRegistry';
import {
  UI_GROUP_ORDER,
  getVideoModelSpec,
  maxNativeResolution,
  nativeResolutionLabels,
  type UiGroup,
} from '@/config/videoModelSpecs';
import type { Currency } from '@/config/pricing';
import { useTranslation } from '@/hooks/useTranslation';
import { Lock, Wrench, Crown } from 'lucide-react';
import { isPremiumEngine } from '@/lib/cost/videoProviderMargins';
import { useVideoPricingCatalog } from '@/hooks/useVideoPricingCatalog';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  currency: Currency;
  /** @deprecated Sora 2 wurde nach OpenAI-Sunset entfernt — Prop wird ignoriert. */
  hasSora2Access?: boolean;
  /** Optional subset of toolkit models. Defaults to the full registry. */
  models?: ToolkitModel[];
  /** Optional className for the trigger (e.g. compact size). */
  className?: string;
  /** Model ids that should render as disabled (e.g. locked by placement mode). */
  lockedModelIds?: string[];
  /** Tooltip / hint shown when a lockedModelIds entry is hovered. */
  lockedReason?: string;
}

/** Kept for backwards compatibility with callers that still read it. */
const GROUP_ORDER: ToolkitModelGroup[] = ['recommended', 'audio', 'fast', 'premium'];
void GROUP_ORDER;

/** Spec group of a model — falls back to the legacy group when no spec exists. */
function specGroupOf(m: ToolkitModel): UiGroup {
  const spec = getVideoModelSpec(m.id);
  if (spec) return spec.uiGroup;
  return LEGACY_GROUP_TO_SPEC_GROUP[m.group];
}

/** Exact native resolution line: "1080p · 1920x1080 (quer) / 1080x1920 (hoch)". */
function resolutionLine(m: ToolkitModel): string {
  const spec = getVideoModelSpec(m.id);
  const best = spec && maxNativeResolution(spec);
  if (!spec || !best) return m.resolution;
  const labels = nativeResolutionLabels(spec).join(' / ');
  return `${labels} · ${best.landscape.width}×${best.landscape.height} / ${best.portrait.width}×${best.portrait.height}`;
}

/** Keep the controlled value visible even while a feature-filtered model list
 * is still resolving. This prevents Radix Select from displaying a stale
 * previous label when the selected model is temporarily absent. */
export function includeSelectedModel(models: ToolkitModel[], value: string): ToolkitModel[] {
  if (!value || models.some((model) => model.id === value)) return models;
  const canonical = AI_VIDEO_TOOLKIT_MODELS.find((model) => model.id === value);
  return canonical ? [canonical, ...models] : models;
}

export function ModelSelector({ value, onChange, currency, models, className, lockedModelIds, lockedReason }: ModelSelectorProps) {
  const { language } = useTranslation();
  const lang = (['de', 'en', 'es'].includes(language) ? language : 'en') as 'de' | 'en' | 'es';
  const { getPricePerSecond, walletCurrency } = useVideoPricingCatalog();
  // Prices follow the wallet currency (USD carries the FX uplift), not the UI language.
  const billingCurrency = walletCurrency ?? currency;
  const symbol = billingCurrency === 'USD' ? '$' : '€';
  const list = useMemo(
    () => includeSelectedModel(models ?? AI_VIDEO_TOOLKIT_MODELS, value),
    [models, value],
  );
  // Canonical price (from server catalog) with local-config fallback.
  const priceFor = (m: ToolkitModel) =>
    getPricePerSecond(m.id, billingCurrency) ?? m.costPerSecond[billingCurrency];

  const grouped = useMemo(() => {
    const map: Record<UiGroup, ToolkitModel[]> = {
      flagship: [], professional: [], audio: [], fast: [], economy: [], legacy: [],
    };
    list.forEach((m) => {
      map[specGroupOf(m)].push(m);
    });
    // Innerhalb der Gruppe: höchste native Auflösung zuerst.
    for (const key of Object.keys(map) as UiGroup[]) {
      const edge = (m: ToolkitModel) => {
        const spec = getVideoModelSpec(m.id);
        return (spec && maxNativeResolution(spec)?.shortEdge) || 0;
      };
      map[key].sort((a, b) => edge(b) - edge(a));
    }
    return map;
  }, [list]);

  const selected = list.find((m) => m.id === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? "h-14 bg-card/60 backdrop-blur-sm border-border/60 hover:border-primary/40 transition-colors"}>
        <SelectValue placeholder={tx({ de: "Modell wählen…", en: "Select model…", es: "Seleccionar modelo…" })}>
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
                  {selected.provider} · {selected.resolution} · {symbol}{priceFor(selected).toFixed(2)}/s
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
                const isMaintenance = m.status === 'maintenance';
                const isComingSoon = m.status === 'coming_soon';
                const isPlacementLocked = !!lockedModelIds?.includes(m.id);
                const locked = isMaintenance || isComingSoon || isPlacementLocked;
                const lockTitle = isPlacementLocked
                  ? lockedReason
                  : (locked ? m.statusReason : undefined);
                return (
                  <SelectItem
                    key={m.id}
                    value={m.id}
                    disabled={locked}
                    className="py-2.5"
                    title={lockTitle}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <m.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{m.name}</span>
                          {isMaintenance && <Wrench className="h-3 w-3 text-amber-400" />}
                          {isComingSoon && <Lock className="h-3 w-3 text-muted-foreground" />}
                          {isPremiumEngine(m.id) && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 h-3.5 border-amber-400/40 text-amber-300 gap-0.5"
                              title={tx({ de: "Premium-Engine: echte Provider-Kosten werden direkt durchgereicht", en: "Premium engine: real provider costs are passed on directly", es: "Motor premium: los costes reales del proveedor se repercuten directamente" })}
                            >
                              <Crown className="h-2.5 w-2.5" />
                              Premium-Engine
                            </Badge>
                          )}
                          {m.badge && (
                            <Badge
                              variant="outline"
                              className={
                                isMaintenance
                                  ? "text-[9px] px-1 py-0 h-3.5 border-amber-400/40 text-amber-400"
                                  : "text-[9px] px-1 py-0 h-3.5 border-primary/30"
                              }
                            >
                              {m.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {locked && m.statusReason ? m.statusReason : `${m.tagline} · ${m.resolution}`}
                        </p>
                      </div>
                      <span className="text-[11px] tabular-nums text-primary font-medium shrink-0">
                        {symbol}{priceFor(m).toFixed(2)}/s
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
