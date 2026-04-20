import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, ExternalLink, CheckCircle2, AlertTriangle, AlertCircle, Bug } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface SentryIssue {
  id: string;
  sentry_issue_id: string;
  short_id: string | null;
  title: string;
  culprit: string | null;
  level: string | null;
  status: string | null;
  event_count: number;
  user_count: number;
  first_seen: string | null;
  last_seen: string | null;
  permalink: string | null;
}

const levelMap: Record<string, { color: string; icon: typeof Bug }> = {
  fatal: { color: 'bg-destructive text-destructive-foreground', icon: AlertCircle },
  error: { color: 'bg-destructive/80 text-destructive-foreground', icon: AlertCircle },
  warning: { color: 'bg-yellow-500 text-white', icon: AlertTriangle },
  info: { color: 'bg-blue-500 text-white', icon: Bug },
  debug: { color: 'bg-muted text-muted-foreground', icon: Bug },
};

export function SentryDashboard() {
  const [issues, setIssues] = useState<SentryIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadCached = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sentry_issues_cache')
      .select('*')
      .order('last_seen', { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setIssues((data ?? []) as SentryIssue[]);
    setLoading(false);
  };

  const syncFromSentry = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sentry-issues');
      if (error) throw error;
      toast.success(`${data?.count ?? 0} Issues von Sentry synchronisiert`);
      await loadCached();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Fehler';
      toast.error(`Sync fehlgeschlagen: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  const resolveIssue = async (issueId: string) => {
    try {
      const { error } = await supabase.functions.invoke('sentry-issues?action=resolve', {
        body: { issueId },
      });
      if (error) throw error;
      toast.success('Issue als resolved markiert');
      await loadCached();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Fehler';
      toast.error(msg);
    }
  };

  useEffect(() => {
    loadCached();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Bug className="h-6 w-6 text-destructive" />
              Sentry Errors
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Live Production Errors aus deiner Sentry-Integration
            </p>
          </div>
          <Button onClick={syncFromSentry} disabled={syncing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync von Sentry
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Lade Errors...</div>
        ) : issues.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
            <p className="font-medium">Keine Errors gecacht</p>
            <p className="text-sm mt-1">Klicke „Sync von Sentry" um die neuesten Errors zu laden.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map((iss) => {
              const lvl = levelMap[iss.level ?? 'error'] ?? levelMap.error;
              const Icon = lvl.icon;
              return (
                <div
                  key={iss.id}
                  className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={lvl.color}>
                          <Icon className="h-3 w-3 mr-1" />
                          {iss.level}
                        </Badge>
                        {iss.short_id && (
                          <code className="text-xs text-muted-foreground">{iss.short_id}</code>
                        )}
                        <Badge variant="outline">{iss.event_count} events</Badge>
                        <Badge variant="outline">{iss.user_count} users</Badge>
                      </div>
                      <h4 className="font-semibold text-sm truncate">{iss.title}</h4>
                      {iss.culprit && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{iss.culprit}</p>
                      )}
                      {iss.last_seen && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Zuletzt:{' '}
                          {formatDistanceToNow(new Date(iss.last_seen), {
                            addSuffix: true,
                            locale: de,
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {iss.permalink && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={iss.permalink} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                      )}
                      {iss.status !== 'resolved' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resolveIssue(iss.sentry_issue_id)}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
