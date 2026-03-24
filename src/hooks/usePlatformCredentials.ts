import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type Platform = 'instagram' | 'tiktok' | 'linkedin' | 'youtube' | 'facebook' | 'x';

export interface PlatformCredential {
  id: string;
  platform: Platform;
  is_connected: boolean;
  token_expires_at?: string;
  last_verified_at?: string;
}

export function usePlatformCredentials() {
  const [credentials, setCredentials] = useState<PlatformCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCredentials = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Read from social_connections as the single source of truth
      const { data, error } = await supabase
        .from('social_connections')
        .select('id, provider, token_expires_at, last_sync_at')
        .eq('user_id', user.id);

      if (error) throw error;

      // Map social_connections rows to PlatformCredential shape
      const mapped: PlatformCredential[] = (data || []).map((row: any) => ({
        id: row.id,
        platform: row.provider as Platform,
        is_connected: true,
        token_expires_at: row.token_expires_at,
        last_verified_at: row.last_sync_at,
      }));

      setCredentials(mapped);
    } catch (error) {
      console.error('Error fetching credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  const isConnected = (platform: Platform): boolean => {
    return credentials.some(c => c.platform === platform && c.is_connected);
  };

  const updateConnectionStatus = async (
    platform: Platform,
    connected: boolean
  ): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (!connected) {
        // Disconnect: remove the social_connections row
        const { error } = await supabase
          .from('social_connections')
          .delete()
          .eq('user_id', user.id)
          .eq('provider', platform);

        if (error) throw error;
      }

      await fetchCredentials();
      toast({
        title: connected ? '✅ Verbunden' : '❌ Getrennt',
        description: `${platform} wurde ${connected ? 'verbunden' : 'getrennt'}`,
      });

      return true;
    } catch (error: any) {
      console.error('Error updating connection status:', error);
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  return {
    credentials,
    loading,
    isConnected,
    updateConnectionStatus,
    refreshCredentials: fetchCredentials,
  };
}
