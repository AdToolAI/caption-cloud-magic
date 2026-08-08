import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, RefreshCw, GitCompare, AlertTriangle, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/hooks/use-toast';
import { ensureValidSession } from '@/lib/ensureSession';

interface Attempt {
  id: string;
  provider: string;
  created_at: string;
  callback_completed_at?: string | null;
  completed: boolean;
  fb_user_id: string | null;
  fb_user_name: string | null;
  pages_found_count?: number | null;
}

interface DiffRow {
  field: string;
  a: string;
  b: string;
  equal: boolean;
}

interface DiffResponse {
  attempts: Attempt[];
  attempt_a: Attempt | null;
  attempt_b: Attempt | null;
  diff: DiffRow[];
  differing_fields: string[];
}

const shortId = (id: string) => id.slice(0, 8);

export function MetaOAuthDiff() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DiffResponse | null>(null);
  const [attemptA, setAttemptA] = useState<string | undefined>();
  const [attemptB, setAttemptB] = useState<string | undefined>();

  const run = useCallback(
    async (a?: string, b?: string) => {
      setLoading(true);
      try {
        const session = await ensureValidSession();
        if (!session?.access_token) {
          throw new Error(t('metaDiff.sessionExpired'));
        }
        const { data: res, error } = await supabase.functions.invoke<DiffResponse>(
          'meta-oauth-diff',
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { attempt_a: a, attempt_b: b },
          },
        );
        if (error) throw error;
        setData(res ?? null);
        setAttemptA(res?.attempt_a?.id);
        setAttemptB(res?.attempt_b?.id);
      } catch (e) {
        toast({
          title: t('metaDiff.errorTitle'),
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [t, toast],
  );

  const attempts = data?.attempts ?? [];
  const completedAttempts = useMemo(() => attempts.filter((a) => a.completed), [attempts]);
  const abortedAttempts = useMemo(() => attempts.filter((a) => !a.completed), [attempts]);

  const distinctProfiles = useMemo(
    () => new Set(completedAttempts.map((a) => a.fb_user_id).filter(Boolean)).size,
    [completedAttempts],
  );

  const attemptLabel = useCallback(
    (a: Attempt) => {
      const when = new Date(a.created_at).toLocaleString();
      const metaId = a.fb_user_id ? `${t('metaDiff.metaUserId')} …${a.fb_user_id.slice(-6)}` : '—';
      if (!a.completed) return `${metaId} · ${when} · ${t('metaDiff.aborted')}`;
      const pages = t('metaDiff.pagesCount', { count: a.pages_found_count ?? 0 });
      return `${metaId} · ${pages} · ${when} · ${t('metaDiff.diagnosticId')} ${shortId(a.id)}`;
    },
    [t],
  );

  const identityHeader = (attempt: Attempt | null | undefined) => {
    if (!attempt) return null;
    return (
      <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px] leading-relaxed">
        <p className="font-mono break-all">
          {t('metaDiff.metaUserId')}: {attempt.fb_user_id ?? '—'}
        </p>
        <p className="text-muted-foreground">
          {attempt.fb_user_name ?? '—'} · {new Date(attempt.created_at).toLocaleString()}
        </p>
        <p className="text-muted-foreground font-mono">
          {t('metaDiff.diagnosticId')} {shortId(attempt.id)} ·{' '}
          {attempt.completed
            ? t('metaDiff.pagesCount', { count: attempt.pages_found_count ?? 0 })
            : t('metaDiff.aborted')}
        </p>
      </div>
    );
  };

  const renderOptions = () => (
    <>
      {completedAttempts.length > 0 && (
        <SelectGroup>
          <SelectLabel>{t('metaDiff.completedGroup')}</SelectLabel>
          {completedAttempts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {attemptLabel(a)}
            </SelectItem>
          ))}
        </SelectGroup>
      )}
      {abortedAttempts.length > 0 && (
        <SelectGroup>
          <SelectLabel>{t('metaDiff.abortedGroup')}</SelectLabel>
          {abortedAttempts.map((a) => (
            <SelectItem key={a.id} value={a.id} className="text-muted-foreground">
              {attemptLabel(a)}
            </SelectItem>
          ))}
        </SelectGroup>
      )}
    </>
  );

  const copySummary = async () => {
    if (!data) return;
    const summary = {
      attempt_a: data.attempt_a,
      attempt_b: data.attempt_b,
      diff: data.diff,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
      toast({ title: t('metaDiff.copied') });
    } catch {
      /* clipboard blocked */
    }
  };

  const sameProfile =
    !!data?.attempt_a?.fb_user_id &&
    data.attempt_a.fb_user_id === data.attempt_b?.fb_user_id;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCompare className="h-4 w-4" />
          {t('metaDiff.title')}
        </CardTitle>
        <CardDescription>{t('metaDiff.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => run(attemptA, attemptB)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">{t('metaDiff.load')}</span>
          </Button>
          {data && (
            <Badge variant="outline" className="font-normal">
              {t('metaDiff.attemptsFound', { count: attempts.length })}
            </Badge>
          )}
          {data && data.diff.length > 0 && (
            <Button size="sm" variant="ghost" onClick={copySummary}>
              <Copy className="h-3.5 w-3.5" />
              <span className="ml-2">{t('metaDiff.copySummary')}</span>
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{t('metaDiff.scopeAccountNote')}</p>

        {data && attempts.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('metaDiff.accountA')}</p>
              <Select value={attemptA} onValueChange={(v) => { setAttemptA(v); run(v, attemptB); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{renderOptions()}</SelectContent>
              </Select>
              {identityHeader(data.attempt_a)}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('metaDiff.accountB')}</p>
              <Select value={attemptB} onValueChange={(v) => { setAttemptB(v); run(attemptA, v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{renderOptions()}</SelectContent>
              </Select>
              {identityHeader(data.attempt_b)}
            </div>
          </div>
        )}

        {data && sameProfile && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('metaDiff.sameProfileWarning')}
          </p>
        )}

        {data && completedAttempts.length > 0 && distinctProfiles < 2 && (
          <p className="text-xs text-muted-foreground">{t('metaDiff.onlyOneProfile')}</p>
        )}

        {data && attempts.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('metaDiff.empty')}</p>
        )}

        {data && data.diff.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left font-medium">{t('metaDiff.field')}</th>
                  <th className="p-2 text-left font-medium">A</th>
                  <th className="p-2 text-left font-medium">B</th>
                </tr>
              </thead>
              <tbody>
                {data.diff.map((row) => (
                  <tr
                    key={row.field}
                    className={`border-t border-border ${row.equal ? '' : 'bg-amber-500/5'}`}
                  >
                    <td className="p-2 font-mono">{row.field}</td>
                    <td className="p-2 break-all font-mono">{row.a || '—'}</td>
                    <td className={`p-2 break-all font-mono ${row.equal ? '' : 'text-amber-600'}`}>
                      {row.b || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.attempt_a && data.attempt_b && data.differing_fields.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('metaDiff.noDifference')}</p>
        )}
      </CardContent>
    </Card>
  );
}
