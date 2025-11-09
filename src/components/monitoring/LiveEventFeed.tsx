import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface LiveEvent {
  id: string;
  event_type: string;
  source: string;
  occurred_at: string;
  duration_ms?: number;
}

export function LiveEventFeed() {
  const [events, setEvents] = useState<LiveEvent[]>([]);

  useEffect(() => {
    // Fetch initial events
    fetchRecentEvents();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('live-events-feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'app_events'
        },
        (payload) => {
          const newEvent = payload.new as any;
          const eventPayload = newEvent.payload_json as any;
          setEvents(prev => [
            {
              id: newEvent.id,
              event_type: newEvent.event_type,
              source: newEvent.source,
              occurred_at: newEvent.occurred_at,
              duration_ms: eventPayload?.duration_ms,
            },
            ...prev.slice(0, 49) // Keep last 50 events
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRecentEvents = async () => {
    const { data } = await supabase
      .from('app_events')
      .select('id, event_type, source, occurred_at, payload_json')
      .order('occurred_at', { ascending: false })
      .limit(50);

    if (data) {
      setEvents(data.map(e => {
        const payload = e.payload_json as any;
        return {
          id: e.id,
          event_type: e.event_type,
          source: e.source,
          occurred_at: e.occurred_at,
          duration_ms: payload?.duration_ms as number | undefined,
        };
      }));
    }
  };

  const getEventBadgeVariant = (eventType: string) => {
    if (eventType.includes('error')) return 'destructive';
    if (eventType.includes('created') || eventType.includes('completed')) return 'default';
    return 'secondary';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Live Event Feed
        </CardTitle>
        <CardDescription>Real-time system events</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-3">
            {events.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No recent events
              </div>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start justify-between p-3 rounded-lg border bg-card/50 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getEventBadgeVariant(event.event_type)}>
                        {event.event_type}
                      </Badge>
                      {event.duration_ms && (
                        <span className="text-xs text-muted-foreground">
                          {event.duration_ms}ms
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {event.source}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                    {formatDistanceToNow(new Date(event.occurred_at), {
                      addSuffix: true,
                      locale: de,
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
