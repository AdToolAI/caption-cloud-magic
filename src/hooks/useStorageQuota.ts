import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

export interface StorageQuota {
  quota_mb: number;
  used_mb: number;
  plan_tier: string;
  usage_percent: number;
  last_calculated_at: string;
}

export interface StorageBreakdown {
  videos: number;
  thumbnails: number;
  variants: number;
  optimized: number;
}

export const useStorageQuota = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [quota, setQuota] = useState<StorageQuota | null>(null);
  const [breakdown, setBreakdown] = useState<StorageBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuota = async () => {
    if (!user) {
      setQuota(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch quota
      const { data: quotaData, error: quotaError } = await supabase
        .from('user_storage_quotas')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (quotaError) throw quotaError;

      const usagePercent = quotaData ? (quotaData.used_mb / quotaData.quota_mb) * 100 : 0;

      setQuota({
        ...quotaData,
        usage_percent: Math.round(usagePercent)
      });

      // Show warnings based on usage
      if (usagePercent >= 100) {
        toast({
          title: '⚠️ Storage Quota Exceeded',
          description: 'You have reached your storage limit. Please delete old files or upgrade your plan.',
          variant: 'destructive',
        });
      } else if (usagePercent >= 90) {
        toast({
          title: '⚠️ Storage Almost Full',
          description: `You are using ${Math.round(usagePercent)}% of your storage. Consider cleaning up old files.`,
          variant: 'destructive',
        });
      } else if (usagePercent >= 80) {
        toast({
          title: 'Storage Warning',
          description: `You are using ${Math.round(usagePercent)}% of your storage quota.`,
        });
      }

      // Fetch breakdown
      const { data: files, error: filesError } = await supabase
        .from('storage_files')
        .select('bucket_name, file_size_mb')
        .eq('user_id', user.id);

      if (filesError) throw filesError;

      const breakdownData: StorageBreakdown = {
        videos: 0,
        thumbnails: 0,
        variants: 0,
        optimized: 0
      };

      files?.forEach(file => {
        const size = file.file_size_mb || 0;
        if (file.bucket_name === 'video-assets') {
          breakdownData.videos += size;
        } else if (file.bucket_name === 'thumbnails') {
          breakdownData.thumbnails += size;
        } else if (file.bucket_name === 'video-variants') {
          breakdownData.variants += size;
        } else if (file.bucket_name === 'optimized-videos') {
          breakdownData.optimized += size;
        }
      });

      setBreakdown(breakdownData);
      setError(null);
    } catch (err) {
      console.error('Error fetching storage quota:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const recalculateUsage = async () => {
    if (!user) return;

    try {
      const { error } = await supabase.functions.invoke('calculate-storage-usage', {
        body: { user_id: user.id }
      });

      if (error) throw error;

      await fetchQuota();
      
      toast({
        title: 'Storage Recalculated',
        description: 'Your storage usage has been updated.',
      });
    } catch (err) {
      console.error('Error recalculating storage:', err);
      toast({
        title: 'Error',
        description: 'Failed to recalculate storage usage.',
        variant: 'destructive',
      });
    }
  };

  const deleteOldDrafts = async () => {
    if (!user) return;

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: oldDrafts } = await supabase
        .from('content_projects')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'draft')
        .lt('updated_at', thirtyDaysAgo.toISOString());

      if (!oldDrafts || oldDrafts.length === 0) {
        toast({
          title: 'No Old Drafts',
          description: 'You have no draft projects older than 30 days.',
        });
        return;
      }

      // Delete each draft
      for (const draft of oldDrafts) {
        await supabase
          .from('content_projects')
          .delete()
          .eq('id', draft.id);
      }

      await recalculateUsage();

      toast({
        title: 'Drafts Deleted',
        description: `Deleted ${oldDrafts.length} old draft projects.`,
      });
    } catch (err) {
      console.error('Error deleting old drafts:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete old drafts.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchQuota();

    // Subscribe to storage_files changes
    const channel = supabase
      .channel(`storage-${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'storage_files',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          fetchQuota();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    quota,
    breakdown,
    loading,
    error,
    refetch: fetchQuota,
    recalculateUsage,
    deleteOldDrafts
  };
};
