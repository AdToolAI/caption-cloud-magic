import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Mail } from 'lucide-react';

const ADMIN_EMAIL = 'bestofproducts4u@gmail.com';

const CONFIG = [
  { name: 'Bounce-Rate >2%', cooldown: '60 min', severity: 'Warning' },
  { name: 'Cost-Forecast >80% Free-Tier ($25)', cooldown: '6 Std', severity: 'Warning' },
  { name: 'Cost-Forecast >100% Free-Tier', cooldown: '60 min', severity: 'Critical' },
  { name: 'Provider-Failures >3 in 5 Min', cooldown: '15 min', severity: 'Critical' },
  { name: 'Cache Hit-Rate <50% (1h)', cooldown: '2 Std', severity: 'Warning' },
  { name: 'Provider-Quota >80% Auslastung', cooldown: '60 min', severity: 'Warning' },
  { name: 'AWS Lambda 3/3 belegt', cooldown: '60 min', severity: 'Warning' },
];

export function AlertConfigCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5 text-primary" />
          Alert-Konfiguration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-sm text-muted-foreground mb-3">
          Alle Alerts gehen an: <span className="font-mono text-primary">{ADMIN_EMAIL}</span>
        </div>
        {CONFIG.map((c) => (
          <div key={c.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              <span className="text-sm">{c.name}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{c.severity}</span>
              <span>· Cooldown {c.cooldown}</span>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between py-2 mt-3 pt-3 border-t-2 border-primary/30">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span className="text-sm font-medium">Wöchentlicher Health-Report</span>
          </div>
          <span className="text-xs text-muted-foreground">Sonntags 08:00</span>
        </div>
      </CardContent>
    </Card>
  );
}
