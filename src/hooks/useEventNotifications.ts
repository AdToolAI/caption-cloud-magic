import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getEventTranslation } from '@/lib/eventTranslations';

interface NotificationEvent {
  id: string;
  event_type: string;
  occurred_at: string;
  payload_json: any;
  read: boolean;
}

/**
 * Hook to manage event-based notifications
 * Tracks unread events and provides notification management
 */
export function useEventNotifications(language: string = 'en') {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
    setupRealtimeListener();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Get recent important events
    const { data } = await supabase
      .from('app_events')
      .select('*')
      .eq('user_id', user.id)
      .in('event_type', [
        'goal.completed',
        'comment.imported',
        'performance.synced',
      ])
      .order('occurred_at', { ascending: false })
      .limit(10);

    if (data) {
      const notifs = data.map(event => ({
        ...event,
        read: false, // You could store read state in a separate table
      }));
      setNotifications(notifs);
      setUnreadCount(notifs.length);
    }
    setLoading(false);
  };

  const setupRealtimeListener = () => {
    const channel = supabase
      .channel('event-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'app_events',
        },
        (payload: any) => {
          const newEvent = payload.new;
          
          // Only show notifications for important events
          const importantEvents = [
            'goal.completed',
            'comment.imported',
            'performance.synced',
          ];

          if (importantEvents.includes(newEvent.event_type)) {
            setNotifications(prev => [
              { ...newEvent, read: false },
              ...prev.slice(0, 9),
            ]);
            setUnreadCount(prev => prev + 1);

            // Show toast for goal completions
            if (newEvent.event_type === 'goal.completed') {
              toast({
                title: getEventTranslation('goalCompleted', language),
                description: '🎉 Herzlichen Glückwunsch!',
                duration: 5000,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const markAsRead = (eventId: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === eventId ? { ...n, read: true } : n))
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    refresh: loadNotifications,
    loading,
  };
}
