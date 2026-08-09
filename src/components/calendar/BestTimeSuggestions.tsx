import { useMemo } from "react";
import { format } from "date-fns";
import { de, enUS, es } from "date-fns/locale";
import { Clock, Sparkles } from "lucide-react";
import { usePostingTimes } from "@/hooks/usePostingTimes";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { tx } from '@/lib/i18nText';

interface BestTimeSuggestionsProps {
  /** Kanäle des Beitrags — der erste bestimmt die Prognose. */
  channels: string[];
  /** Wird mit dem gewählten Zeitpunkt aufgerufen. */
  onPick: (date: Date) => void;
  className?: string;
}

const COPY = {
  de: { title: "Empfohlene Zeiten", veryGood: "sehr gut", good: "gut", ok: "okay", empty: "Wähle einen Kanal für Zeitempfehlungen." },
  en: { title: "Recommended times", veryGood: "very good", good: "good", ok: "okay", empty: "Pick a channel to see time recommendations." },
  es: { title: "Horarios recomendados", veryGood: "muy bueno", good: "bueno", ok: "aceptable", empty: "Elige un canal para ver recomendaciones." },
} as const;

const localeMap = { de, en: enUS, es } as const;

/**
 * Drei konkrete Terminvorschläge direkt im Planungsdialog —
 * gespeist aus derselben Prognose wie die Ansicht „Beste Zeiten“.
 */
export function BestTimeSuggestions({ channels, onPick, className }: BestTimeSuggestionsProps) {
  const { language } = useTranslation();
  const copy = COPY[(language as keyof typeof COPY)] ?? COPY.de;
  const dateLocale = localeMap[(language as keyof typeof localeMap)] ?? de;

  const platform = channels[0]?.toLowerCase() ?? "";
  const { data, isLoading } = usePostingTimes({
    platform,
    days: 7,
    enabled: Boolean(platform),
  });

  const top = useMemo(() => {
    const days = data?.platforms?.[platform] ?? [];
    const now = Date.now();
    return days
      .flatMap((day) => day.slots ?? [])
      .filter((slot) => new Date(slot.start).getTime() > now)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [data, platform]);

  if (!platform) {
    return <p className={cn("text-xs text-muted-foreground", className)}>{copy.empty}</p>;
  }

  if (isLoading || top.length === 0) return null;

  const rating = (score: number) => (score >= 80 ? copy.veryGood : score >= 60 ? copy.good : copy.ok);

  return (
    <div className={cn("rounded-xl border border-primary/20 bg-primary/5 p-3", className)}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        {copy.title}
      </div>
      <div className="flex flex-wrap gap-2">
        {top.map((slot) => {
          const date = new Date(slot.start);
          return (
            <button
              key={slot.start}
              type="button"
              onClick={() => onPick(date)}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-background/60 px-3 py-1.5 text-xs transition-colors hover:border-primary/50 hover:text-primary"
            >
              <Clock className="h-3.5 w-3.5" />
              {format(date, "EEE, dd.MM. HH:mm", { locale: dateLocale })}
              <span className="text-muted-foreground">· {rating(slot.score)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
