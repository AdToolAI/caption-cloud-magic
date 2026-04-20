import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AlertRow {
  id: string;
  alert_type: string;
  severity: string;
  message: string;
  metric_value: number;
  threshold: number;
  sent_at: string;
}

export function ActiveAlertsCard() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from('alert_notifications')
      .select('id,alert_type,severity,message,metric_value,threshold,sent_at')
      .is('resolved_at', null)
      .order('sent_at', { ascending: false })
      .limit(50);
    setAlerts((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 30_000);
    return () => clearInterval(i);
  }, []);

  const resolve = async (id: string) => {
    const { error } = await supabase
      .from('alert_notifications')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast.error('Resolve fehlgeschlagen');
    } else {
      toast.success('Alert resolved');
      load();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Aktive Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-green-500 py-4">
            <CheckCircle2 className="h-5 w-5" />
            <span>Keine aktiven Alerts — alles im grünen Bereich.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-muted/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={a.severity === 'critical' ? 'destructive' : 'secondary'}>
                      {a.severity.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">{a.alert_type}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.sent_at).toLocaleString('de-DE')}
                    </span>
                  </div>
                  <p className="text-sm">{a.message}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => resolve(a.id)}>
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
