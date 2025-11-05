import { useState } from 'react';
import { trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Check, Copy, Loader2, Play, Zap } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import posthog from 'posthog-js';
import { supabase } from '@/integrations/supabase/client';

interface EventLog {
  name: string;
  timestamp: Date;
  status: 'success' | 'error';
}

export function PostHogEventTester() {
  const { toast } = useToast();
  const [isFiring, setIsFiring] = useState(false);
  const [eventLog, setEventLog] = useState<EventLog[]>([]);
  const [copiedCategory, setCopiedCategory] = useState<string | null>(null);

  const isPostHogConfigured = !!(
    import.meta.env.VITE_PUBLIC_POSTHOG_KEY && 
    posthog?.__loaded
  );

  const eventCategories = {
    onboarding: {
      title: 'Onboarding & Auth',
      events: [
        { 
          name: ANALYTICS_EVENTS.SIGNUP_COMPLETED,
          data: { method: 'email', timestamp: Date.now() }
        },
        { 
          name: ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED,
          data: { step: 1, step_name: 'welcome' }
        },
        { 
          name: ANALYTICS_EVENTS.ONBOARDING_FINISHED,
          data: { duration_seconds: 120 }
        },
      ]
    },
    content: {
      title: 'Content Creation',
      events: [
        { 
          name: ANALYTICS_EVENTS.POST_GENERATED,
          data: { platform: 'instagram', content_type: 'post' }
        },
        { 
          name: ANALYTICS_EVENTS.FIRST_POST_SCHEDULED,
          data: { platform: 'instagram', scheduled_date: new Date().toISOString() }
        },
        { 
          name: ANALYTICS_EVENTS.CAMPAIGN_GENERATED,
          data: { campaign_name: 'Test Campaign', posts_count: 5 }
        },
        { 
          name: ANALYTICS_EVENTS.CAPTION_COPIED,
          data: { caption_length: 150, platform: 'instagram' }
        },
        { 
          name: ANALYTICS_EVENTS.HOOK_COPIED,
          data: { hook_type: 'question', platform: 'instagram' }
        },
        { 
          name: ANALYTICS_EVENTS.CONTENT_EXPORTED,
          data: { format: 'csv', posts_count: 10 }
        },
      ]
    },
    calendar: {
      title: 'Calendar & Planning',
      events: [
        { 
          name: ANALYTICS_EVENTS.CALENDAR_VIEWED,
          data: { view_type: 'month' }
        },
        { 
          name: ANALYTICS_EVENTS.CALENDAR_EVENT_CREATED,
          data: { event_type: 'post', platform: 'instagram' }
        },
      ]
    },
    brand: {
      title: 'Brand & Workspace',
      events: [
        { 
          name: ANALYTICS_EVENTS.BRAND_KIT_CREATED,
          data: { brand_name: 'Test Brand' }
        },
        { 
          name: ANALYTICS_EVENTS.BRAND_KIT_DELETED,
          data: { brand_name: 'Test Brand' }
        },
        { 
          name: ANALYTICS_EVENTS.WORKSPACE_CREATED,
          data: { workspace_name: 'Test Workspace' }
        },
      ]
    },
    monetization: {
      title: 'Monetization',
      events: [
        { 
          name: ANALYTICS_EVENTS.UPGRADE_CLICKED,
          data: { from_plan: 'free', to_plan: 'pro' }
        },
        { 
          name: ANALYTICS_EVENTS.PAYMENT_COMPLETED,
          data: { plan: 'pro', amount: 29.99, currency: 'EUR' }
        },
      ]
    },
    performance: {
      title: 'Performance & Limits',
      events: [
        { 
          name: ANALYTICS_EVENTS.USAGE_LIMIT_REACHED,
          data: { feature: 'post_generation', limit: 10 }
        },
      ]
    },
    backend: {
      title: 'Backend & Queue',
      events: [
        { 
          name: 'ai_job_queued',
          data: {
            goal: 'Test Campaign Goal',
            topic: 'Test Topic',
            duration_weeks: 4,
            platforms: ['instagram', 'facebook'],
            post_frequency: 3,
            test: true
          }
        },
      ]
    },
  };

  const fireEvent = async (eventName: string, data: Record<string, any>) => {
    try {
      // Backend events (Edge Functions)
      if (eventName === 'ai_job_queued') {
        const { error } = await supabase.functions.invoke('test-posthog-event');
        if (error) throw error;
      } else {
        // Client events (PostHog)
        trackEvent(eventName, data);
      }
      
      setEventLog(prev => [...prev, { 
        name: eventName, 
        timestamp: new Date(), 
        status: 'success' 
      }]);
      return true;
    } catch (error) {
      console.error('Error firing event:', error);
      setEventLog(prev => [...prev, { 
        name: eventName, 
        timestamp: new Date(), 
        status: 'error' 
      }]);
      return false;
    }
  };

  const fireAllEvents = async () => {
    setIsFiring(true);
    setEventLog([]);
    
    let successCount = 0;
    let totalCount = 0;

    for (const category of Object.values(eventCategories)) {
      for (const event of category.events) {
        totalCount++;
        const success = await fireEvent(event.name, event.data);
        if (success) successCount++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsFiring(false);
    
    toast({
      title: 'Events gefeuert',
      description: `${successCount} von ${totalCount} Events erfolgreich gesendet`,
      variant: successCount === totalCount ? 'default' : 'destructive',
    });
  };

  const fireCategoryEvents = async (categoryKey: string) => {
    setIsFiring(true);
    
    const category = eventCategories[categoryKey as keyof typeof eventCategories];
    let successCount = 0;

    for (const event of category.events) {
      const success = await fireEvent(event.name, event.data);
      if (success) successCount++;
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setIsFiring(false);
    
    toast({
      title: `${category.title} Events gefeuert`,
      description: `${successCount} von ${category.events.length} Events gesendet`,
    });
  };

  const copyEventNames = (categoryKey: string) => {
    const category = eventCategories[categoryKey as keyof typeof eventCategories];
    const names = category.events.map(e => e.name).join('\n');
    navigator.clipboard.writeText(names);
    setCopiedCategory(categoryKey);
    setTimeout(() => setCopiedCategory(null), 2000);
    
    toast({
      title: 'Kopiert',
      description: 'Event-Namen in Zwischenablage kopiert',
    });
  };

  const clearLog = () => {
    setEventLog([]);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">PostHog Event Tester</h1>
        <p className="text-muted-foreground">
          Teste alle PostHog Events mit realistischen Daten
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            PostHog Status
            {isPostHogConfigured ? (
              <Badge variant="default" className="ml-2">Konfiguriert</Badge>
            ) : (
              <Badge variant="destructive" className="ml-2">Nicht konfiguriert</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {isPostHogConfigured 
              ? 'PostHog ist bereit, Events zu empfangen'
              : 'PostHog API Key fehlt. Setze VITE_PUBLIC_POSTHOG_KEY in deinen Environment Variables.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={fireAllEvents} 
            disabled={isFiring || !isPostHogConfigured}
            size="lg"
            className="w-full"
          >
            {isFiring ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Events werden gefeuert...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Alle Events feuern
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Event Categories */}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(eventCategories).map(([key, category]) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="text-lg">{category.title}</CardTitle>
              <CardDescription>
                {category.events.length} Event{category.events.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                {category.events.map((event) => (
                  <div key={event.name} className="text-sm text-muted-foreground font-mono">
                    {event.name}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => fireCategoryEvents(key)}
                  disabled={isFiring || !isPostHogConfigured}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  <Play className="mr-2 h-3 w-3" />
                  Feuern
                </Button>
                <Button
                  onClick={() => copyEventNames(key)}
                  size="sm"
                  variant="ghost"
                >
                  {copiedCategory === key ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Event Log */}
      {eventLog.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Event Log</CardTitle>
              <Button onClick={clearLog} variant="ghost" size="sm">
                Log leeren
              </Button>
            </div>
            <CardDescription>
              {eventLog.length} Event{eventLog.length !== 1 ? 's' : ''} gefeuert
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {eventLog.map((log, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-2 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>
                        {log.status === 'success' ? <Check className="h-3 w-3" /> : '✗'}
                      </Badge>
                      <span className="font-mono text-sm">{log.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
