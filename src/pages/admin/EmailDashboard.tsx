import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { EmailKpiCards } from '@/components/admin/email/EmailKpiCards';
import { EmailLogTable } from '@/components/admin/email/EmailLogTable';
import { SuppressionManager } from '@/components/admin/email/SuppressionManager';

type Range = '24h' | '7d' | '30d';

export function EmailDashboard() {
  const [range, setRange] = useState<Range>('7d');
  const [stats, setStats] = useState({
    sent: 0, suppressed: 0, failed: 0, bouncesComplaints: 0, bounceRate: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const since = new Date();
      if (range === '24h') since.setHours(since.getHours() - 24);
      else if (range === '7d') since.setDate(since.getDate() - 7);
      else since.setDate(since.getDate() - 30);
      const sinceIso = since.toISOString();

      // Counts in parallel — head:true means count-only, no rows.
      const [sentRes, suppRes, failRes, bcRes] = await Promise.all([
        supabase.from('email_send_log').select('*', { count: 'exact', head: true })
          .gte('created_at', sinceIso).eq('status', 'sent'),
        supabase.from('email_send_log').select('*', { count: 'exact', head: true })
          .gte('created_at', sinceIso).eq('status', 'suppressed'),
        supabase.from('email_send_log').select('*', { count: 'exact', head: true })
          .gte('created_at', sinceIso).eq('status', 'failed'),
        supabase.from('email_suppression_list').select('*', { count: 'exact', head: true })
          .in('reason', ['bounce', 'complaint']),
      ]);

      if (cancelled) return;

      const sent = sentRes.count ?? 0;
      const suppressed = suppRes.count ?? 0;
      const failed = failRes.count ?? 0;
      const bouncesComplaints = bcRes.count ?? 0;
      const totalAttempts = sent + suppressed + failed;
      // Bounce-rate proxy = suppressed (mostly bounces) / total attempts in window
      const bounceRate = totalAttempts > 0 ? (suppressed / totalAttempts) * 100 : 0;

      setStats({ sent, suppressed, failed, bouncesComplaints, bounceRate });
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [range]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Email Monitor</h2>
          <p className="text-sm text-muted-foreground">Send-Log, Suppression & Deliverability</p>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-card/60 p-1">
          {(['24h', '7d', '30d'] as Range[]).map((r) => (
            <Button
              key={r}
              variant={range === r ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setRange(r)}
              className="px-4"
            >
              {r === '24h' ? 'Letzte 24h' : r === '7d' ? '7 Tage' : '30 Tage'}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <EmailKpiCards {...stats} />
      )}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Send-Log</h3>
        <EmailLogTable range={range} />
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Suppression-Liste</h3>
        <SuppressionManager />
      </section>
    </div>
  );
}

export default EmailDashboard;
