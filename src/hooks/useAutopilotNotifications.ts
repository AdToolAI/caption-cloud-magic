import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AutopilotNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

const AUTOPILOT_TYPES = [
  'autopilot_qa_review',
  'autopilot_blocked',
  'autopilot_failed',
  'autopilot_posted',
  'autopilot_daily_digest',
  'autopilot_strike',
  'autopilot_locked',
];

export function useAutopilotNotifications(limit = 30) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['autopilot-notifications', limit],
    queryFn: async (): Promise<AutopilotNotification[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return [];
      const { data, error } = await supabase
        .from('notification_queue')
        .select('*')
        .eq('user_id', u.user.id)
        .in('type', AUTOPILOT_TYPES)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as AutopilotNotification[];
    },
    staleTime: 10_000,
  });

  // Realtime
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      channel = supabase
        .channel(`autopilot-notif-${u.user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notification_queue',
            filter: `user_id=eq.${u.user.id}`,
          },
          (payload) => {
            const t = (payload.new as { type?: string })?.type;
            if (t && AUTOPILOT_TYPES.includes(t)) {
              qc.invalidateQueries({ queryKey: ['autopilot-notifications'] });
            }
          },
        )
        .subscribe();
    })();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notification_queue')
        .update({ read: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autopilot-notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      const { error } = await supabase
        .from('notification_queue')
        .update({ read: true })
        .eq('user_id', u.user.id)
        .in('type', AUTOPILOT_TYPES)
        .eq('read', false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autopilot-notifications'] }),
  });

  const unreadCount = (query.data ?? []).filter((n) => !n.read).length;

  return {
    notifications: query.data ?? [],
    unreadCount,
    isLoading: query.isLoading,
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutate,
  };
}
