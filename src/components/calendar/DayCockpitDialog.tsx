/**
 * Day Cockpit Dialog
 * A single immersive "mission briefing" surface that unites the Quick Schedule
 * form (left) and that day's publishing queue (right). Opened by clicking a
 * date in the calendar — the date is locked, only the time is editable.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Inbox, CheckCircle2, Loader2, XCircle, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import { ScheduleQuickForm } from './ScheduleQuickForm';
import heroImg from '@/assets/day-cockpit-hero.jpg';

interface DayCockpitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  workspaceId: string;
  onSuccess?: () => void;
}

const localeMap: Record<string, string> = { en: 'en-US', de: 'de-DE', es: 'es-ES' };

interface DayEvent {
  id: string;
  title: string | null;
  caption: string | null;
  channels: string[] | null;
  status: string;
  start_at: string;
}

function statusVisual(status: string) {
  switch (status) {
    case 'queued':
    case 'scheduled':
      return { icon: <Clock className="h-3.5 w-3.5 text-amber-400" />, ring: 'border-amber-400/40' };
    case 'published':
      return { icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />, ring: 'border-emerald-400/40' };
    case 'failed':
      return { icon: <XCircle className="h-3.5 w-3.5 text-rose-400" />, ring: 'border-rose-400/40' };
    case 'publishing':
      return { icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />, ring: 'border-cyan-400/40' };
    default:
      return { icon: <Clock className="h-3.5 w-3.5 text-muted-foreground" />, ring: 'border-white/10' };
  }
}

export function DayCockpitDialog({ open, onOpenChange, date, workspaceId, onSuccess }: DayCockpitDialogProps) {
  const { t, language } = useTranslation();
  const dateLocale = localeMap[language] || 'en-US';

  const { dayStart, dayEnd } = useMemo(() => {
    if (!date) return { dayStart: null, dayEnd: null };
    const s = new Date(date); s.setHours(0, 0, 0, 0);
    const e = new Date(date); e.setHours(23, 59, 59, 999);
    return { dayStart: s.toISOString(), dayEnd: e.toISOString() };
  }, [date]);

  const { data: dayEvents = [], refetch } = useQuery({
    queryKey: ['day-cockpit-events', workspaceId, dayStart],
    enabled: !!open && !!workspaceId && !!dayStart,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id,title,caption,channels,status,start_at')
        .eq('workspace_id', workspaceId)
        .gte('start_at', dayStart!)
        .lte('start_at', dayEnd!)
        .order('start_at', { ascending: true });
      if (error) throw error;
      return (data || []) as DayEvent[];
    },
    refetchInterval: open ? 8000 : false,
  });

  const dayLabel = date
    ? date.toLocaleDateString(dateLocale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : '';
  const dayNumber = date ? date.getDate().toString().padStart(2, '0') : '--';
  const monthShort = date ? date.toLocaleDateString(dateLocale, { month: 'short' }).toUpperCase() : '';

  if (!date || !workspaceId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm bg-[#050816] border border-primary/20">
          <VisuallyHidden><DialogTitle>Loading</DialogTitle></VisuallyHidden>
          <p className="text-sm text-white/60 py-6 text-center">Lade Tagesübersicht…</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl w-[95vw] p-0 overflow-hidden bg-[#050816] border border-primary/20 shadow-[0_0_80px_-20px_hsl(var(--primary)/0.6)]"
      >
        <VisuallyHidden>
          <DialogTitle>{t('calendar.quickSchedule')} — {dayLabel}</DialogTitle>
          <DialogDescription>{t('calendar.createAndSchedule')}</DialogDescription>
        </VisuallyHidden>

        {/* HERO HEADER */}
        <div className="relative h-44 md:h-52 overflow-hidden">
          <img
            src={heroImg}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#050816]/40 via-[#050816]/60 to-[#050816]" />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, transparent 0 3px, hsl(189 95% 65% / 0.04) 3px 4px)',
            }}
          />

          <div className="relative h-full flex items-end justify-between gap-6 px-6 md:px-10 pb-5">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex items-end gap-5"
            >
              <div className="flex flex-col items-center justify-center rounded-2xl border border-primary/40 bg-black/40 backdrop-blur-xl px-5 py-3 shadow-[0_0_30px_-10px_hsl(var(--primary)/0.8)]">
                <span className="text-[10px] tracking-[0.4em] text-primary/80 font-medium">{monthShort}</span>
                <span
                  className="font-[Playfair_Display,serif] text-5xl md:text-6xl font-semibold leading-none text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-primary to-amber-500"
                  style={{ textShadow: '0 0 30px hsl(var(--primary) / 0.4)' }}
                >
                  {dayNumber}
                </span>
              </div>
              <div className="pb-1">
                <div className="text-[10px] tracking-[0.5em] text-primary/70 uppercase">
                  {t('calendar.quickSchedule')}
                </div>
                <h2 className="font-[Playfair_Display,serif] text-2xl md:text-3xl text-white/95 leading-tight">
                  {dayLabel}
                </h2>
                <p className="text-xs text-white/50 mt-1">
                  {t('calendar.createAndSchedule')}
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="hidden md:flex items-center gap-2 pb-2"
            >
              <Badge
                variant="outline"
                className="border-primary/40 bg-primary/5 text-primary/90 text-[10px] tracking-widest uppercase"
              >
                <CalendarIcon className="h-3 w-3 mr-1" />
                {dayEvents.length} {dayEvents.length === 1 ? 'Post' : 'Posts'}
              </Badge>
            </motion.div>
          </div>
        </div>

        {/* BODY — two columns */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-0 max-h-[calc(90vh-13rem)]">
          {/* LEFT: Quick schedule form (lockedDate) */}
          <div className="relative px-6 md:px-8 py-6 border-r border-white/5 overflow-y-auto">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
            <h3 className="font-[Playfair_Display,serif] text-lg text-primary/90 mb-4 flex items-center gap-2">
              <span className="h-px flex-1 max-w-[2rem] bg-primary/40" />
              {t('calendar.quickSchedule')}
            </h3>
            {date && (
              <ScheduleQuickForm
                workspaceId={workspaceId}
                lockedDate={date}
                embedded
                onSuccess={() => {
                  refetch();
                  onSuccess?.();
                }}
              />
            )}
          </div>

          {/* RIGHT: That day's queue */}
          <div className="relative px-6 md:px-8 py-6 bg-black/20 overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
            <h3 className="font-[Playfair_Display,serif] text-lg text-cyan-300/90 mb-4 flex items-center gap-2">
              <span className="h-px flex-1 max-w-[2rem] bg-cyan-400/30" />
              {t('calendar.publishQueue')}
            </h3>

            <ScrollArea className="flex-1 pr-2 -mr-2">
              {dayEvents.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center text-center py-16"
                >
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="p-5 rounded-2xl bg-primary/5 border border-primary/20 mb-4"
                  >
                    <Inbox className="h-8 w-8 text-primary/50" />
                  </motion.div>
                  <p className="text-sm text-white/70">{t('calendar.noActivePublications')}</p>
                  <p className="text-xs text-white/40 mt-1">
                    {t('calendar.scheduledPostsAppearHere')}
                  </p>
                </motion.div>
              ) : (
                <div className="space-y-2.5">
                  {dayEvents.map((ev, i) => {
                    const v = statusVisual(ev.status);
                    const time = new Date(ev.start_at).toLocaleTimeString(dateLocale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    return (
                      <motion.div
                        key={ev.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className={`group relative rounded-xl border ${v.ring} bg-white/[0.02] hover:bg-white/[0.04] backdrop-blur-sm p-3 transition-all`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col items-center pt-0.5 min-w-[3rem]">
                            <span className="font-mono text-sm text-primary/90 tabular-nums">{time}</span>
                            <span className="mt-1">{v.icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white/90 truncate">
                              {ev.title || ev.caption?.slice(0, 60) || t('calendar.titleOptional')}
                            </p>
                            {ev.caption && ev.title && (
                              <p className="text-xs text-white/40 truncate mt-0.5">{ev.caption}</p>
                            )}
                            {ev.channels && ev.channels.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {ev.channels.map((c) => (
                                  <span
                                    key={c}
                                    className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-white/60 border border-white/10"
                                  >
                                    {c}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
