import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';

type Status = 'ok' | 'warn' | 'error' | 'unknown';

interface ChannelDiagnostic {
  id: string;
  name: string;
  credentials: Status;
  credentialsNote?: string;
  connection: Status;
  connectionNote?: string;
  publishing: Status;
  publishingNote?: string;
}

const HEALTH_FN: Record<string, string | null> = {
  instagram: 'health-ig',
  facebook: null, // covered by health-ig (shared Meta credentials)
  tiktok: 'health-tt',
  youtube: 'health-yt',
  linkedin: 'health-li',
  x: 'health-x',
};

const CHANNELS: { id: string; name: string }[] = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'tiktok', name: 'TikTok' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'linkedin', name: 'LinkedIn' },
  { id: 'x', name: 'X' },
];

function StatusPill({ status, label }: { status: Status; label: string }) {
  const Icon = status === 'ok' ? CheckCircle2 : status === 'warn' ? AlertTriangle : status === 'error' ? XCircle : Loader2;
  const cls =
    status === 'ok'
      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
      : status === 'warn'
      ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
      : status === 'error'
      ? 'bg-destructive/10 text-destructive border-destructive/30'
      : 'bg-muted text-muted-foreground border-border';
  return (
    <Badge variant="outline" className={`gap-1 font-normal ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export function ConnectionDiagnostics() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ChannelDiagnostic[]>([]);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;

      const [healthResults, socialHealth] = await Promise.all([
        Promise.all(
          CHANNELS.map(async (channel) => {
            const fn = HEALTH_FN[channel.id] ?? HEALTH_FN.instagram;
            if (!fn) return { id: channel.id, ok: null as boolean | null, note: undefined as string | undefined };
            try {
              const { data, error } = await supabase.functions.invoke(fn, { headers });
              if (error) return { id: channel.id, ok: false, note: error.message };
              return {
                id: channel.id,
                ok: data?.ok !== false,
                env: typeof data?.env === 'string' ? (data.env as string) : undefined,
                note: Array.isArray(data?.missing) && data.missing.length ? data.missing.join(', ') : data?.message,
              };
            } catch (e: any) {
              return { id: channel.id, ok: false, note: e?.message };
            }
          }),
        ),
        (async () => {
          try {
            const { data } = await supabase.functions.invoke('social-health', { headers });
            return (data?.providers ?? {}) as Record<string, { connected?: boolean; expiring_in_days?: number }>;
          } catch {
            return {} as Record<string, { connected?: boolean; expiring_in_days?: number }>;
          }
        })(),
      ]);

      const next: ChannelDiagnostic[] = CHANNELS.map((channel) => {
        const health = healthResults.find((h) => h.id === channel.id);
        const conn = socialHealth[channel.id];

        const credentials: Status = health?.ok === null ? 'unknown' : health?.ok ? 'ok' : 'error';
        const connected = !!conn?.connected;
        const expiring = conn?.expiring_in_days;

        const connection: Status = !connected ? 'warn' : expiring !== undefined && expiring <= 7 ? 'warn' : 'ok';
        const connectionNote = !connected
          ? t('connectionDiagnostics.notConnected')
          : expiring !== undefined
          ? t('connectionDiagnostics.expiresInDays').replace('{days}', String(expiring))
          : undefined;

        let publishing: Status = 'unknown';
        let publishingNote: string | undefined;
        if (credentials !== 'ok') {
          publishing = 'error';
          publishingNote = t('connectionDiagnostics.credentialsMissing');
        } else if (!connected) {
          publishing = 'warn';
          publishingNote = t('connectionDiagnostics.connectFirst');
        } else {
          publishing = 'ok';
          if (channel.id === 'tiktok') {
            const env = (health as any)?.env;
            publishingNote =
              env && env !== 'production'
                ? t('connectionDiagnostics.tiktokSandbox').replace('{env}', env)
                : t('connectionDiagnostics.tiktokLive');
          }
        }

        return {
          id: channel.id,
          name: channel.name,
          credentials,
          credentialsNote: health?.note,
          connection,
          connectionNote,
          publishing,
          publishingNote,
        };
      });

      setRows(next);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{t('connectionDiagnostics.title')}</CardTitle>
          <CardDescription>{t('connectionDiagnostics.description')}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">{t('connectionDiagnostics.refresh')}</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && loading && (
          <p className="text-sm text-muted-foreground">{t('connectionDiagnostics.checking')}</p>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-[9rem]">
              <p className="font-medium">{row.name}</p>
              {(row.connectionNote || row.publishingNote || row.credentialsNote) && (
                <p className="text-xs text-muted-foreground">
                  {row.credentials !== 'ok' && row.credentialsNote
                    ? row.credentialsNote
                    : row.connectionNote || row.publishingNote}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill
                status={row.credentials}
                label={t('connectionDiagnostics.credentials')}
              />
              <StatusPill status={row.connection} label={t('connectionDiagnostics.connection')} />
              <StatusPill status={row.publishing} label={t('connectionDiagnostics.publishing')} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default ConnectionDiagnostics;
