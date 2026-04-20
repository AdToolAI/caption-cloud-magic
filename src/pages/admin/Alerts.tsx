import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertSummaryCards } from '@/components/admin/alerts/AlertSummaryCards';
import { ActiveAlertsCard } from '@/components/admin/alerts/ActiveAlertsCard';
import { AlertConfigCard } from '@/components/admin/alerts/AlertConfigCard';
import { AlertHistoryTable } from '@/components/admin/alerts/AlertHistoryTable';

export default function Alerts() {
  const [running, setRunning] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const runHealthCheck = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('health-alerter');
      if (error) throw error;
      toast.success(`Check OK — ${data?.triggered ?? 0} neue Alerts, ${data?.auto_resolved?.length ?? 0} auto-resolved`);
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(`Fehler: ${e?.message ?? 'unknown'}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6" key={refreshKey}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-2xl">🚨 Alerts &amp; Health Monitoring</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Automatische Überwachung mit Email-Benachrichtigung an den Admin
              </p>
            </div>
            <Button onClick={runHealthCheck} disabled={running} variant="outline">
              {running ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Test Run
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <AlertSummaryCards />
        </CardContent>
      </Card>

      <ActiveAlertsCard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertConfigCard />
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">ℹ️ So funktioniert's</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <b className="text-foreground">Health-Alerter</b> läuft alle <b>10 Minuten</b> und prüft 5 Schwellen.
              Ist eine überschritten und die Cooldown abgelaufen, geht eine Email raus.
            </p>
            <p>
              <b className="text-foreground">Auto-Resolve:</b> Sobald der Wert beim nächsten Check
              wieder unter der Schwelle liegt, wird der Alert automatisch geschlossen.
            </p>
            <p>
              <b className="text-foreground">Wöchentlicher Report:</b> Jeden Sonntag um 08:00 Uhr
              kommt eine HTML-Übersicht mit allen wichtigen KPIs der letzten 7 Tage.
            </p>
            <p>
              <b className="text-foreground">Cleanup:</b> Alerts älter als 30 Tage werden automatisch entfernt.
            </p>
          </CardContent>
        </Card>
      </div>

      <AlertHistoryTable />
    </div>
  );
}
