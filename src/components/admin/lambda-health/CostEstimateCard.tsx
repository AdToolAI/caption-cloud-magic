import { Card } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';
import { KpiBar } from '@/components/ui/KpiBar';

interface Props {
  last_24h_usd: number;
  last_7d_usd: number;
  avg_per_render_usd: number;
  renders_24h: number;
  total_seconds_24h: number;
}

export const CostEstimateCard = ({
  last_24h_usd,
  last_7d_usd,
  avg_per_render_usd,
  renders_24h,
  total_seconds_24h,
}: Props) => {
  // AWS Lambda free tier ≈ $25/mo Cloud budget reference
  const monthlyProjected = last_7d_usd * (30 / 7);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">AWS Lambda Cost Estimate</h3>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs text-muted-foreground">Last 24h</div>
          <div className="text-2xl font-bold">${last_24h_usd.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {renders_24h} renders · {(total_seconds_24h / 60).toFixed(1)} min
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Last 7d</div>
          <div className="text-2xl font-bold">${last_7d_usd.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Ø ${avg_per_render_usd.toFixed(4)} / render
          </div>
        </div>
      </div>
      <div className="pt-4 border-t border-border">
        <KpiBar
          label="Projected monthly spend"
          value={Math.round(monthlyProjected * 100) / 100}
          max={25}
          color={monthlyProjected > 20 ? 'error' : monthlyProjected > 12 ? 'warning' : 'success'}
        />
        <div className="text-xs text-muted-foreground mt-2">
          Based on $0.0167/min @ 3008 MB · vs. $25 Cloud budget reference
        </div>
      </div>
    </Card>
  );
};
