import { useEffect, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';

export const PostHogDebugPanel = () => {
  const posthog = usePostHog();
  const [lastEventSent, setLastEventSent] = useState<string | null>(null);

  const handleTestEvent = () => {
    const eventName = 'debug_test_event';
    const timestamp = new Date().toISOString();
    
    // Use usePostHog hook (official method)
    if (posthog) {
      posthog.capture(eventName, { 
        test: true, 
        timestamp,
        method: 'usePostHog_hook'
      });
    }
    
    // Also test trackEvent utility
    trackEvent(eventName, { 
      test: true, 
      timestamp,
      method: 'trackEvent_function'
    });

    setLastEventSent(timestamp);
  };

  return (
    <Card className="fixed bottom-4 right-4 w-96 shadow-lg z-50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          PostHog Debug Panel
          <Badge variant={posthog ? 'default' : 'destructive'}>
            {posthog ? 'Active' : 'Inactive'}
          </Badge>
        </CardTitle>
        <CardDescription>usePostHog Hook Status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">usePostHog() hook:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {posthog ? '✅ Available' : '❌ Not Available'}
            </code>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Has capture method:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {typeof posthog?.capture === 'function' ? '✅ Yes' : '❌ No'}
            </code>
          </div>
        </div>

        <div className="pt-4 border-t">
          <Button 
            onClick={handleTestEvent}
            className="w-full"
            disabled={!posthog}
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
          <p>✅ Using official usePostHog() React Hook</p>
          <p className="mt-1">Check PostHog dashboard for test events.</p>
        </div>
      </CardContent>
    </Card>
  );
};
