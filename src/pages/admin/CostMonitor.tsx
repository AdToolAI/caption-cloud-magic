import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, DollarSign, Loader2 } from 'lucide-react';
import { CostKpiCards } from '@/components/admin/cost/CostKpiCards';
import { ProviderCostBreakdown } from '@/components/admin/cost/ProviderCostBreakdown';
import { TopExpensiveFunctionsCard } from '@/components/admin/cost/TopExpensiveFunctionsCard';
import { CostTrendChart } from '@/components/admin/cost/CostTrendChart';
import { CostAlertsCard } from '@/components/admin/cost/CostAlertsCard';
import { toast } from 'sonner';

interface Snapshot {
  timestamp: string;
  window_days: number;
  summary: any;
  providers: any[];
  top_endpoints: any[];
  trend: any[];
  alerts: any[];
}

export function CostMonitor() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (d: number) => {
    setLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-cost-snapshot?days=${d}`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ''}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('Cost snapshot failed', e);
      toast.error('Cost-Snapshot fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(days); }, [days]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Cost Monitor</h2>
            <p className="text-sm text-muted-foreground">
              Live-Schätzung der Cloud-, AI- und Lambda-Kosten · alle Werte „Estimated"
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Letzte 24h</SelectItem>
              <SelectItem value="7">7 Tage</SelectItem>
              <SelectItem value="30">30 Tage</SelectItem>
              <SelectItem value="90">90 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => load(days)} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {!data && loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <>
          <CostKpiCards summary={data.summary} days={data.window_days} />
          <CostAlertsCard alerts={data.alerts} />
          <div className="grid gap-6 lg:grid-cols-2">
            <ProviderCostBreakdown providers={data.providers} />
            <TopExpensiveFunctionsCard endpoints={data.top_endpoints} />
          </div>
          <CostTrendChart trend={data.trend} />
          <p className="text-xs text-muted-foreground text-center pt-2">
            Letzte Aktualisierung: {new Date(data.timestamp).toLocaleString('de-DE')} · Schätzungen basieren auf dokumentierten Stückpreisen × gezähltem Call-Volumen
          </p>
        </>
      )}
    </div>
  );
}
