import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Activity, CheckCircle, XCircle, Info } from "lucide-react";
import { RecentEvent } from "@/hooks/usePostHogMetrics";
import { useState } from "react";
import { EventDetailModal } from "./EventDetailModal";

interface LiveEventStreamProps {
  events: RecentEvent[];
}

const getEventBadge = (eventName: string) => {
  if (eventName.includes('completed') || eventName.includes('success')) {
    return { variant: "default" as const, icon: CheckCircle, color: "text-green-500" };
  }
  if (eventName.includes('error') || eventName.includes('failed')) {
    return { variant: "destructive" as const, icon: XCircle, color: "text-destructive" };
  }
  return { variant: "secondary" as const, icon: Info, color: "text-muted-foreground" };
};

const formatEventName = (event: string) => {
  return event
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export function LiveEventStream({ events }: LiveEventStreamProps) {
  const [selectedEvent, setSelectedEvent] = useState<RecentEvent | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary animate-pulse" />
            <CardTitle>Live Event Stream</CardTitle>
          </div>
          <CardDescription>
            Recent events from PostHog (Last hour)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-3">
              {events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No events in the last hour
                </div>
              ) : (
                events.map((event, index) => {
                  const badge = getEventBadge(event.event);
                  const Icon = badge.icon;
                  
                  return (
                    <div
                      key={`${event.timestamp}-${index}`}
                      onClick={() => setSelectedEvent(event)}
                      className="p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <Icon className={`h-5 w-5 mt-0.5 ${badge.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium truncate">
                                {formatEventName(event.event)}
                              </p>
                              <Badge variant={badge.variant} className="shrink-0">
                                {event.event}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              User: {event.distinctId}
                            </p>
                            {Object.keys(event.properties).length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {Object.keys(event.properties).length} properties
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <EventDetailModal
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      />
    </>
  );
}
