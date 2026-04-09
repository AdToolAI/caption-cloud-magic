import { LucideIcon, Clock, TrendingUp, Hash, Type, AlertTriangle, Target } from "lucide-react";

export type InsightCardData = {
  title: string;
  delta: string;
  evidence: string;
  icon: LucideIcon;
  actions: Array<{
    label: string;
    href: string;
    variant?: 'default' | 'outline';
  }>;
  priority: 'high' | 'medium' | 'low';
};

type Lang = 'en' | 'de' | 'es';

const i18n = {
  weekdays: {
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  },
  bestTimeTitle: {
    en: (wd: string, h: string, p: string) => `Best time: ${wd} ${h}:00 for ${p}`,
    de: (wd: string, h: string, p: string) => `Beste Zeit: ${wd} ${h}:00 für ${p}`,
    es: (wd: string, h: string, p: string) => `Mejor hora: ${wd} ${h}:00 para ${p}`,
  },
  avgEng: {
    en: (p: number) => `Avg Eng +${p}%`,
    de: (p: number) => `Ø Eng +${p}%`,
    es: (p: number) => `Prom Eng +${p}%`,
  },
  postsBracket: {
    en: (n: number) => `${n} posts (28 days)`,
    de: (n: number) => `${n} Posts (28 Tage)`,
    es: (n: number) => `${n} posts (28 días)`,
  },
  addToCalendar: { en: 'Add slot to calendar', de: 'Slot zu Kalender hinzufügen', es: 'Agregar al calendario' },
  postTypeTitle: {
    en: (t: string, p: string) => `${t} works better on ${p}`,
    de: (t: string, p: string) => `${t} funktioniert besser auf ${p}`,
    es: (t: string, p: string) => `${t} funciona mejor en ${p}`,
  },
  moreEngagement: {
    en: (p: number) => `${p}% more engagement`,
    de: (p: number) => `${p}% mehr Engagement`,
    es: (p: number) => `${p}% más engagement`,
  },
  postsAnalyzed: {
    en: (n: number) => `${n} posts analyzed`,
    de: (n: number) => `${n} Posts analysiert`,
    es: (n: number) => `${n} posts analizados`,
  },
  createMore: { en: 'Create more', de: 'Mehr erstellen', es: 'Crear más' },
  hashtagTitle: { en: 'Combine top hashtags', de: 'Top Hashtags kombinieren', es: 'Combinar mejores hashtags' },
  avgEngRate: {
    en: (r: number) => `Avg +${r}% engagement`,
    de: (r: number) => `Ø +${r}% Engagement`,
    es: (r: number) => `Prom +${r}% engagement`,
  },
  topHashtags: {
    en: (n: number) => `5 best hashtags (each used ${n}×)`,
    de: (n: number) => `5 beste Hashtags (je ${n}× verwendet)`,
    es: (n: number) => `5 mejores hashtags (usado ${n}× cada uno)`,
  },
  saveAsSet: { en: 'Save as set', de: 'Als Set speichern', es: 'Guardar como set' },
  bucketNames: {
    en: { kurz: 'short', mittel: 'medium', lang: 'long' } as Record<string, string>,
    de: { kurz: 'kurz', mittel: 'mittel', lang: 'lang' } as Record<string, string>,
    es: { kurz: 'corto', mittel: 'medio', lang: 'largo' } as Record<string, string>,
  },
  captionTitle: {
    en: (bucket: string) => `${bucket} captions perform better`,
    de: (bucket: string) => `${bucket} Captions performen besser`,
    es: (bucket: string) => `Captions ${bucket} funcionan mejor`,
  },
  captionDelta: {
    en: (p: number, w: string) => `${p}% more than ${w}`,
    de: (p: number, w: string) => `${p}% mehr als ${w}`,
    es: (p: number, w: string) => `${p}% más que ${w}`,
  },
  openTemplate: { en: 'Open template', de: 'Vorlage öffnen', es: 'Abrir plantilla' },
  trendTitle: { en: '⚠️ Engagement is falling', de: '⚠️ Engagement fällt', es: '⚠️ El engagement está cayendo' },
  trendDelta: {
    en: (p: number) => `${p}% below baseline`,
    de: (p: number) => `${p}% unter Baseline`,
    es: (p: number) => `${p}% por debajo de la línea base`,
  },
  last7vs14: { en: 'Last 7 vs 14 days', de: 'Letzte 7 vs 14 Tage', es: 'Últimos 7 vs 14 días' },
  testPostingTime: { en: 'Test posting time', de: 'Posting-Zeit testen', es: 'Probar horario de publicación' },
  tryOtherFormats: { en: 'Try other formats', de: 'Andere Formate probieren', es: 'Probar otros formatos' },
};

