import { format, addDays, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PostingSlot } from '@/hooks/usePostingTimes';
import { cn } from '@/lib/utils';

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
  // Generate 14 days starting from today
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(startOfDay(new Date()), i);
    return {
      date,
      dateStr: format(date, 'yyyy-MM-dd'),
      dayName: format(date, 'EEE', { locale: de }),
      dayNumber: format(date, 'd'),
    };
  });

  // Group days into weeks (7 days each)
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
              // Get top 24 hourly slots (or fewer if not available)
              const hourlySlots = daySlots.slice(0, 24);

              return (
                <div key={day.dateStr} className="space-y-1">
                  {/* Day header */}
                  <div className="text-center">
                    <div className="text-xs font-medium text-muted-foreground">
                      {day.dayName}
                    </div>
                    <div className="text-sm font-semibold">{day.dayNumber}</div>
                  </div>

                  {/* Hourly slots grid */}
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

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 pt-4 border-t">
        <div className="text-xs text-muted-foreground">Score:</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-green-600 border border-green-700" />
            <span className="text-xs">85-100</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-green-500 border border-green-600" />
            <span className="text-xs">70-84</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-green-400 border border-green-500" />
            <span className="text-xs">55-69</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-amber-400 border border-amber-500" />
            <span className="text-xs">40-54</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-amber-300 border border-amber-400" />
            <span className="text-xs">&lt;40</span>
          </div>
        </div>
      </div>
    </div>
  );
}
