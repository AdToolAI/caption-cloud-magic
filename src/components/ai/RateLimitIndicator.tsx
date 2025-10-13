import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Clock, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface RateLimitIndicatorProps {
  remainingCalls: number;
  maxCalls: number;
  resetTime: number; // seconds until reset
}

export function RateLimitIndicator({ remainingCalls, maxCalls, resetTime }: RateLimitIndicatorProps) {
  const [countdown, setCountdown] = useState(resetTime);

  useEffect(() => {
    setCountdown(resetTime);
  }, [resetTime]);

  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  const percentage = (remainingCalls / maxCalls) * 100;
  const isLow = remainingCalls <= Math.ceil(maxCalls * 0.3);

  if (remainingCalls === maxCalls && countdown === 0) {
    return null; // Don't show when at full capacity
  }

  return (
    <Card className="p-4 border-dashed">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className={`h-4 w-4 ${isLow ? 'text-destructive' : 'text-primary'}`} />
            <span className="text-sm font-medium">
              AI Calls verfügbar: {remainingCalls}/{maxCalls}
            </span>
          </div>
          {countdown > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{countdown}s</span>
            </div>
          )}
        </div>
        
        <Progress 
          value={percentage} 
          className="h-2"
        />
        
        {isLow && (
          <p className="text-xs text-muted-foreground">
            {remainingCalls === 0 
              ? `Bitte warte ${countdown} Sekunden für den nächsten Call`
              : 'Nur noch wenige Calls verfügbar in dieser Minute'}
          </p>
        )}
      </div>
    </Card>
  );
}
