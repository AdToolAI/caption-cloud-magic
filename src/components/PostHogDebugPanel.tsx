import { useEffect, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';

export const PostHogDebugPanel = () => {
  const posthog = usePostHog();
  const [windowPosthogStatus, setWindowPosthogStatus] = useState<string>('checking...');
  const [lastEventSent, setLastEventSent] = useState<string | null>(null);

  useEffect(() => {
    // Check window.posthog status
    const checkStatus = () => {
      const wp = (window as any).posthog;
      if (wp && typeof wp.capture === 'function') {
        setWindowPosthogStatus('✅ Available');
      } else {
        setWindowPosthogStatus('❌ Not Available');
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleTestEvent = () => {
    const eventName = 'debug_test_event';
    const timestamp = new Date().toISOString();
    
    // Try all methods
    trackEvent(eventName, { 
      test: true, 
      timestamp,
      method: 'trackEvent_function'
    });
    
    if (posthog) {
      posthog.capture(eventName, { 
        test: true, 
        timestamp,
        method: 'usePostHog_hook'
      });
    }
    
    if ((window as any).posthog?.capture) {
      (window as any).posthog.capture(eventName, { 
        test: true, 
        timestamp,
        method: 'window_posthog'
      });
    }

    setLastEventSent(timestamp);
  };

  return (
    <Card className="fixed bottom-4 right-4 w-96 shadow-lg z-50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          PostHog Debug Panel
          <Badge variant={windowPosthogStatus.includes('✅') ? 'default' : 'destructive'}>
            {windowPosthogStatus.includes('✅') ? 'Active' : 'Inactive'}
          </Badge>
        </CardTitle>
        <CardDescription>Live PostHog Status Monitor</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">window.posthog:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {windowPosthogStatus}
            </code>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">usePostHog() hook:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {posthog ? '✅ Available' : '❌ Not Available'}
            </code>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">PostHog Type:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {typeof posthog}
            </code>
          </div>
        </div>

        <div className="pt-4 border-t">
          <Button 
            onClick={handleTestEvent}
            className="w-full"
          >
            Send Test Event
          </Button>
          
          {lastEventSent && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Last event: {lastEventSent}
            </p>
          )}
        </div>

        <div className="pt-2 text-xs text-muted-foreground">
          <p>✅ If you see "Available" above, PostHog is working!</p>
          <p className="mt-1">Check your PostHog dashboard for events.</p>
        </div>
      </CardContent>
    </Card>
  );
};
