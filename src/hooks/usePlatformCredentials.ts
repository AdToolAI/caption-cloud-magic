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

      const { data, error } = await supabase
        .from('platform_credentials')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      setCredentials((data || []) as PlatformCredential[]);
    } catch (error) {
      console.error('Error fetching credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  const isConnected = (platform: Platform): boolean => {
    const cred = credentials.find(c => c.platform === platform);
    return cred?.is_connected || false;
  };

  const updateConnectionStatus = async (
    platform: Platform,
    isConnected: boolean
  ): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('platform_credentials')
        .upsert({
          user_id: user.id,
          platform,
          is_connected: isConnected,
          last_verified_at: new Date().toISOString(),
        });

      if (error) throw error;

      await fetchCredentials();
      toast({
        title: isConnected ? '✅ Verbunden' : '❌ Getrennt',
        description: `${platform} wurde ${isConnected ? 'verbunden' : 'getrennt'}`,
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
