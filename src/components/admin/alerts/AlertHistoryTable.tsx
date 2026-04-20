import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Row {
  id: string;
  alert_type: string;
  severity: string;
  message: string;
  sent_at: string;
  resolved_at: string | null;
}

export function AlertHistoryTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'resolved' | 'active'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();
      let q = supabase
        .from('alert_notifications')
        .select('id,alert_type,severity,message,sent_at,resolved_at')
        .gte('created_at', since30d)
        .order('sent_at', { ascending: false })
        .limit(200);

      if (filter === 'critical' || filter === 'warning') q = q.eq('severity', filter);
      if (filter === 'resolved') q = q.not('resolved_at', 'is', null);
      if (filter === 'active') q = q.is('resolved_at', null);

      const { data } = await q;
      setRows((data as any) ?? []);
      setLoading(false);
    };
    load();
  }, [filter]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-primary" />
            Alert-Historie (30 Tage)
          </CardTitle>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Keine Einträge.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">Zeitpunkt</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 pr-3">Message</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(r.sent_at).toLocaleString('de-DE', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.alert_type}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={r.severity === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
                        {r.severity}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 max-w-md truncate" title={r.message}>{r.message}</td>
                    <td className="py-2">
                      {r.resolved_at ? (
                        <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">Resolved</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Aktiv</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
