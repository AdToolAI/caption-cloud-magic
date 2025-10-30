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

const weekdayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

const weekdayName = (day: number): string => weekdayNames[day] || 'Unbekannt';

const padHour = (hour: number): string => hour.toString().padStart(2, '0');

// ===== REGEL 1: Beste Posting-Zeit =====
export function insightsFromBestTime(
  rows: Array<{ platform: string; weekday: number; hour: number; avg_eng_rate: number; n: number }>
): InsightCardData[] {
  const out: InsightCardData[] = [];
  const byPlatform = groupBy(rows, r => r.platform);

  Object.entries(byPlatform).forEach(([platform, arr]) => {
    const median = calculateMedian(arr.map(a => a.avg_eng_rate));
    const top = arr
      .filter(a => a.n >= 3)
      .sort((a, b) => b.avg_eng_rate - a.avg_eng_rate)[0];

    if (top && top.avg_eng_rate > median * 1.15) {
      const deltaPercent = Math.round((top.avg_eng_rate / median - 1) * 100);
      out.push({
        title: `Beste Zeit: ${weekdayName(top.weekday)} ${padHour(top.hour)}:00 für ${platform}`,
        delta: `Ø Eng +${deltaPercent}%`,
        evidence: `${top.n} Posts (28 Tage)`,
        icon: Clock,
        actions: [
          {
            label: 'Slot zu Kalender hinzufügen',
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
  rows: Array<{ platform: string; post_type: string; avg_eng_rate: number; n: number }>
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
        title: `${best.post_type} funktioniert besser auf ${platform}`,
        delta: `${deltaPercent}% mehr Engagement`,
        evidence: `${best.n} Posts analysiert`,
        icon: TrendingUp,
        actions: [
          {
            label: 'Mehr erstellen',
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
  rows: Array<{ tag: string; avg_eng_rate: number; uses: number }>
): InsightCardData[] {
  const topQuartile = rows
    .filter(r => r.uses >= 3)
    .sort((a, b) => b.avg_eng_rate - a.avg_eng_rate)
    .slice(0, 5);

  if (topQuartile.length >= 3) {
    return [{
      title: 'Top Hashtags kombinieren',
      delta: `Ø +${Math.round(topQuartile[0].avg_eng_rate)}% Engagement`,
      evidence: `5 beste Hashtags (je ${topQuartile[0].uses}× verwendet)`,
      icon: Hash,
      actions: [
        {
          label: 'Als Set speichern',
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
  rows: Array<{ bucket: 'kurz' | 'mittel' | 'lang'; avg_eng_rate: number; n: number }>
): InsightCardData[] {
  const sorted = [...rows].sort((a, b) => b.avg_eng_rate - a.avg_eng_rate);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  if (best && worst && best.avg_eng_rate > worst.avg_eng_rate * 1.3) {
    const rangeMap = {
      kurz: '< 80 Zeichen',
      mittel: '80–220 Zeichen',
      lang: '> 220 Zeichen'
    };

    const deltaPercent = Math.round((best.avg_eng_rate / worst.avg_eng_rate - 1) * 100);
    
    return [{
      title: `${best.bucket} Captions performen besser`,
      delta: `${deltaPercent}% mehr als ${worst.bucket}`,
      evidence: `${best.n} Posts analysiert`,
      icon: Type,
      actions: [
        {
          label: 'Vorlage öffnen',
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
  baseline14d: number
): InsightCardData[] {
  if (recent7d < baseline14d * 0.75) {
    const deltaPercent = Math.round((1 - recent7d / baseline14d) * 100);
    return [{
      title: '⚠️ Engagement fällt',
      delta: `${deltaPercent}% unter Baseline`,
      evidence: 'Letzte 7 vs 14 Tage',
      icon: AlertTriangle,
      actions: [
        {
          label: 'Posting-Zeit testen',
          href: '/calendar',
          variant: 'default'
        },
        {
          label: 'Andere Formate probieren',
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
}): InsightCardData[] {
  const insights = [
    ...insightsFromBestTime(data.bestTime),
    ...insightsFromPostType(data.postType),
    ...insightsFromHashtags(data.hashtags),
    ...insightsFromCaptionLength(data.captionLen),
    ...insightsFromTrend(data.trend.recent7d, data.trend.baseline14d)
  ];

  // Sort by priority
  return insights.sort((a, b) => {
    const priorityMap = { high: 3, medium: 2, low: 1 };
    return priorityMap[b.priority] - priorityMap[a.priority];
  });
}
