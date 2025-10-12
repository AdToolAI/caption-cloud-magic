import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Edit, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface Event {
  id: string;
  campaignId: string | null;
  platform: string;
  title: string;
  scheduledAt: string;
  status: string;
  score: number;
}

interface CalendarTimelineProps {
  events: Event[];
  loading?: boolean;
  onEventClick?: (event: Event) => void;
}

export function CalendarTimeline({ events, loading, onEventClick }: CalendarTimelineProps) {
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      scheduled: { variant: "default", label: "Geplant" },
      posted: { variant: "secondary", label: "Veröffentlicht" },
      draft: { variant: "outline", label: "Entwurf" },
      failed: { variant: "destructive", label: "Fehlgeschlagen" },
    };
    
    const config = variants[status] || variants.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getScoreBadge = (score: number) => {
    if (score >= 70) return <Badge className="bg-success/10 text-success hover:bg-success/20">Score: {score}</Badge>;
    if (score >= 50) return <Badge className="bg-warning/10 text-warning hover:bg-warning/20">Score: {score}</Badge>;
    return <Badge className="bg-muted/10 text-muted-foreground hover:bg-muted/20">Score: {score}</Badge>;
  };

  const getPlatformIcon = (platform: string) => {
    const icons: Record<string, string> = {
      instagram: "📷",
      facebook: "👍",
      tiktok: "🎵",
      linkedin: "💼",
      twitter: "🐦",
    };
    return icons[platform.toLowerCase()] || "📱";
  };

  // Group events by day
  const groupedEvents = events.reduce((acc, event) => {
    const day = format(parseISO(event.scheduledAt), "yyyy-MM-dd");
    if (!acc[day]) acc[day] = [];
    acc[day].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Nächste 7 Tage – Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Nächste 7 Tage – Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>Keine geplanten Posts in den nächsten 7 Tagen.</p>
            <p className="text-sm mt-2">Starte die Auto-Planung, um Posts einzuplanen.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Nächste 7 Tage – Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {Object.entries(groupedEvents).map(([day, dayEvents]) => (
            <div key={day}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {format(parseISO(day), "EEEE, dd. MMMM yyyy", { locale: de })}
              </h3>
              <div className="space-y-2">
                {dayEvents.map((event) => (
                  <Card 
                    key={event.id} 
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => onEventClick?.(event)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">{getPlatformIcon(event.platform)}</span>
                            <span className="font-medium">{event.platform}</span>
                            <span className="text-sm text-muted-foreground">
                              {format(parseISO(event.scheduledAt), "HH:mm")} Uhr
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1">{event.title}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(event.status)}
                          {getScoreBadge(event.score)}
                          <Button size="icon" variant="ghost" onClick={(e) => {
                            e.stopPropagation();
                            onEventClick?.(event);
                          }}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
