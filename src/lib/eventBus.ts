import { supabase } from "@/integrations/supabase/client";

export type AppEventType =
  | 'caption.created'
  | 'caption.rewritten'
  | 'hook.generated'
  | 'reel.script.created'
  | 'calendar.post.scheduled'
  | 'calendar.post.published'
  | 'comment.imported'
  | 'comment.replied'
  | 'faq.updated'
  | 'performance.synced'
  | 'performance.account.disconnected'
  | 'performance.csv.uploaded'
  | 'performance.insights.generated'
  | 'trend.bookmarked'
  | 'goal.created'
  | 'goal.progress.updated'
  | 'goal.completed'
  | 'brandkit.created'
  | 'post.generated'
  | 'background.generated'
  | 'carousel.created'
  | 'bio.generated'
  | 'audit.completed'
  | 'campaign.created';

export interface AppEvent {
  event_type: AppEventType;
  source: string;
  payload?: Record<string, any>;
  idempotency_key?: string;
}

/**
 * Emit an application event
 * Events are stored in the database and trigger automated workflows
 */
export async function emitEvent(event: AppEvent): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.warn('Cannot emit event: User not authenticated');
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('app_events')
      .insert({
        user_id: user.id,
        event_type: event.event_type,
        source: event.source,
        payload_json: event.payload || {},
        idempotency_key: event.idempotency_key,
        occurred_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Failed to emit event:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Event emission error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get recent events for the current user
 */
export async function getRecentEvents(limit: number = 50): Promise<any[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from('app_events')
      .select('*')
      .eq('user_id', user.id)
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch events:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching events:', error);
    return [];
  }
}

/**
 * Get daily metrics for a date range
 */
export async function getDailyMetrics(startDate: Date, endDate: Date): Promise<any[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from('user_metrics_daily')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) {
      console.error('Failed to fetch metrics:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return [];
  }
}

/**
 * Get today's metrics summary
 */
export async function getTodayMetrics(): Promise<any | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('user_metrics_daily')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch today metrics:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching today metrics:', error);
    return null;
  }
}
