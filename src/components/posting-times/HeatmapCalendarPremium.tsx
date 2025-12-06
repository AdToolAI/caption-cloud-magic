import { format, addDays, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PostingSlot } from '@/hooks/usePostingTimes';
import { cn } from '@/lib/utils';

interface HeatmapCalendarPremiumProps {
  slots: Record<string, PostingSlot[]>;
  platform: string;
  onSlotClick?: (slot: PostingSlot) => void;
}

function getScoreStyle(score: number): { bg: string; glow: string; pulse: boolean } {
  if (score >= 85) return { 
    bg: 'bg-emerald-500', 
    glow: 'shadow-[0_0_12px_rgba(16,185,129,0.6)]',
    pulse: true 
  };
  if (score >= 70) return { 
    bg: 'bg-emerald-400', 
    glow: 'shadow-[0_0_8px_rgba(52,211,153,0.4)]',
    pulse: false 
  };
  if (score >= 55) return { 
    bg: 'bg-cyan-400', 
    glow: 'shadow-[0_0_6px_rgba(34,211,238,0.3)]',
    pulse: false 
  };
  if (score >= 40) return { 
    bg: 'bg-amber-400', 
    glow: '',
    pulse: false 
  };
  if (score > 0) return { 
    bg: 'bg-amber-300/60', 
    glow: '',
    pulse: false 
  };
  return { bg: 'bg-muted/30', glow: '', pulse: false };
}

export function HeatmapCalendarPremium({ slots, platform, onSlotClick }: HeatmapCalendarPremiumProps) {
  // Generate 14 days starting from today
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(startOfDay(new Date()), i);
    return {
      date,
      dateStr: format(date, 'yyyy-MM-dd'),
      dayName: format(date, 'EEE', { locale: de }),
      dayNumber: format(date, 'd'),
      isToday: i === 0,
    };
  });

  // Group days into weeks (7 days each)
  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <TooltipProvider>
        {weeks.map((week, weekIdx) => (
          <motion.div
            key={weekIdx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: weekIdx * 0.1 }}
            className="grid grid-cols-7 gap-3"
          >
            {week.map((day, dayIdx) => {
              const daySlots = slots[day.dateStr] || [];
              const hourlySlots = daySlots.slice(0, 24);
              const topScore = Math.max(...hourlySlots.map(s => s.score), 0);

              return (
                <motion.div
                  key={day.dateStr}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: weekIdx * 0.1 + dayIdx * 0.03 }}
                  className={cn(
                    "relative rounded-xl backdrop-blur-md border p-3 transition-all duration-300",
                    day.isToday 
                      ? "bg-primary/10 border-primary/30 shadow-[0_0_20px_rgba(245,199,106,0.2)]" 
                      : "bg-card/40 border-white/10 hover:border-white/20 hover:bg-card/60"
                  )}
                >
                  {/* Day header */}
                  <div className="text-center mb-2">
                    <div className={cn(
                      "text-xs font-medium",
                      day.isToday ? "text-primary" : "text-muted-foreground"
                    )}>
                      {day.dayName}
                    </div>
                    <div className={cn(
                      "text-lg font-bold",
                      day.isToday && "text-primary"
                    )}>
                      {day.dayNumber}
                    </div>
                    {day.isToday && (
                      <div className="text-[10px] text-primary font-medium">Heute</div>
                    )}
                  </div>

                  {/* Hourly slots grid */}
                  <div className="grid grid-cols-4 gap-1">
                    {hourlySlots.map((slot, idx) => {
                      const hour = new Date(slot.start).getHours();
                      const style = getScoreStyle(slot.score);
                      const showLabel = slot.score >= 70;

                      return (
                        <Tooltip key={idx}>
                          <TooltipTrigger asChild>
                            <motion.button
                              whileHover={{ scale: 1.15, zIndex: 10 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => onSlotClick?.(slot)}
                              className={cn(
                                "relative h-6 rounded-md transition-all cursor-pointer flex items-center justify-center text-[10px] font-bold",
                                style.bg,
                                style.glow,
                                style.pulse && "animate-pulse"
                              )}
                            >
                              {showLabel && (
                                <span className="text-white drop-shadow-md">{hour}</span>
                              )}
                            </motion.button>
                          </TooltipTrigger>
                          <TooltipContent 
                            side="top" 
                            className="backdrop-blur-xl bg-card/90 border-white/20 shadow-xl"
                          >
                            <div className="space-y-2 p-1">
                              <div className="flex items-center gap-2">
                                <div className={cn("w-3 h-3 rounded", style.bg)} />
                                <span className="font-bold">
                                  {format(new Date(slot.start), 'HH:mm')} - {format(new Date(slot.end), 'HH:mm')}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Score:</span>
                                <span className="font-bold text-lg">{slot.score.toFixed(0)}</span>
                                <span className="text-muted-foreground">/100</span>
                              </div>
                              {slot.reasons && slot.reasons.length > 0 && (
                                <div className="text-xs space-y-1 pt-2 border-t border-white/10">
                                  {slot.reasons.map((reason, i) => (
                                    <div key={i} className="text-muted-foreground">• {reason}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>

                  {/* Best score indicator */}
                  {topScore >= 85 && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-ping" />
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        ))}
      </TooltipProvider>

      {/* Premium Legend */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex items-center justify-center gap-6 pt-4 border-t border-white/10"
      >
        <span className="text-xs text-muted-foreground font-medium">Score:</span>
        <div className="flex items-center gap-4">
          {[
            { label: '85+', bg: 'bg-emerald-500', glow: 'shadow-[0_0_8px_rgba(16,185,129,0.5)]' },
            { label: '70-84', bg: 'bg-emerald-400', glow: '' },
            { label: '55-69', bg: 'bg-cyan-400', glow: '' },
            { label: '40-54', bg: 'bg-amber-400', glow: '' },
            { label: '<40', bg: 'bg-amber-300/60', glow: '' },
          ].map(({ label, bg, glow }) => (
            <motion.div
              key={label}
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-1.5"
            >
              <div className={cn("w-4 h-4 rounded", bg, glow)} />
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}