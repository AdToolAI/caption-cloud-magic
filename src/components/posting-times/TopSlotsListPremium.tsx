import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, Calendar, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PostingSlot, PostingTimesDay } from '@/hooks/usePostingTimes';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface TopSlotsListPremiumProps {
  days: PostingTimesDay[];
  platform: string;
}

function ScoreRing({ score }: { score: number }) {
  const percentage = score;
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  const getColor = () => {
    if (score >= 85) return '#10b981'; // emerald
    if (score >= 70) return '#34d399'; // emerald-400
    if (score >= 55) return '#22d3ee'; // cyan
    return '#fbbf24'; // amber
  };

  return (
    <div className="relative w-12 h-12">
      <svg className="w-12 h-12 -rotate-90">
        <circle
          cx="24"
          cy="24"
          r="18"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          className="text-muted/20"
        />
        <motion.circle
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: "easeOut" }}
          cx="24"
          cy="24"
          r="18"
          stroke={getColor()}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ filter: `drop-shadow(0 0 6px ${getColor()}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold">{score.toFixed(0)}</span>
      </div>
    </div>
  );
}

export function TopSlotsListPremium({ days, platform }: TopSlotsListPremiumProps) {
  const navigate = useNavigate();

  const handleAddToCalendar = (slot: PostingSlot) => {
    navigate('/calendar', {
      state: {
        prefillTime: slot.start,
        platform: platform,
        source: 'posting-times'
      }
    });
  };

  return (
    <div className="space-y-4">
      {days.slice(0, 7).map((day, dayIdx) => {
        const topSlots = day.slots.slice(0, 3);
        if (topSlots.length === 0) return null;

        const isToday = dayIdx === 0;

        return (
          <motion.div
            key={day.date}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: dayIdx * 0.1 }}
            className={cn(
              "relative rounded-xl backdrop-blur-md border p-4 transition-all duration-300",
              isToday
                ? "bg-primary/10 border-primary/30 shadow-[0_0_20px_rgba(245,199,106,0.15)]"
                : "bg-card/40 border-white/10 hover:border-white/20 hover:bg-card/60"
            )}
          >
            {/* Day Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "text-lg font-bold",
                  isToday && "text-primary"
                )}>
                  {format(new Date(day.date), 'EEEE', { locale: de })}
                </div>
                <div className="text-sm text-muted-foreground">
                  {format(new Date(day.date), 'd. MMMM', { locale: de })}
                </div>
                {isToday && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/20 text-primary border border-primary/30">
                    Heute
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="w-3 h-3" />
                Top {topSlots.length}
              </div>
            </div>

            {/* Slots */}
            <div className="space-y-3">
              {topSlots.map((slot, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: dayIdx * 0.1 + idx * 0.05 }}
                  whileHover={{ scale: 1.01, x: 4 }}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg transition-all duration-200",
                    "bg-background/50 border border-white/5 hover:border-white/20",
                    "hover:shadow-[0_0_15px_rgba(245,199,106,0.1)]"
                  )}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <ScoreRing score={slot.score} />
                    
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono font-bold text-lg">
                        {format(new Date(slot.start), 'HH:mm')}
                      </span>
                    </div>

                    {slot.reasons && slot.reasons.length > 0 && (
                      <div className="hidden sm:flex items-center gap-2 flex-1">
                        <div className="h-4 w-px bg-white/10" />
                        <span className="text-sm text-muted-foreground truncate">
                          {slot.reasons[0]}
                        </span>
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleAddToCalendar(slot)}
                    className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-[0_0_15px_rgba(245,199,106,0.2)] hover:shadow-[0_0_25px_rgba(245,199,106,0.4)] transition-all duration-300"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Planen
                  </Button>
                </motion.div>
              ))}
            </div>

            {/* Decorative line */}
            {dayIdx < days.slice(0, 7).length - 1 && (
              <div className="absolute -bottom-2 left-8 w-0.5 h-4 bg-gradient-to-b from-white/10 to-transparent" />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}