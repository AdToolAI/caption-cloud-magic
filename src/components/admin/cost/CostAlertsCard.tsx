import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Alert {
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export function CostAlertsCard({ alerts }: { alerts: Alert[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          Cost Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((a, i) => {
          const Icon = a.severity === 'critical' ? AlertCircle : a.severity === 'warning' ? AlertTriangle : CheckCircle2;
          const color =
            a.severity === 'critical' ? 'text-destructive' :
            a.severity === 'warning' ? 'text-yellow-500' : 'text-green-500';
          const bg =
            a.severity === 'critical' ? 'bg-destructive/10 border-destructive/20' :
            a.severity === 'warning' ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-green-500/10 border-green-500/20';
          return (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${bg}`}>
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
              <p className="text-sm">{a.message}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
