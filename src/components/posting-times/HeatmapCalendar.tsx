import { format, addDays, startOfDay } from 'date-fns';
import { de, enUS, es } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PostingSlot } from '@/hooks/usePostingTimes';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

interface HeatmapCalendarProps {
  slots: Record<string, PostingSlot[]>;
  platform: string;
  onSlotClick?: (slot: PostingSlot) => void;
}

function scoreToColor(score: number): string {
  if (score >= 85) return 'bg-green-600 hover:bg-green-700 border-green-700';
  if (score >= 70) return 'bg-green-500 hover:bg-green-600 border-green-600';
  if (score >= 55) return 'bg-green-400 hover:bg-green-500 border-green-500';
  if (score >= 40) return 'bg-amber-400 hover:bg-amber-500 border-amber-500';
  if (score > 0) return 'bg-amber-300 hover:bg-amber-400 border-amber-400';
  return 'bg-muted hover:bg-muted/80 border-muted';
}

export function HeatmapCalendar({ slots, platform, onSlotClick }: HeatmapCalendarProps) {
  const { language } = useTranslation();
  const dateFnsLocale = language === 'de' ? de : language === 'es' ? es : enUS;

  const days = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(startOfDay(new Date()), i);
    return {
      date,
      dateStr: format(date, 'yyyy-MM-dd'),
      dayName: format(date, 'EEE', { locale: dateFnsLocale }),
      dayNumber: format(date, 'd'),
    };
  });

  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="space-y-4">
      <TooltipProvider>
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="grid grid-cols-7 gap-2">
            {week.map((day) => {
              const daySlots = slots[day.dateStr] || [];
              const hourlySlots = daySlots.slice(0, 24);

              return (
                <div key={day.dateStr} className="space-y-1">
                  <div className="text-center">
                    <div className="text-xs font-medium text-muted-foreground">{day.dayName}</div>
                    <div className="text-sm font-semibold">{day.dayNumber}</div>
                  </div>
                  <div className="grid grid-cols-4 gap-0.5">
                    {hourlySlots.map((slot, idx) => {
                      const hour = new Date(slot.start).getHours();
                      const showLabel = slot.score >= 70;

                      return (
                        <Tooltip key={idx}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => onSlotClick?.(slot)}
                              className={cn(
                                'h-5 rounded border transition-all cursor-pointer flex items-center justify-center text-[9px] font-medium',
                                scoreToColor(slot.score)
                              )}
                            >
                              {showLabel && <span className="text-white">{hour}</span>}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="space-y-1">
                              <div className="font-semibold">
                                {format(new Date(slot.start), 'HH:mm')} - {format(new Date(slot.end), 'HH:mm')}
                              </div>
                              <div className="text-sm">
                                Score: <span className="font-bold">{slot.score.toFixed(1)}</span>/100
                              </div>
                              {slot.reasons && slot.reasons.length > 0 && (
                                <div className="text-xs space-y-0.5 mt-2 pt-2 border-t">
                                  {slot.reasons.map((reason, i) => (
                                    <div key={i}>• {reason}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </TooltipProvider>

      <div className="flex items-center justify-center gap-4 pt-4 border-t">
        <div className="text-xs text-muted-foreground">Score:</div>
        <div className="flex items-center gap-2">
          {[
            { label: '85-100', bg: 'bg-green-600 border-green-700' },
            { label: '70-84', bg: 'bg-green-500 border-green-600' },
            { label: '55-69', bg: 'bg-green-400 border-green-500' },
            { label: '40-54', bg: 'bg-amber-400 border-amber-500' },
            { label: '<40', bg: 'bg-amber-300 border-amber-400' },
          ].map(({ label, bg }) => (
            <div key={label} className="flex items-center gap-1">
              <div className={cn("w-4 h-4 rounded border", bg)} />
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}