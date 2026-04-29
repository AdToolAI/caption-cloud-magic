import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Target, TrendingUp, MousePointerClick, Mail, ShoppingCart } from 'lucide-react';

const GOALS = [
  { id: 'awareness', label: 'Reichweite', desc: 'Neue Follower & Views', icon: TrendingUp },
  { id: 'engagement', label: 'Engagement', desc: 'Likes, Kommentare, Saves', icon: Target },
  { id: 'traffic', label: 'Traffic', desc: 'Klicks auf Link in Bio', icon: MousePointerClick },
  { id: 'leads', label: 'Leads', desc: 'E-Mails / DMs / Anfragen', icon: Mail },
  { id: 'sales', label: 'Verkäufe', desc: 'Direkter Produktverkauf', icon: ShoppingCart },
] as const;

const BUDGETS = [10, 25, 50, 100, 250] as const;

export interface GoalBriefingValue {
  channel_goal: 'awareness' | 'engagement' | 'traffic' | 'leads' | 'sales';
  weekly_budget_eur: number;
  content_mix: { ai_video: number; stock_reel: number; static: number };
  target_audience: string;
  usp: string;
}

interface Props {
  value: GoalBriefingValue;
  onChange: (next: GoalBriefingValue) => void;
}

export function AutopilotGoalBriefingStep({ value, onChange }: Props) {
  const set = (patch: Partial<GoalBriefingValue>) => onChange({ ...value, ...patch });

  // Mix slider — when one changes, normalize the other two proportionally
  const updateMix = (key: keyof GoalBriefingValue['content_mix'], v: number) => {
    const others = (Object.keys(value.content_mix) as Array<keyof typeof value.content_mix>).filter((k) => k !== key);
    const remaining = 100 - v;
    const sumOthers = others.reduce((s, k) => s + value.content_mix[k], 0) || 1;
    const next = { ...value.content_mix, [key]: v };
    others.forEach((k) => {
      next[k] = Math.max(0, Math.round((value.content_mix[k] / sumOthers) * remaining));
    });
    // Fix rounding
    const total = next.ai_video + next.stock_reel + next.static;
    if (total !== 100) next.static += (100 - total);
    set({ content_mix: next });
  };

  return (
    <div className="space-y-6">
      {/* Goal */}
      <div>
        <Label className="text-base font-semibold mb-3 block">Was ist das Ziel deines Kanals?</Label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {GOALS.map((g) => {
            const Icon = g.icon;
            const active = value.channel_goal === g.id;
            return (
              <Card
                key={g.id}
                onClick={() => set({ channel_goal: g.id })}
                className={cn(
                  'p-3 cursor-pointer transition-all hover:border-primary/50',
                  active && 'border-primary bg-primary/5 ring-1 ring-primary/30',
                )}
              >
                <Icon className={cn('h-5 w-5 mb-1', active ? 'text-primary' : 'text-muted-foreground')} />
                <div className="font-medium text-sm">{g.label}</div>
                <div className="text-xs text-muted-foreground">{g.desc}</div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Budget */}
      <div>
        <Label className="text-base font-semibold mb-3 block">
          Wochen-Budget: <span className="text-primary">{value.weekly_budget_eur} €</span>
        </Label>
        <div className="flex flex-wrap gap-2 mb-3">
          {BUDGETS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => set({ weekly_budget_eur: b })}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm border transition-colors',
                value.weekly_budget_eur === b
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/40',
              )}
            >
              {b} €
            </button>
          ))}
          <Input
            type="number"
            min={5}
            value={value.weekly_budget_eur}
            onChange={(e) => set({ weekly_budget_eur: Math.max(5, parseInt(e.target.value) || 5) })}
            className="w-24 h-8"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {value.weekly_budget_eur < 20
            ? '⚠️ Niedriges Budget: KI-Videos werden automatisch deaktiviert. Fokus auf KI-Bilder und Stock-Reels.'
            : value.weekly_budget_eur < 50
            ? 'Mittleres Budget: gemischte Strategie aus Bildern, Stock & einzelnen KI-Videos.'
            : 'Hohes Budget: Volle KI-Video-Pipeline möglich.'}
        </p>
      </div>

      {/* Content Mix */}
      <div>
        <Label className="text-base font-semibold mb-3 block">Content-Mix</Label>
        <div className="space-y-3">
          {([
            { key: 'ai_video', label: 'KI-Videos (teuer)', color: 'bg-rose-500' },
            { key: 'stock_reel', label: 'Stock + KI-Bild Reels (mittel)', color: 'bg-amber-500' },
            { key: 'static', label: 'Statische Bild-Posts (günstig)', color: 'bg-emerald-500' },
          ] as const).map((row) => (
            <div key={row.key}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span>{row.label}</span>
                <span className="font-mono text-primary">{value.content_mix[row.key]}%</span>
              </div>
              <Slider
                value={[value.content_mix[row.key]]}
                min={0}
                max={100}
                step={5}
                onValueChange={(v) => updateMix(row.key, v[0])}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Audience & USP */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="audience">Zielgruppe</Label>
          <Textarea
            id="audience"
            placeholder="z.B. Selbstständige Coaches in DACH, 30–45, Instagram-affin"
            maxLength={280}
            value={value.target_audience}
            onChange={(e) => set({ target_audience: e.target.value })}
            className="resize-none h-20"
          />
        </div>
        <div>
          <Label htmlFor="usp">USP / Was macht dich besonders?</Label>
          <Textarea
            id="usp"
            placeholder="z.B. KI-gestützte 1:1 Coachings ohne Wartezeit"
            maxLength={280}
            value={value.usp}
            onChange={(e) => set({ usp: e.target.value })}
            className="resize-none h-20"
          />
        </div>
      </div>
    </div>
  );
}
