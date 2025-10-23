import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useSocialHealth } from '@/hooks/useSocialHealth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState } from 'react';

interface TokenExpiryBadgeProps {
  provider: string;
}

export const TokenExpiryBadge = ({ provider }: TokenExpiryBadgeProps) => {
  const { data, refetch } = useSocialHealth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const providerHealth = data?.providers?.[provider];

  if (!providerHealth?.connected || !providerHealth.expiring_in_days) {
    return null;
  }

  const expiringInDays = providerHealth.expiring_in_days;
  const needsRefresh = expiringInDays <= 7;

  if (!needsRefresh) return null;

  const handleRefresh = async () => {
    if (provider !== 'x') {
      toast.error('Token-Refresh nur für X verfügbar');
      return;
    }

    setIsRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data: refreshData, error } = await supabase.functions.invoke('x-refresh', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (refreshData?.ok) {
        toast.success('Token erfolgreich erneuert');
        refetch();
      } else {
        throw new Error(refreshData?.error || 'Token-Refresh fehlgeschlagen');
      }
    } catch (error: any) {
      console.error('[TokenExpiryBadge] Refresh error:', error);
      toast.error(error.message || 'Token-Refresh fehlgeschlagen');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-xs gap-1 bg-orange-50 text-orange-700 border-orange-200">
        <AlertCircle className="h-3 w-3" />
        Token läuft in {expiringInDays} {expiringInDays === 1 ? 'Tag' : 'Tagen'} ab
      </Badge>
      {provider === 'x' && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-7 text-xs"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          Token erneuern
        </Button>
      )}
    </div>
  );
};
