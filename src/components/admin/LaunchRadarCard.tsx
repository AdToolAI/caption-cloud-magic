import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Radar, RefreshCw, Users, Film, CreditCard, Activity, Trophy } from 'lucide-react';

interface RadarStats {
  days_since_launch: number;
  users_total: number;
  users_24h: number;
  users_7d: number;
  videos_24h: number;
  videos_7d: number;
  events_24h: number;
  paying_customers: number;
  milestones: Array<{ key: string; label: string | null; achieved_at: string }>;
  recent_signups: Array<{ email: string; created_at: string; plan: string | null; language: string | null }>;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

export function LaunchRadarCard() {
  const [stats, setStats] = useState<RadarStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke('launch-radar-stats');
    if (fnError) {
      setError(fnError.message);
    } else {
      setStats(data as RadarStats);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const metrics = stats
    ? [
        { icon: Users, label: 'Registrierungen (24h)', value: stats.users_24h, sub: `${stats.users_7d} in 7 Tagen` },
        { icon: Film, label: 'Videos (24h)', value: stats.videos_24h, sub: `${stats.videos_7d} in 7 Tagen` },
        { icon: CreditCard, label: 'Zahlende Kunden', value: stats.paying_customers, sub: `${stats.users_total} Nutzer gesamt` },
        { icon: Activity, label: 'App-Ereignisse (24h)', value: stats.events_24h, sub: 'Tracking-Signal' },
      ]
    : [];

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-primary" />
          Launch Radar
          {stats && (
            <Badge variant="outline" className="ml-2">
              Tag {stats.days_since_launch} seit Launch
            </Badge>
          )}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading && !stats ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : stats ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-lg border bg-card/50 p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <m.icon className="h-4 w-4" />
                    {m.label}
                  </div>
                  <div className="mt-2 text-3xl font-semibold">{m.value}</div>
                  <div className="text-xs text-muted-foreground">{m.sub}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Trophy className="h-4 w-4 text-primary" /> Meilensteine
                </h4>
                {stats.milestones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Noch kein Meilenstein erreicht.</p>
                ) : (
                  <ul className="space-y-2">
                    {stats.milestones.map((m) => (
                      <li key={m.key} className="flex items-center justify-between text-sm">
                        <span>{m.label ?? m.key}</span>
                        <span className="text-muted-foreground">{fmt(m.achieved_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-primary" /> Letzte Registrierungen
                </h4>
                {stats.recent_signups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Noch keine Registrierungen.</p>
                ) : (
                  <ul className="space-y-2">
                    {stats.recent_signups.map((s) => (
                      <li key={`${s.email}-${s.created_at}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{s.email}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {(s.plan ?? 'free')} · {fmt(s.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
