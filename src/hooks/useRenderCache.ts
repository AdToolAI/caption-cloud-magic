import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CacheResult {
  cached: boolean;
  url?: string;
  savedCredits?: number;
  cacheId?: string;
  contentHash?: string;
}

export const useRenderCache = () => {
  const [loading, setLoading] = useState(false);

  const checkCache = async (config: {
    templateId: string;
    config: any;
    engine: 'remotion' | 'shotstack';
  }): Promise<CacheResult | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-render-cache', {
        body: config
      });

      if (error) throw error;

      return data as CacheResult;
    } catch (error) {
      console.error('Error checking cache:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getCacheStats = async () => {
    try {
      const { data, error } = await supabase
        .from('render_asset_cache')
        .select('*')
        .order('hit_count', { ascending: false });

      if (error) throw error;

      const totalHits = data.reduce((sum, c) => sum + (c.hit_count || 0), 0);
      const totalSize = data.reduce((sum, c) => sum + (c.file_size_mb || 0), 0);

      return {
        totalEntries: data.length,
        totalHits,
        totalSizeMB: totalSize,
        topCached: data.slice(0, 5),
      };
    } catch (error) {
      console.error('Error fetching cache stats:', error);
      return null;
    }
  };

  const invalidateCache = async (cacheId: string) => {
    try {
      const { error } = await supabase
        .from('render_asset_cache')
        .delete()
        .eq('id', cacheId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error invalidating cache:', error);
      return false;
    }
  };

  return {
    loading,
    checkCache,
    getCacheStats,
    invalidateCache,
  };
};
