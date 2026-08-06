import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';

interface ProbeStep {
  step: string;
  url: string;
  status: number | null;
  ok: boolean;
  body: unknown;
  error?: string;
}

interface ProbeSummary {
  provider: string;
  me_accounts_count: number;
  granular_page_ids: string[];
  granular_instagram_ids: string[];
  businesses_count: number;
  verdict: string;
}

interface ProbeResult {
  success?: boolean;
  summary?: ProbeSummary;
  steps?: ProbeStep[];
  error?: string;
  reason?: string;
}

/**
 * Raw Meta Graph probe. Used when the page picker stays empty even though
 * Meta reported no error: it shows which assets Meta actually bound to the
 * stored token, so the cause is visible instead of guessed.
 */
export const MetaPageProbePanel = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);

  const run = async (provider: 'instagram' | 'facebook') => {
    setLoading(true);
    setResult(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('meta-page-probe', {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: { provider },
      });
      if (error) throw error;
      setResult(data as ProbeResult);
    } catch (err: any) {
      const details = err?.context ? await err.context.text().catch(() => err.message) : err?.message;
      setResult({ error: details || 'unknown_error' });
    } finally {
      setLoading(false);
    }
  };

  const copyRaw = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      toast({ title: t('connectionDiagnostics.copied') });
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('metaProbe.title')}</CardTitle>
        <CardDescription>{t('metaProbe.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={loading} onClick={() => run('instagram')}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            <span className="ml-2">{t('metaProbe.runInstagram')}</span>
          </Button>
          <Button size="sm" variant="outline" disabled={loading} onClick={() => run('facebook')}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            <span className="ml-2">{t('metaProbe.runFacebook')}</span>
          </Button>
          {result && (
            <Button size="sm" variant="ghost" onClick={copyRaw}>
              <Copy className="h-3.5 w-3.5" />
              <span className="ml-2">{t('connectionDiagnostics.copy')}</span>
            </Button>
          )}
        </div>

        {result?.error && (
          <p className="text-xs text-destructive break-all">
            {result.error}
            {result.reason ? ` — ${result.reason}` : ''}
          </p>
        )}

        {result?.summary && (
          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{t('metaProbe.verdict')}: {result.summary.verdict}</Badge>
              <Badge variant="outline">/me/accounts: {result.summary.me_accounts_count}</Badge>
              <Badge variant="outline">{t('metaProbe.businesses')}: {result.summary.businesses_count}</Badge>
            </div>
            <p className="text-xs text-muted-foreground break-all">
              {t('metaProbe.grantedPageIds')}: {result.summary.granular_page_ids.join(', ') || '—'}
            </p>
            <p className="text-xs text-muted-foreground break-all">
              {t('metaProbe.grantedIgIds')}: {result.summary.granular_instagram_ids.join(', ') || '—'}
            </p>
          </div>
        )}

        {result?.steps && (
          <details className="rounded-lg border border-border/60 p-3">
            <summary className="cursor-pointer text-xs font-medium">{t('metaProbe.rawTitle')}</summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
              {JSON.stringify(result.steps, null, 2)}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
};

export default MetaPageProbePanel;
