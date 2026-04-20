import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Stats {
  critical: number;
  warning: number;
  resolved7d: number;
  lastCheck: string | null;
}

export function AlertSummaryCards() {
  const [stats, setStats] = useState<Stats>({ critical: 0, warning: 0, resolved7d: 0, lastCheck: null });

  useEffect(() => {
    const load = async () => {
      const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [activeRes, resolvedRes, lastRes] = await Promise.all([
        supabase.from('alert_notifications').select('severity').is('resolved_at', null),
        supabase.from('alert_notifications').select('id', { count: 'exact', head: true }).not('resolved_at', 'is', null).gte('created_at', since7d),
        supabase.from('alert_notifications').select('sent_at').order('sent_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      const active = activeRes.data ?? [];
      setStats({
        critical: active.filter((a: any) => a.severity === 'critical').length,
        warning: active.filter((a: any) => a.severity === 'warning').length,
        resolved7d: resolvedRes.count ?? 0,
        lastCheck: lastRes.data?.sent_at ?? null,
      });
    };
    load();
    const i = setInterval(load, 30_000);
    return () => clearInterval(i);
  }, []);

  const lastCheckStr = stats.lastCheck
    ? new Date(stats.lastCheck).toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : '—';

  const cards = [
    { label: 'Kritisch', value: stats.critical, icon: AlertTriangle, color: stats.critical > 0 ? 'text-destructive' : 'text-muted-foreground' },
    { label: 'Warnungen', value: stats.warning, icon: Bell, color: stats.warning > 0 ? 'text-yellow-500' : 'text-muted-foreground' },
    { label: 'Resolved 7d', value: stats.resolved7d, icon: CheckCircle2, color: 'text-green-500' },
    { label: 'Letzter Check', value: lastCheckStr, icon: Clock, color: 'text-primary' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4 flex items-center gap-3">
            <c.icon className={`h-8 w-8 ${c.color}`} />
            <div>
              <div className="text-2xl font-bold">{c.value}</div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
