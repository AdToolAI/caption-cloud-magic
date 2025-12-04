import { useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getRecentEvents } from '@/lib/eventBus';
import { useTranslation } from '@/hooks/useTranslation';
import { useCache } from '@/hooks/useCache';
import { getEventTranslation } from '@/lib/eventTranslations';
import { ActivityFeedSkeleton } from '@/components/SkeletonLoaders';
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
import { motion, AnimatePresence } from 'framer-motion';

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

const eventColors: Record<string, { bg: string; text: string; glow: string }> = {
  'caption.created': { bg: 'bg-primary/10', text: 'text-primary', glow: 'shadow-primary/20' },
  'hook.generated': { bg: 'bg-warning/10', text: 'text-warning', glow: 'shadow-warning/20' },
  'calendar.post.scheduled': { bg: 'bg-blue-500/10', text: 'text-blue-500', glow: 'shadow-blue-500/20' },
  'goal.created': { bg: 'bg-purple-500/10', text: 'text-purple-500', glow: 'shadow-purple-500/20' },
  'goal.progress.updated': { bg: 'bg-success/10', text: 'text-success', glow: 'shadow-success/20' },
  'goal.completed': { bg: 'bg-yellow-500/10', text: 'text-yellow-500', glow: 'shadow-yellow-500/20' },
  'comment.imported': { bg: 'bg-accent/10', text: 'text-accent', glow: 'shadow-accent/20' },
  'brandkit.created': { bg: 'bg-pink-500/10', text: 'text-pink-500', glow: 'shadow-pink-500/20' },
};

// User-friendly event labels
const friendlyEventLabels: Record<string, { de: string; en: string }> = {
  'caption.created': { de: '✨ Neue Caption erstellt', en: '✨ New caption created' },
  'hook.generated': { de: '⚡ Hook generiert', en: '⚡ Hook generated' },
  'calendar.post.scheduled': { de: '📅 Post geplant', en: '📅 Post scheduled' },
  'goal.created': { de: '🎯 Neues Ziel gesetzt', en: '🎯 New goal set' },
  'goal.progress.updated': { de: '📈 Fortschritt aktualisiert', en: '📈 Progress updated' },
  'goal.completed': { de: '🏆 Ziel erreicht!', en: '🏆 Goal completed!' },
  'comment.imported': { de: '💬 Kommentare importiert', en: '💬 Comments imported' },
  'brandkit.created': { de: '🎨 Brand Kit erstellt', en: '🎨 Brand kit created' },
};

export function RecentActivityFeed() {
  const { language } = useTranslation();
  
  // Use caching with 2-minute TTL
  const { data: events = [], loading } = useCache(
    'recent-events',
    () => getRecentEvents(10),
    { ttl: 2 * 60 * 1000, staleWhileRevalidate: true }
  );

  const getLocale = useCallback(() => {
    switch (language) {
      case 'de': return de;
      case 'es': return es;
      default: return enUS;
    }
  }, [language]);

  const getFriendlyLabel = useCallback((eventType: string) => {
    const labels = friendlyEventLabels[eventType];
    if (labels) {
      return language === 'de' ? labels.de : labels.en;
    }
    return getEventTranslation(eventType, language);
  }, [language]);

  if (loading) {
    return (
      <Card className="h-full backdrop-blur-xl bg-card/50 border border-white/10">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Loading your recent activities...</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityFeedSkeleton />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="h-full backdrop-blur-xl bg-card/50 border border-white/10 overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-accent"
            />
            <CardTitle>{getEventTranslation('recentActivity', language)}</CardTitle>
          </div>
          <CardDescription>{getEventTranslation('recentActivityDesc', language)}</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                </motion.div>
                <p className="text-muted-foreground">
                  {getEventTranslation('noActivity', language)}
                </p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[23px] top-4 bottom-4 w-px bg-gradient-to-b from-primary/50 via-accent/30 to-transparent" />
                
                <AnimatePresence>
                  <div className="space-y-1">
                    {events.map((event, index) => {
                      const Icon = eventIcons[event.event_type] || Sparkles;
                      const colors = eventColors[event.event_type] || { bg: 'bg-secondary', text: 'text-foreground', glow: '' };
                      const isRecent = index === 0;
                      
                      return (
                        <motion.div
                          key={event.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileHover={{ scale: 1.01, x: 5 }}
                          className={`relative flex items-start gap-3 p-3 rounded-xl border transition-all duration-300 ml-2 ${
                            isRecent 
                              ? 'bg-primary/5 border-primary/20 shadow-lg ' + colors.glow
                              : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {/* Timeline dot */}
                          <motion.div 
                            className={`relative z-10 p-2 rounded-full ${colors.bg} ${colors.text} ${isRecent ? 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background' : ''}`}
                            animate={isRecent ? { scale: [1, 1.1, 1] } : {}}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          >
                            <Icon className="h-4 w-4" />
                          </motion.div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm text-foreground">
                                {getFriendlyLabel(event.event_type)}
                              </p>
                              {isRecent && (
                                <motion.span
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="px-2 py-0.5 rounded-full text-xs bg-accent/20 text-accent font-medium"
                                >
                                  Neu
                                </motion.span>
                              )}
                              <Badge variant="outline" className="text-xs opacity-60">
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
                        </motion.div>
                      );
                    })}
                  </div>
                </AnimatePresence>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </motion.div>
  );
}
