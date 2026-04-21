import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface FR { total: number; failed: number; rate: number }
interface Props {
  last_1h: FR;
  last_24h: FR;
  last_7d: FR;
}

const colorFor = (rate: number, total: number) => {
  if (total === 0) return 'text-muted-foreground';
  if (rate < 0.05) return 'text-success';
  if (rate < 0.15) return 'text-warning';
  return 'text-destructive';
};

const Card1 = ({ label, fr }: { label: string; fr: FR }) => (
  <Card className="p-6">
    <div className="text-sm text-muted-foreground mb-1">Failure Rate · {label}</div>
    <div className={cn('text-4xl font-bold', colorFor(fr.rate, fr.total))}>
      {fr.total === 0 ? '—' : `${(fr.rate * 100).toFixed(1)}%`}
    </div>
    <div className="text-xs text-muted-foreground mt-2">
      {fr.failed} / {fr.total} renders failed
    </div>
  </Card>
);

export const FailureRateCards = ({ last_1h, last_24h, last_7d }: Props) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <Card1 label="Last 1h" fr={last_1h} />
    <Card1 label="Last 24h" fr={last_24h} />
    <Card1 label="Last 7d" fr={last_7d} />
  </div>
);