// Helper functions
const groupBy = <T,>(arr: T[], key: (item: T) => string): Record<string, T[]> => {
  return arr.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
};

const calculateMedian = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const padHour = (hour: number): string => hour.toString().padStart(2, '0');

// ===== REGEL 1: Beste Posting-Zeit =====
export function insightsFromBestTime(
  rows: Array<{ platform: string; weekday: number; hour: number; avg_eng_rate: number; n: number }>,
  lang: Lang = 'de'
): InsightCardData[] {
  const out: InsightCardData[] = [];
  const byPlatform = groupBy(rows, r => r.platform);
  const weekdays = i18n.weekdays[lang];

  Object.entries(byPlatform).forEach(([platform, arr]) => {
    const median = calculateMedian(arr.map(a => a.avg_eng_rate));
    const top = arr
      .filter(a => a.n >= 3)
      .sort((a, b) => b.avg_eng_rate - a.avg_eng_rate)[0];

    if (top && top.avg_eng_rate > median * 1.15) {
      const deltaPercent = Math.round((top.avg_eng_rate / median - 1) * 100);
      out.push({
        title: i18n.bestTimeTitle[lang](weekdays[top.weekday] || '', padHour(top.hour), platform),
        delta: i18n.avgEng[lang](deltaPercent),
        evidence: i18n.postsBracket[lang](top.n),
        icon: Clock,
        actions: [
          {
            label: i18n.addToCalendar[lang],
            href: `/calendar?preset_weekday=${top.weekday}&preset_hour=${top.hour}`,
            variant: 'default'
          }
        ],
        priority: 'high'
      });
    }
  });

  return out;
}

// ===== REGEL 2: Post-Typ-Empfehlung =====
export function insightsFromPostType(
  rows: Array<{ platform: string; post_type: string; avg_eng_rate: number; n: number }>,
  lang: Lang = 'de'
): InsightCardData[] {
  const out: InsightCardData[] = [];
  const byPlatform = groupBy(rows, r => r.platform);

  Object.entries(byPlatform).forEach(([platform, types]) => {
    const sorted = types.sort((a, b) => b.avg_eng_rate - a.avg_eng_rate);
    const best = sorted[0];
    const second = sorted[1];

    if (best && second && best.avg_eng_rate > second.avg_eng_rate * 1.2 && best.n >= 3) {
      const deltaPercent = Math.round((best.avg_eng_rate / second.avg_eng_rate - 1) * 100);
      out.push({
        title: i18n.postTypeTitle[lang](best.post_type, platform),
        delta: i18n.moreEngagement[lang](deltaPercent),
        evidence: i18n.postsAnalyzed[lang](best.n),
        icon: TrendingUp,
        actions: [
          {
            label: i18n.createMore[lang],
            href: `/composer?post_type=${best.post_type.toLowerCase()}`,
            variant: 'default'
          }
        ],
        priority: 'medium'
      });
    }
  });

  return out;
}

