import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, ShieldAlert, ShieldCheck } from 'lucide-react';

interface Props {
  current: number;
  normal: number;
  safe: number;
  circuitBreakerActive: boolean;
}

export const ConcurrencyStatusCard = ({ current, normal, safe, circuitBreakerActive }: Props) => {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Lambda Concurrency</h3>
        </div>
        {circuitBreakerActive ? (
          <Badge variant="destructive" className="gap-1">
            <ShieldAlert className="h-3 w-3" />
            Tripped
          </Badge>
        ) : (
          <Badge className="gap-1 bg-success text-success-foreground">
            <ShieldCheck className="h-3 w-3" />
            Normal
          </Badge>
        )}
      </div>
      <div className="text-4xl font-bold mb-2">{current}</div>
      <div className="text-sm text-muted-foreground space-y-1">
        <div>Normal max: <span className="font-medium text-foreground">{normal}</span></div>
        <div>Safe fallback: <span className="font-medium text-foreground">{safe}</span></div>
        <div className="pt-2 text-xs">
          {circuitBreakerActive
            ? 'Circuit breaker has tripped — using safe concurrency.'
            : 'System operating at normal concurrency.'}
        </div>
      </div>
    </Card>
  );
};
