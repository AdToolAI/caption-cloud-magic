import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { ensureValidSession, isAuthLockError } from "@/lib/ensureSession";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, RotateCcw, Facebook, CheckCircle2 } from "lucide-react";

type ResetResult = {
  at: string;
  revoked: boolean;
  revokeError: string | null;
  deletedProviders: string[];
  authorizationCleared: boolean | null;
  remainingScopes: string[];
};

/**
 * Review-Recording helper: revokes the Meta app grant so the next connect
 * shows Meta's FULL permission dialog (incl. business_management + page
 * selection) instead of the "Continue as ..." short-circuit screen.
 */
export const MetaOAuthResetPanel = ({ onReset }: { onReset?: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);

  const describeError = (error: any, fallback: string) =>
    isAuthLockError(error)
      ? t('socialIntegrations.sessionBusyRetry')
      : (error?.message || fallback);

  const handleReset = async () => {
    setLoading(true);
    try {
      const session = await ensureValidSession();
      if (!session?.access_token) throw new Error(t('socialIntegrations.pleaseReLogin'));

      const { data, error } = await supabase.functions.invoke('instagram-oauth-revoke', {
        body: {},
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;

      const next: ResetResult = {
        at: new Date().toISOString(),
        revoked: !!data?.revoked,
        revokeError: data?.revokeError ?? null,
        deletedProviders: data?.deletedProviders ?? [],
        authorizationCleared: data?.authorization_cleared ?? null,
        remainingScopes: data?.remaining_scopes ?? [],
      };
      setResult(next);
      onReset?.();

      toast({
        title: next.authorizationCleared
          ? t('socialIntegrations.metaReset.doneTitle')
          : t('socialIntegrations.metaReset.partialTitle'),
        description: next.authorizationCleared
          ? t('socialIntegrations.metaReset.doneDesc')
          : t('socialIntegrations.metaReset.partialDesc'),
        variant: next.authorizationCleared ? undefined : 'destructive',
      });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: describeError(error, t('socialIntegrations.metaReset.failed')),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectWithChooser = async () => {
    setConnecting(true);
    try {
      const session = await ensureValidSession();
      const { data, error } = await supabase.functions.invoke('facebook-oauth-start', {
        body: { returnTo: window.location.href, forceAccountChooser: true },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      const url = data?.authUrl || data?.url;
      if (!url) throw new Error('No auth URL received');
      window.location.href = url;
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: describeError(error, 'Failed to start Facebook connection'),
        variant: 'destructive',
      });
      setConnecting(false);
    }
  };

  const cleared = result?.authorizationCleared === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          {t('socialIntegrations.metaReset.title')}
        </CardTitle>
        <CardDescription>{t('socialIntegrations.metaReset.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleReset} disabled={loading} variant="outline" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            {loading ? t('common.loading') : t('socialIntegrations.metaReset.action')}
          </Button>
          <Button
            onClick={handleConnectWithChooser}
            disabled={connecting || result?.authorizationCleared !== true}
            className="gap-2"
          >
            <Facebook className="h-4 w-4" />
            {t('socialIntegrations.connectDifferentAccount')}
          </Button>
        </div>

        {result && (
          <div className="rounded-md border border-border p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {cleared ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="font-medium">
                {t('socialIntegrations.metaReset.statusLabel')}:{' '}
                {cleared
                  ? t('socialIntegrations.metaReset.statusYes')
                  : t('socialIntegrations.metaReset.notReady')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(result.at).toLocaleString()} ·{' '}
              {t('socialIntegrations.metaReset.revoked')}: {result.revoked ? '✓' : '✗'} ·{' '}
              {t('socialIntegrations.metaReset.deleted')}:{' '}
              {result.deletedProviders.length ? result.deletedProviders.join(', ') : '–'}
            </p>
            {result.revokeError && (
              <p className="text-xs text-destructive">{result.revokeError}</p>
            )}
            {result.remainingScopes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {result.remainingScopes.map((scope) => (
                  <Badge key={scope} variant="secondary" className="text-[10px]">
                    {scope}
                  </Badge>
                ))}
              </div>
            )}
            {!cleared && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-destructive">
                  {t('socialIntegrations.metaReset.connectBlocked')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('socialIntegrations.metaReset.manualHint')}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="bg-muted/50 border border-border rounded-md p-3 text-xs text-muted-foreground flex items-start gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{t('socialIntegrations.metaReset.recordingHint')}</span>
        </div>
      </CardContent>
    </Card>
  );
};
