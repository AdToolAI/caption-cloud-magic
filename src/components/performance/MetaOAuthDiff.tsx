import { useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, RefreshCw, GitCompare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/hooks/use-toast';
import { ensureValidSession } from '@/lib/ensureSession';

interface Attempt {
  id: string;
  provider: string;
  created_at: string;
  completed: boolean;
  fb_user_id: string | null;
  fb_user_name: string | null;
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

function attemptLabel(a: Attempt) {
  const when = new Date(a.created_at).toLocaleString();
  const who = a.fb_user_name || a.fb_user_id || '—';
  return `${a.provider} · ${who} · ${when}${a.completed ? '' : ' (abgebrochen)'}`;
}

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
        </div>

        {data && attempts.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('metaDiff.accountA')}</p>
              <Select value={attemptA} onValueChange={(v) => { setAttemptA(v); run(v, attemptB); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {attempts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{attemptLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('metaDiff.accountB')}</p>
              <Select value={attemptB} onValueChange={(v) => { setAttemptB(v); run(attemptA, v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {attempts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{attemptLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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
