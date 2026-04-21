import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ConcurrencyStatusCard } from '@/components/admin/lambda-health/ConcurrencyStatusCard';
import { FailureRateCards } from '@/components/admin/lambda-health/FailureRateCards';
import { OutcomesDonut } from '@/components/admin/lambda-health/OutcomesDonut';
import { RenderTrendChart } from '@/components/admin/lambda-health/RenderTrendChart';
import { CostEstimateCard } from '@/components/admin/lambda-health/CostEstimateCard';
import { RecentErrorsTable } from '@/components/admin/lambda-health/RecentErrorsTable';
import { Loader2, RefreshCw, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LambdaHealthData {
  timestamp: string;
  concurrency: { current: number; normal: number; safe: number; circuit_breaker_active: boolean };
  failure_rate: {
    last_1h: { total: number; failed: number; rate: number };
    last_24h: { total: number; failed: number; rate: number };
    last_7d: { total: number; failed: number; rate: number };
  };
  outcomes: { success: number; failed: number; oom: number; timeout: number };
  trend_7d: { hour: string; total: number; success: number; failed: number }[];
  cost: {
    last_24h_usd: number;
    last_7d_usd: number;
    avg_per_render_usd: number;
    total_seconds_24h: number;
    total_seconds_7d: number;
    renders_24h: number;
  };
  recent_errors: { created_at: string; error_message: string; render_id: string | null; status: string }[];
}

export default function LambdaHealth() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<LambdaHealthData>({
    queryKey: ['lambda-health-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('lambda-health-stats');
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Server className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Lambda Health</h1>
          </div>
          <p className="text-muted-foreground">
            Live cockpit for AWS Lambda render performance, costs, and reliability.
          </p>
          {data?.timestamp && (
            <p className="text-xs text-muted-foreground mt-2">
              Last updated: {new Date(data.timestamp).toLocaleString()}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="p-6 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
          Failed to load Lambda health data: {String(error)}
        </div>
      )}

      {data && (
        <>
          {/* Top row: Concurrency + Cost */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ConcurrencyStatusCard
              current={data.concurrency.current}
              normal={data.concurrency.normal}
              safe={data.concurrency.safe}
              circuitBreakerActive={data.concurrency.circuit_breaker_active}
            />
            <CostEstimateCard
              last_24h_usd={data.cost.last_24h_usd}
              last_7d_usd={data.cost.last_7d_usd}
              avg_per_render_usd={data.cost.avg_per_render_usd}
              renders_24h={data.cost.renders_24h}
              total_seconds_24h={data.cost.total_seconds_24h}
            />
          </div>

          {/* Failure rate trio */}
          <FailureRateCards
            last_1h={data.failure_rate.last_1h}
            last_24h={data.failure_rate.last_24h}
            last_7d={data.failure_rate.last_7d}
          />

          {/* Trend + Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <RenderTrendChart data={data.trend_7d} />
            </div>
            <OutcomesDonut outcomes={data.outcomes} />
          </div>

          {/* Errors */}
          <RecentErrorsTable errors={data.recent_errors} />
        </>
      )}
    </div>
  );
}
