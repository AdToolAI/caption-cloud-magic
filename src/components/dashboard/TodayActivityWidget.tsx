import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getTodayMetrics } from '@/lib/eventBus';
import { useTranslation } from '@/hooks/useTranslation';
import { getEventTranslation } from '@/lib/eventTranslations';
import { TrendingUp, Zap, MessageSquare, Send } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function TodayActivityWidget() {
  const { language } = useTranslation();
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    setLoading(true);
    const data = await getTodayMetrics();
    setMetrics(data);
    setLoading(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const stats = [
    {
      label: getEventTranslation('postsCreated', language),
      value: metrics?.posts_created || 0,
      icon: TrendingUp,
      color: 'text-primary',
    },
    {
      label: getEventTranslation('hooksCreated', language),
      value: metrics?.hooks_generated || 0,
      icon: Zap,
      color: 'text-warning',
    },
    {
      label: getEventTranslation('commentsImported', language),
      value: metrics?.comments_imported || 0,
      icon: MessageSquare,
      color: 'text-blue-500',
    },
    {
      label: getEventTranslation('autoRepliesSent', language),
      value: metrics?.auto_replies_sent || 0,
      icon: Send,
      color: 'text-green-500',
    },
  ];

  const totalActivity = stats.reduce((sum, stat) => sum + stat.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{getEventTranslation('todayActivity', language)}</CardTitle>
        <CardDescription>
          {totalActivity === 0
            ? getEventTranslation('startCreating', language)
            : `${totalActivity} ${getEventTranslation('activitiesToday', language)}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="flex flex-col items-center justify-center p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <stat.icon className={`h-6 w-6 mb-2 ${stat.color}`} />
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground text-center mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
