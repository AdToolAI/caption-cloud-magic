import { tx } from "@/lib/i18nText";
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
      toast.success(tx({ de: `Check OK — ${data?.triggered ?? 0} neue Alerts, ${data?.auto_resolved?.length ?? 0} auto-resolved`, en: `Check OK — ${data?.triggered ?? 0} new alerts, ${data?.auto_resolved?.length ?? 0} auto resolved`, es: `Marque Aceptar - ${data?.triggered ?? 0} nuevas alertas, ${data?.auto_resolved?.length ?? 0} resuelto automáticamente` }));
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(tx({ de: `Fehler: ${e?.message ?? 'unknown'}`, en: `Error: ${e?.message ?? 'unknown'}`, es: `Error: ${e?.message ?? 'desconocido'}` }));
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
                {tx({ de: "Automatische Überwachung mit Email-Benachrichtigung an den Admin", en: "Automatic monitoring with email notification to the admin", es: "Monitoreo automático con notificación por correo al administrador" })}
              </p>
            </div>
            <Button onClick={runHealthCheck} disabled={running} variant="outline">
              {running ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              {tx({ de: "Testlauf", en: "Test run", es: "Ejecución de prueba" })}
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
            <CardTitle className="text-lg">{tx({ de: "ℹ️ So funktioniert's", en: "ℹ️ How it works", es: "ℹ️ Cómo funciona" })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <b className="text-foreground">Health-Alerter</b> {tx({ de: "läuft alle", en: "runs every", es: "se ejecuta cada" })} <b>10 {tx({ de: "Minuten", en: "minutes", es: "minutos" })}</b> {tx({ de: "und prüft 5 Schwellen.", en: "and checks 5 thresholds.", es: "y comprueba 5 umbrales." })}
              {tx({ de: "Ist eine überschritten und die Cooldown abgelaufen, geht eine Email raus.", en: "If one is exceeded and the cooldown has expired, an email is sent.", es: "Si se supera uno y el cooldown ha expirado, se envía un correo." })}
            </p>
            <p>
              {tx({ de: <><b className="text-foreground">Auto-Resolve:</b> Sobald der Wert beim nächsten Check wieder unter der Schwelle liegt, wird der Alert automatisch geschlossen.</>, en: <><b className="text-foreground">Auto-resolve:</b> As soon as the value is back below the threshold at the next check, the alert is closed automatically.</>, es: <><b className="text-foreground">Resolución automática:</b> En cuanto el valor vuelva a estar por debajo del umbral en la siguiente comprobación, la alerta se cierra automáticamente.</> })}
            </p>
            <p>
              {tx({ de: <><b className="text-foreground">Wöchentlicher Report:</b> Jeden Sonntag um 08:00 Uhr kommt eine HTML-Übersicht mit allen wichtigen KPIs der letzten 7 Tage.</>, en: <><b className="text-foreground">Weekly report:</b> Every Sunday at 08:00, an HTML overview with all important KPIs of the last 7 days is sent.</>, es: <><b className="text-foreground">Informe semanal:</b> Cada domingo a las 08:00 se envía un resumen HTML con todos los KPI importantes de los últimos 7 días.</> })}
            </p>
            <p>
              {tx({ de: <><b className="text-foreground">Cleanup:</b> Alerts älter als 30 Tage werden automatisch entfernt.</>, en: <><b className="text-foreground">Cleanup:</b> Alerts older than 30 days are automatically removed.</>, es: <><b className="text-foreground">Limpieza:</b> Las alertas de más de 30 días se eliminan automáticamente.</> })}
            </p>
          </CardContent>
        </Card>
      </div>

      <AlertHistoryTable />
    </div>
  );
}
