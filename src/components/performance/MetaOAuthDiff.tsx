import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, RefreshCw, GitCompare, AlertTriangle, Copy, ShieldQuestion } from 'lucide-react';
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
  account_ref?: string | null;
  is_own_account?: boolean;
  is_latest_for_profile?: boolean;
}

interface DiffRow {
  field: string;
  a: string;
  b: string;
  equal: boolean;
}

interface DiffResponse {
  is_admin?: boolean;
  all_accounts?: boolean;
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
  const [allAccounts, setAllAccounts] = useState(false);
  const [pastedId, setPastedId] = useState('');
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [probeLoading, setProbeLoading] = useState(false);

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
            body: {
              attempt_a: a,
              attempt_b: b,
              include_all_accounts: allAccounts,
              attempt_ids: extraIds,
            },
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
    [t, toast, allAccounts, extraIds],
  );

  // Isolated scope test: asks Meta for business_management only.
  const startProbe = useCallback(async () => {
    setProbeLoading(true);
    try {
      const session = await ensureValidSession();
      if (!session?.access_token) throw new Error(t('metaDiff.sessionExpired'));
      const { data: res, error } = await supabase.functions.invoke<{ authUrl?: string }>(
        'meta-scope-probe-start',
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { forceAccountChooser: true },
        },
      );
      if (error) throw error;
      if (!res?.authUrl) throw new Error('Missing authUrl');
      window.location.href = res.authUrl;
    } catch (e) {
      toast({
        title: t('metaDiff.errorTitle'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setProbeLoading(false);
    }
  }, [t, toast]);

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
      const acc = a.account_ref
        ? ` · ${t('metaDiff.accountRef')} ${a.account_ref}${a.is_own_account === false ? ` (${t('metaDiff.otherAccount')})` : ''}`
        : '';
      return `${metaId} · ${pages} · ${when} · ${t('metaDiff.diagnosticId')} ${shortId(a.id)}${acc}`;
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
          {t('metaDiff.diagnosticId')} {attempt.id}
        </p>
        <p className="text-muted-foreground">
          {attempt.completed
            ? t('metaDiff.pagesCount', { count: attempt.pages_found_count ?? 0 })
            : t('metaDiff.aborted')}
          {attempt.account_ref ? ` · ${t('metaDiff.accountRef')} ${attempt.account_ref}` : ''}
          {attempt.is_own_account === false ? ` (${t('metaDiff.otherAccount')})` : ''}
        </p>
        {attempt.completed && (
          <p className={attempt.is_latest_for_profile ? 'text-muted-foreground' : 'text-amber-600'}>
            {attempt.is_latest_for_profile
              ? t('metaDiff.latestForProfile')
              : t('metaDiff.staleAttempt')}
          </p>
        )}
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

        {data?.is_admin !== undefined && (
          <div className="flex items-center gap-2">
            <Switch
              id="meta-diff-all-accounts"
              checked={allAccounts}
              onCheckedChange={(v) => {
                setAllAccounts(v);
                setTimeout(() => run(attemptA, attemptB), 0);
              }}
              disabled={!data?.is_admin}
            />
            <Label htmlFor="meta-diff-all-accounts" className="text-xs font-normal">
              {t('metaDiff.allAccounts')}
            </Label>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs font-normal text-muted-foreground">{t('metaDiff.pasteId')}</Label>
          <div className="flex gap-2">
            <Input
              value={pastedId}
              onChange={(e) => setPastedId(e.target.value)}
              placeholder={t('metaDiff.pasteIdPlaceholder')}
              className="h-8 font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!pastedId.trim() || loading}
              onClick={() => {
                const id = pastedId.trim();
                setExtraIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
                setPastedId('');
                setTimeout(() => run(attemptA, id), 0);
              }}
            >
              {t('metaDiff.pasteIdAdd')}
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border p-3 space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldQuestion className="h-4 w-4" />
            {t('metaDiff.probeTitle')}
          </p>
          <p className="text-xs text-muted-foreground">{t('metaDiff.probeDescription')}</p>
          <Button size="sm" variant="outline" onClick={startProbe} disabled={probeLoading}>
            {probeLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('metaDiff.probeStart')}
          </Button>
        </div>

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
