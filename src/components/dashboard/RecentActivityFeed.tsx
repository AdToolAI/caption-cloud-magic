import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { getRecentEvents } from '@/lib/eventBus';
import { useTranslation } from '@/hooks/useTranslation';
import { useCache } from '@/hooks/useCache';
import { getEventTranslation } from '@/lib/eventTranslations';
import { ActivityFeedSkeleton } from '@/components/SkeletonLoaders';
import { format, isToday, isThisWeek, isThisMonth, formatDistanceToNow } from 'date-fns';
import { de, enUS, es } from 'date-fns/locale';
import {
  Sparkles, Zap, Calendar, Target, MessageSquare, Trophy, Palette,
  TrendingUp, Link2, Unplug, Upload, Activity, Radio, Filter,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Icon + accent per event type ────────────────────────────────────────────
const eventIcons: Record<string, any> = {
  'caption.created': Sparkles,
  'hook.generated': Zap,
  'calendar.post.scheduled': Calendar,
  'goal.created': Target,
  'goal.progress.updated': TrendingUp,
  'goal.completed': Trophy,
  'comment.imported': MessageSquare,
  'brandkit.created': Palette,
  'performance.synced': Activity,
  'performance.account.connected': Link2,
  'performance.account.disconnected': Unplug,
  'performance.csv.uploaded': Upload,
  'performance.insights.generated': Sparkles,
  'performance.token.expired': Unplug,
};

const eventAccent: Record<string, string> = {
  'caption.created': 'hsl(43, 90%, 68%)',
  'hook.generated': 'hsl(43, 90%, 68%)',
  'goal.completed': 'hsl(48, 96%, 62%)',
  'goal.created': 'hsl(272, 70%, 70%)',
  'goal.progress.updated': 'hsl(150, 60%, 60%)',
  'calendar.post.scheduled': 'hsl(210, 90%, 65%)',
  'comment.imported': 'hsl(187, 84%, 55%)',
  'brandkit.created': 'hsl(330, 80%, 70%)',
  'performance.synced': 'hsl(187, 84%, 55%)',
  'performance.account.connected': 'hsl(150, 60%, 60%)',
  'performance.account.disconnected': 'hsl(0, 70%, 60%)',
  'performance.insights.generated': 'hsl(43, 90%, 68%)',
};

// Signal strength (0..1) — controls oscilloscope amplitude
const signalAmp: Record<string, number> = {
  'goal.completed': 1.0,
  'caption.created': 0.75,
  'hook.generated': 0.7,
  'calendar.post.scheduled': 0.6,
  'brandkit.created': 0.65,
  'goal.created': 0.55,
  'goal.progress.updated': 0.5,
  'comment.imported': 0.45,
  'performance.insights.generated': 0.6,
  'performance.synced': 0.25,
  'performance.account.connected': 0.4,
  'performance.account.disconnected': 0.35,
  'performance.csv.uploaded': 0.4,
  'performance.token.expired': 0.3,
};

// Friendly labels — extends the base translations
const friendlyLabels: Record<string, { de: string; en: string; es: string }> = {
  'caption.created': { de: 'Neue Caption erstellt', en: 'New caption created', es: 'Nueva descripción' },
  'hook.generated': { de: 'Hook generiert', en: 'Hook generated', es: 'Hook generado' },
  'calendar.post.scheduled': { de: 'Post geplant', en: 'Post scheduled', es: 'Publicación programada' },
  'goal.created': { de: 'Neues Ziel gesetzt', en: 'New goal set', es: 'Nueva meta' },
  'goal.progress.updated': { de: 'Fortschritt aktualisiert', en: 'Progress updated', es: 'Progreso actualizado' },
  'goal.completed': { de: 'Ziel erreicht', en: 'Goal completed', es: 'Meta alcanzada' },
  'comment.imported': { de: 'Kommentare importiert', en: 'Comments imported', es: 'Comentarios importados' },
  'brandkit.created': { de: 'Brand Kit erstellt', en: 'Brand kit created', es: 'Brand kit creado' },
  'performance.synced': { de: 'Performance synchronisiert', en: 'Performance synced', es: 'Rendimiento sincronizado' },
  'performance.account.connected': { de: 'Kanal verbunden', en: 'Channel connected', es: 'Canal conectado' },
  'performance.account.disconnected': { de: 'Kanal getrennt', en: 'Channel disconnected', es: 'Canal desconectado' },
  'performance.csv.uploaded': { de: 'CSV importiert', en: 'CSV imported', es: 'CSV importado' },
  'performance.insights.generated': { de: 'KI-Insights erstellt', en: 'AI insights generated', es: 'Insights IA generados' },
  'performance.token.expired': { de: 'Token abgelaufen', en: 'Token expired', es: 'Token caducado' },
};

// Categories for filter chips
type Category = 'all' | 'content' | 'performance' | 'goals';
const eventCategory: Record<string, Exclude<Category, 'all'>> = {
  'caption.created': 'content',
  'hook.generated': 'content',
  'calendar.post.scheduled': 'content',
  'brandkit.created': 'content',
  'comment.imported': 'content',
  'goal.created': 'goals',
  'goal.progress.updated': 'goals',
  'goal.completed': 'goals',
  'performance.synced': 'performance',
  'performance.account.connected': 'performance',
  'performance.account.disconnected': 'performance',
  'performance.csv.uploaded': 'performance',
  'performance.insights.generated': 'performance',
  'performance.token.expired': 'performance',
};

// Platform styles
const platformStyle: Record<string, { label: string; color: string }> = {
  instagram: { label: 'Instagram', color: 'hsl(330, 80%, 65%)' },
  facebook: { label: 'Facebook', color: 'hsl(220, 75%, 60%)' },
  linkedin: { label: 'LinkedIn', color: 'hsl(210, 75%, 50%)' },
  tiktok: { label: 'TikTok', color: 'hsl(187, 84%, 55%)' },
  youtube: { label: 'YouTube', color: 'hsl(0, 75%, 55%)' },
  twitter: { label: 'X', color: 'hsl(0, 0%, 90%)' },
  x: { label: 'X', color: 'hsl(0, 0%, 90%)' },
};

// ── Sparkline (30-day pulse) ────────────────────────────────────────────────
function Sparkline({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const W = 180, H = 36;
  const step = W / Math.max(1, counts.length - 1);
  const pts = counts.map((c, i) => {
    const x = i * step;
    const y = H - (c / max) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = 'M ' + pts.join(' L ');
  const area = `${line} L ${W},${H} L 0,${H} Z`;
  const lastX = (counts.length - 1) * step;
  const lastY = H - (counts[counts.length - 1] / max) * (H - 4) - 2;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id="sig-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(43, 90%, 68%)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(43, 90%, 68%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sig-fill)" />
      <path d={line} fill="none" stroke="hsl(43, 90%, 68%)" strokeWidth="1.5" strokeLinejoin="round" />
      <motion.circle
        cx={lastX} cy={lastY} r={3} fill="hsl(43, 90%, 68%)"
        animate={{ r: [3, 5, 3], opacity: [1, 0.6, 1] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      />
      <motion.circle
        cx={lastX} cy={lastY} r={3} fill="none" stroke="hsl(43, 90%, 68%)" strokeOpacity="0.6"
        animate={{ r: [3, 12], opacity: [0.6, 0] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      />
    </svg>
  );
}

// ── Oscilloscope rail (SVG path between nodes) ──────────────────────────────
function SignalRail({ amps, rowH = 68 }: { amps: number[]; rowH?: number }) {
  if (amps.length === 0) return null;
  const W = 40, H = amps.length * rowH;
  const cx = W / 2;
  const points = amps.map((a, i) => {
    const y = i * rowH + rowH / 2;
    const x = cx + (i % 2 === 0 ? -1 : 1) * a * 10;
    return { x, y };
  });
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const midY = (prev.y + cur.y) / 2;
    d += ` C ${prev.x} ${midY}, ${cur.x} ${midY}, ${cur.x} ${cur.y}`;
  }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute left-0 top-0 pointer-events-none">
      <defs>
        <linearGradient id="rail-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(43, 90%, 68%)" stopOpacity="0.9" />
          <stop offset="60%" stopColor="hsl(187, 84%, 55%)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="hsl(43, 90%, 68%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={d}
        fill="none"
        stroke="url(#rail-grad)"
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
    </svg>
  );
}

// ── Bucketing ───────────────────────────────────────────────────────────────
type Bucket = 'today' | 'week' | 'month' | 'archive';
const bucketOf = (d: Date): Bucket =>
  isToday(d) ? 'today' : isThisWeek(d, { weekStartsOn: 1 }) ? 'week' : isThisMonth(d) ? 'month' : 'archive';

const bucketLabels: Record<Bucket, { de: string; en: string; es: string }> = {
  today: { de: 'Heute', en: 'Today', es: 'Hoy' },
  week: { de: 'Diese Woche', en: 'This Week', es: 'Esta semana' },
  month: { de: 'Diesen Monat', en: 'This Month', es: 'Este mes' },
  archive: { de: 'Archiv', en: 'Archive', es: 'Archivo' },
};

// ── Row ─────────────────────────────────────────────────────────────────────
function SignalRow({
  event, index, isHero, language, getLocale, getLabel,
}: any) {
  const Icon = eventIcons[event.event_type] || Sparkles;
  const accent = eventAccent[event.event_type] ?? 'hsl(43, 90%, 68%)';
  const date = new Date(event.occurred_at);
  const ageDays = (Date.now() - date.getTime()) / 86400000;
  const timeStr = isToday(date)
    ? format(date, 'HH:mm')
    : isThisWeek(date, { weekStartsOn: 1 })
    ? format(date, 'EEE HH:mm', { locale: getLocale() })
    : ageDays > 14
    ? format(date, 'd. MMM yyyy', { locale: getLocale() })
    : formatDistanceToNow(date, { addSuffix: true, locale: getLocale() });

  const platformKey = String(event.payload_json?.platform ?? '').toLowerCase();
  const platform = platformStyle[platformKey];

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4) }}
      className={`hub-card-shimmer group relative flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-white/10 hover:bg-white/[0.06] ${
        isHero ? 'ring-1 ring-primary/25 bg-primary/[0.04]' : ''
      }`}
      style={isHero ? { boxShadow: `0 0 32px ${accent}22` } : undefined}
    >
      <div
        className="relative shrink-0 grid h-9 w-9 place-items-center rounded-lg border border-white/10"
        style={{ background: `${accent}18`, color: accent }}
      >
        <Icon className="h-4 w-4" />
        {isHero && (
          <motion.span
            className="absolute inset-0 rounded-lg"
            style={{ boxShadow: `0 0 0 2px ${accent}55` }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="truncate text-sm font-medium text-foreground">{getLabel(event.event_type)}</p>
          {isHero && (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Live
            </span>
          )}
          {platform && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: `${platform.color}22`, color: platform.color }}
            >
              {platform.label}
            </span>
          )}
        </div>
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{timeStr}</span>
    </motion.div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
export function RecentActivityFeed() {
  const { language } = useTranslation();
  const [category, setCategory] = useState<Category>('all');

  const { data, loading } = useCache(
    'recent-events-signal',
    () => getRecentEvents(50),
    { ttl: 2 * 60 * 1000, staleWhileRevalidate: true },
  );
  const events = data ?? [];

  const getLocale = useCallback(() => {
    switch (language) {
      case 'de': return de;
      case 'es': return es;
      default: return enUS;
    }
  }, [language]);

  const getLabel = useCallback((type: string) => {
    const l = friendlyLabels[type];
    if (l) return l[language as 'de' | 'en' | 'es'] ?? l.en;
    return getEventTranslation(type, language);
  }, [language]);

  const filtered = useMemo(
    () => events.filter((e: any) => category === 'all' || eventCategory[e.event_type] === category),
    [events, category],
  );

  // Bucket
  const buckets = useMemo(() => {
    const g: Record<Bucket, any[]> = { today: [], week: [], month: [], archive: [] };
    for (const e of filtered) g[bucketOf(new Date(e.occurred_at))].push(e);
    return g;
  }, [filtered]);

  // 30-day sparkline counts
  const sparkCounts = useMemo(() => {
    const days = 30;
    const arr = Array(days).fill(0);
    const now = Date.now();
    for (const e of events) {
      const d = new Date(e.occurred_at).getTime();
      const idx = days - 1 - Math.floor((now - d) / 86400000);
      if (idx >= 0 && idx < days) arr[idx] += 1;
    }
    return arr;
  }, [events]);

  const isStale = events.length > 0 && buckets.today.length === 0 && buckets.week.length === 0;

  const chips: { key: Category; label: string }[] = [
    { key: 'all', label: language === 'de' ? 'Alle' : language === 'es' ? 'Todos' : 'All' },
    { key: 'content', label: language === 'de' ? 'Content' : 'Content' },
    { key: 'performance', label: 'Performance' },
    { key: 'goals', label: language === 'de' ? 'Ziele' : language === 'es' ? 'Metas' : 'Goals' },
  ];

  if (loading) {
    return (
      <Card className="h-full backdrop-blur-xl bg-card/50 border border-white/10">
        <CardHeader><ActivityFeedSkeleton /></CardHeader>
      </Card>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Card className="relative h-full overflow-hidden border border-white/10 bg-card/50 backdrop-blur-xl">
        {/* subtle gold aurora */}
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        </div>

        <CardHeader className="relative z-10 space-y-3 pb-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <motion.div
                  className="grid h-6 w-6 place-items-center rounded-md bg-primary/15 text-primary"
                  animate={{ boxShadow: ['0 0 0 0 hsla(43,90%,68%,0.4)', '0 0 0 8px hsla(43,90%,68%,0)'] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                >
                  <Radio className="h-3.5 w-3.5" />
                </motion.div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {language === 'de' ? 'Signal Log' : language === 'es' ? 'Signal Log' : 'Signal Log'}
                </h3>
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  · Live
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {language === 'de'
                  ? '30-Tage Puls · gruppierte Signale aus deiner Plattform'
                  : language === 'es'
                  ? 'Pulso de 30 días · señales agrupadas'
                  : '30-day pulse · grouped signals from your platform'}
              </p>
            </div>
            <Sparkline counts={sparkCounts} />
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="h-3 w-3 text-muted-foreground" />
            {chips.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  category === c.key
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground hover:border-white/20'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="relative z-10 pt-0">
          {events.length === 0 ? (
            <EmptyState language={language} />
          ) : (
            <>
              {isStale && <StaleBanner language={language} />}
              <div className="space-y-5">
                <AnimatePresence>
                  {(['today', 'week', 'month', 'archive'] as Bucket[]).map((b) => {
                    const list = buckets[b];
                    if (list.length === 0) return null;
                    const amps = list.map((e: any) => signalAmp[e.event_type] ?? 0.4);
                    return (
                      <div key={b}>
                        <div className="mb-2 flex items-center gap-2 pl-1">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {bucketLabels[b][language as 'de' | 'en' | 'es']}
                          </span>
                          <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                          <Badge variant="outline" className="border-white/10 text-[10px]">
                            {list.length}
                          </Badge>
                        </div>
                        <div className="relative pl-10">
                          <SignalRail amps={amps} rowH={56} />
                          <div className="space-y-1.5">
                            {list.map((e: any, i: number) => (
                              <SignalRow
                                key={e.id}
                                event={e}
                                index={i}
                                isHero={b === 'today' && i === 0}
                                language={language}
                                getLocale={getLocale}
                                getLabel={getLabel}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Empty / Stale ───────────────────────────────────────────────────────────
function EmptyState({ language }: { language: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="relative mb-3 h-16 w-16">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border border-primary/40"
            animate={{ scale: [0.6, 1.6], opacity: [0.7, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }}
          />
        ))}
        <div className="absolute inset-0 grid place-items-center">
          <Radio className="h-6 w-6 text-primary" />
        </div>
      </div>
      <p className="mb-3 text-sm text-muted-foreground max-w-xs">
        {language === 'de'
          ? 'Noch keine Signale. Verbinde einen Kanal, um Live-Aktivitäten zu sehen.'
          : language === 'es'
          ? 'Aún sin señales. Conecta un canal para ver actividad en vivo.'
          : 'No signals yet. Connect a channel to see live activity.'}
      </p>
      <Button asChild size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
        <Link to="/performance-tracker?tab=connections">
          {language === 'de' ? 'Kanäle verbinden' : language === 'es' ? 'Conectar canales' : 'Connect channels'}
        </Link>
      </Button>
    </div>
  );
}

function StaleBanner({ language }: { language: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2">
      <Radio className="h-4 w-4 text-primary" />
      <p className="flex-1 text-xs text-muted-foreground">
        {language === 'de'
          ? 'Aktuell keine neuen Signale. Ältere Aktivitäten im Archiv unten.'
          : language === 'es'
          ? 'Sin señales recientes. Actividad antigua en el archivo abajo.'
          : 'No recent signals. Older activity in the archive below.'}
      </p>
      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10">
        <Link to="/performance-tracker?tab=connections">
          {language === 'de' ? 'Kanäle prüfen' : language === 'es' ? 'Revisar canales' : 'Review channels'}
        </Link>
      </Button>
    </div>
  );
}
