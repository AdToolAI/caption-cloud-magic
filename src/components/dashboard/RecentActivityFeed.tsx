import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getRecentEvents } from '@/lib/eventBus';
import { useTranslation } from '@/hooks/useTranslation';
import { getEventTranslation } from '@/lib/eventTranslations';
import { formatDistanceToNow } from 'date-fns';
import { de, enUS, es } from 'date-fns/locale';
import { 
  Sparkles, 
  Zap, 
  Calendar, 
  Target, 
  MessageSquare,
  Trophy,
  Palette,
  TrendingUp
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const eventIcons: Record<string, any> = {
  'caption.created': Sparkles,
  'hook.generated': Zap,
  'calendar.post.scheduled': Calendar,
  'goal.created': Target,
  'goal.progress.updated': TrendingUp,
  'goal.completed': Trophy,
  'comment.imported': MessageSquare,
  'brandkit.created': Palette,
};

const eventColors: Record<string, string> = {
  'caption.created': 'bg-primary/10 text-primary',
  'hook.generated': 'bg-warning/10 text-warning',
  'calendar.post.scheduled': 'bg-blue-500/10 text-blue-500',
  'goal.created': 'bg-purple-500/10 text-purple-500',
  'goal.progress.updated': 'bg-green-500/10 text-green-500',
  'goal.completed': 'bg-yellow-500/10 text-yellow-500',
  'comment.imported': 'bg-cyan-500/10 text-cyan-500',
  'brandkit.created': 'bg-pink-500/10 text-pink-500',
};

export function RecentActivityFeed() {
  const { language } = useTranslation();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    const data = await getRecentEvents(10);
    setEvents(data);
    setLoading(false);
  };

  const getLocale = () => {
    switch (language) {
      case 'de': return de;
      case 'es': return es;
      default: return enUS;
    }
  };

  const getEventLabel = (eventType: string) => {
    const keyMap: Record<string, string> = {
      'caption.created': 'captionCreated',
      'hook.generated': 'hooksGenerated',
      'calendar.post.scheduled': 'postScheduled',
      'goal.created': 'goalCreated',
      'goal.progress.updated': 'goalProgress',
      'goal.completed': 'goalCompleted',
      'comment.imported': 'commentsImported',
      'brandkit.created': 'brandkitCreated',
    };
    const key = keyMap[eventType] || eventType;
    return getEventTranslation(key, language);
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Loading your recent activities...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{getEventTranslation('recentActivity', language)}</CardTitle>
        <CardDescription>{getEventTranslation('recentActivityDesc', language)}</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {getEventTranslation('noActivity', language)}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const Icon = eventIcons[event.event_type] || Sparkles;
                const colorClass = eventColors[event.event_type] || 'bg-secondary text-foreground';
                
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className={`p-2 rounded-full ${colorClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">
                          {getEventLabel(event.event_type)}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {event.source}
                        </Badge>
                      </div>
                      {event.payload_json?.platform && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Platform: {event.payload_json.platform}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(event.occurred_at), {
                          addSuffix: true,
                          locale: getLocale(),
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
