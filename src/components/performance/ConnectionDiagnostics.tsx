import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/hooks/use-toast';

interface MetaAppStatus {
  available: boolean;
  app_id?: string | null;
  name?: string | null;
  app_type?: string | null;
  category?: string | null;
  privacy_policy_url?: string | null;
  terms_of_service_url?: string | null;
  missing_fields?: string[];
  error?: string;
}


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
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ChannelDiagnostic[]>([]);
  const [metaApp, setMetaApp] = useState<MetaAppStatus | null>(null);
  const [backendCallback, setBackendCallback] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;

      const [healthResults, socialHealth, config] = await Promise.all([
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
          if (!headers) return {} as Record<string, { connected?: boolean; expiring_in_days?: number; can_publish?: boolean }>;
          try {
            const { data } = await supabase.functions.invoke('social-health', { headers });
            return (data?.providers ?? {}) as Record<string, { connected?: boolean; expiring_in_days?: number; can_publish?: boolean }>;
          } catch {
            return {} as Record<string, { connected?: boolean; expiring_in_days?: number; can_publish?: boolean }>;
          }
        })(),
        (async () => {
          const empty = {
            byProvider: {} as Record<string, { redirect_ok?: boolean; note?: string }>,
            metaApp: null as MetaAppStatus | null,
            backendCallback: null as string | null,
          };
          if (!headers) return empty;
          try {
            const { data } = await supabase.functions.invoke('oauth-config-check', { headers });
            const list = (data?.checks ?? []) as { provider: string; redirect_ok?: boolean; note?: string }[];
            return {
              byProvider: Object.fromEntries(list.map((c) => [c.provider, c])),
              metaApp: (data?.meta_app_status ?? null) as MetaAppStatus | null,
              backendCallback: (data?.backend_callback ?? null) as string | null,
            };
          } catch {
            return {
              byProvider: {} as Record<string, { redirect_ok?: boolean; note?: string }>,
              metaApp: null as MetaAppStatus | null,
              backendCallback: null as string | null,
            };
          }
        })(),
      ]);

      const configChecks = config.byProvider;
      setMetaApp(config.metaApp);
      setBackendCallback(config.backendCallback);


      const next: ChannelDiagnostic[] = CHANNELS.map((channel) => {
        const health = healthResults.find((h) => h.id === channel.id);
        const conn = socialHealth[channel.id];
        const cfg = (configChecks as Record<string, { redirect_ok?: boolean; note?: string }>)[channel.id];

        let credentials: Status = health?.ok === null ? 'unknown' : health?.ok ? 'ok' : 'error';
        let credentialsNote = health?.note;
        if (credentials === 'ok' && cfg && cfg.redirect_ok === false) {
          credentials = 'warn';
          credentialsNote = t('connectionDiagnostics.redirectMismatch');
        }
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
        if (credentials === 'error') {
          publishing = 'error';
          publishingNote = t('connectionDiagnostics.credentialsMissing');
        } else if (!connected) {
          publishing = 'warn';
          publishingNote = t('connectionDiagnostics.connectFirst');
        } else if (conn?.can_publish === false) {
          publishing = 'warn';
          publishingNote = t('connectionDiagnostics.publishPending');
        } else {
          publishing = 'ok';
          if (channel.id === 'tiktok') {
            const env = (health as any)?.env;
            if (env && env !== 'production') {
              publishing = 'warn';
              publishingNote = t('connectionDiagnostics.tiktokSandbox').replace('{env}', env);
            } else {
              publishingNote = t('connectionDiagnostics.tiktokLive');
            }
          }
        }

        return {
          id: channel.id,
          name: channel.name,
          credentials,
          credentialsNote,
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

        {/* Meta App-Grunddaten — die häufigste Ursache für einen blockierten
            Facebook-Login-Dialog trotz Live-Modus. */}
        {metaApp && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {t('connectionDiagnostics.metaAppTitle')}
                {metaApp.name ? ` — ${metaApp.name}` : ''}
              </p>
              <StatusPill
                status={
                  !metaApp.available
                    ? 'unknown'
                    : (metaApp.missing_fields?.length ?? 0) > 0
                    ? 'warn'
                    : 'ok'
                }
                label={
                  !metaApp.available
                    ? t('connectionDiagnostics.metaAppUnknown')
                    : (metaApp.missing_fields?.length ?? 0) > 0
                    ? t('connectionDiagnostics.metaAppIncomplete')
                    : t('connectionDiagnostics.metaAppComplete')
                }
              />
            </div>
            {metaApp.available ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {t('connectionDiagnostics.metaAppId')}: {metaApp.app_id} · {t('connectionDiagnostics.metaAppType')}:{' '}
                  {metaApp.app_type || '—'} · {t('connectionDiagnostics.metaAppCategory')}: {metaApp.category || '—'}
                </p>
                {(metaApp.missing_fields?.length ?? 0) > 0 && (
                  <p className="text-xs text-amber-600">
                    {t('connectionDiagnostics.metaAppMissing')}: {metaApp.missing_fields!.join(', ')}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('connectionDiagnostics.metaAppUnavailable')}
                {metaApp.error ? ` (${metaApp.error})` : ''}
              </p>
            )}
          </div>
        )}

        {/* Soll-Redirect-URI zum Kopieren */}
        {backendCallback && (
          <div className="rounded-lg border border-border/60 p-3 space-y-1">
            <p className="text-sm font-medium">{t('connectionDiagnostics.redirectTargetTitle')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-xs break-all">{backendCallback}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(backendCallback);
                    toast({ title: t('connectionDiagnostics.copied') });
                  } catch {
                    /* clipboard blocked — Nutzer kann manuell markieren */
                  }
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                <span className="ml-2">{t('connectionDiagnostics.copy')}</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('connectionDiagnostics.redirectTargetHint')}
            </p>
          </div>
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