// ===== REGEL 3: Hashtag-Power-Set =====
export function insightsFromHashtags(
  rows: Array<{ tag: string; avg_eng_rate: number; uses: number }>,
  lang: Lang = 'de'
): InsightCardData[] {
  const topQuartile = rows
    .filter(r => r.uses >= 3)
    .sort((a, b) => b.avg_eng_rate - a.avg_eng_rate)
    .slice(0, 5);

  if (topQuartile.length >= 3) {
    return [{
      title: i18n.hashtagTitle[lang],
      delta: i18n.avgEngRate[lang](Math.round(topQuartile[0].avg_eng_rate)),
      evidence: i18n.topHashtags[lang](topQuartile[0].uses),
      icon: Hash,
      actions: [
        {
          label: i18n.saveAsSet[lang],
          href: `/composer?hashtags=${topQuartile.map(h => h.tag).join(',')}`,
          variant: 'outline'
        }
      ],
      priority: 'medium'
    }];
  }
  return [];
}

// ===== REGEL 4: Caption-Länge Sweet Spot =====
export function insightsFromCaptionLength(
  rows: Array<{ bucket: 'kurz' | 'mittel' | 'lang'; avg_eng_rate: number; n: number }>,
  lang: Lang = 'de'
): InsightCardData[] {
  const sorted = [...rows].sort((a, b) => b.avg_eng_rate - a.avg_eng_rate);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const buckets = i18n.bucketNames[lang];

  if (best && worst && best.avg_eng_rate > worst.avg_eng_rate * 1.3) {
    const rangeMap: Record<string, string> = {
      kurz: '< 80',
      mittel: '80–220',
      lang: '> 220'
    };

    const deltaPercent = Math.round((best.avg_eng_rate / worst.avg_eng_rate - 1) * 100);
    
    return [{
      title: i18n.captionTitle[lang](buckets[best.bucket] || best.bucket),
      delta: i18n.captionDelta[lang](deltaPercent, buckets[worst.bucket] || worst.bucket),
      evidence: i18n.postsAnalyzed[lang](best.n),
      icon: Type,
      actions: [
        {
          label: i18n.openTemplate[lang],
          href: `/composer?caption_hint=${rangeMap[best.bucket]}`,
          variant: 'default'
        }
      ],
      priority: 'medium'
    }];
  }
  return [];
}

// ===== REGEL 5: Engagement Decay Alarm =====
export function insightsFromTrend(
  recent7d: number,
  baseline14d: number,
  lang: Lang = 'de'
): InsightCardData[] {
  if (recent7d < baseline14d * 0.75) {
    const deltaPercent = Math.round((1 - recent7d / baseline14d) * 100);
    return [{
      title: i18n.trendTitle[lang],
      delta: i18n.trendDelta[lang](deltaPercent),
      evidence: i18n.last7vs14[lang],
      icon: AlertTriangle,
      actions: [
        {
          label: i18n.testPostingTime[lang],
          href: '/calendar',
          variant: 'default'
        },
        {
          label: i18n.tryOtherFormats[lang],
          href: '/composer',
          variant: 'outline'
        }
      ],
      priority: 'high'
    }];
  }
  return [];
}

// ===== Aggregator Function =====
export function generateAllInsights(data: {
  bestTime: any[];
  postType: any[];
  hashtags: any[];
  captionLen: any[];
  trend: { recent7d: number; baseline14d: number };
}, language: Lang = 'de'): InsightCardData[] {
  const insights = [
    ...insightsFromBestTime(data.bestTime, language),
    ...insightsFromPostType(data.postType, language),
    ...insightsFromHashtags(data.hashtags, language),
    ...insightsFromCaptionLength(data.captionLen, language),
    ...insightsFromTrend(data.trend.recent7d, data.trend.baseline14d, language)
  ];

  // Sort by priority
  return insights.sort((a, b) => {
    const priorityMap = { high: 3, medium: 2, low: 1 };
    return priorityMap[b.priority] - priorityMap[a.priority];
  });
}
