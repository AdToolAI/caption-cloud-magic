import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useCache } from '@/hooks/useCache';
import { Trophy } from 'lucide-react';
import { tx } from '@/lib/i18nText';

/**
 * Hook to listen for goal completion events in real-time
 * Shows celebration toast when goals are completed
 */
export function useGoalCompletionListener() {
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const channel = supabase
      .channel('goal-completions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'app_events',
          filter: 'event_type=eq.goal.completed',
        },
        (payload) => {
          console.log('Goal completed event received:', payload);
          
          // Show celebration toast
          toast({
            title: `🏆 ${t('events.goalCompleted')}`,
            description: tx({ de: '🎉 Herzlichen Glückwunsch! Du hast dein Ziel erreicht!', en: '🎉 Congratulations! You have reached your goal!', es: '🎉 ¡Felicidades! ¡Has alcanzado tu objetivo!' }),
            duration: 5000,
          });

          // Optional: Trigger confetti or celebration animation
          if (typeof window !== 'undefined') {
            // You could integrate a confetti library here
            console.log('🎊 Celebration time!');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast, t]);
}
