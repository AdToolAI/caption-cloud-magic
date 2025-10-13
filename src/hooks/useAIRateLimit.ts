import { useState, useCallback } from 'react';
import { rateLimiter } from '@/lib/rateLimit';
import { useAuth } from './useAuth';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 3,
  windowMs: 60000, // 1 minute
};

/**
 * Hook for managing AI feature rate limits per user
 */
export function useAIRateLimit(config: Partial<RateLimitConfig> = {}) {
  const { user } = useAuth();
  const [isLimited, setIsLimited] = useState(false);
  const [resetTime, setResetTime] = useState<number>(0);

  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  const checkRateLimit = useCallback((): { allowed: boolean; waitTime: number } => {
    if (!user) {
      return { allowed: false, waitTime: 0 };
    }

    const key = `ai_${user.id}`;
    const allowed = rateLimiter.check(key, finalConfig.maxRequests, finalConfig.windowMs);
    
    if (!allowed) {
      const resetAt = rateLimiter.getResetTime(key);
      const waitTime = Math.ceil(resetAt / 1000);
      setIsLimited(true);
      setResetTime(waitTime);
      return { allowed: false, waitTime };
    }

    setIsLimited(false);
    setResetTime(0);
    return { allowed: true, waitTime: 0 };
  }, [user, finalConfig]);

  const getRemainingCalls = useCallback((): number => {
    if (!user) return 0;
    const key = `ai_${user.id}`;
    return rateLimiter.getRemaining(key, finalConfig.maxRequests);
  }, [user, finalConfig]);

  const resetLimit = useCallback(() => {
    if (!user) return;
    const key = `ai_${user.id}`;
    rateLimiter.reset(key);
    setIsLimited(false);
    setResetTime(0);
  }, [user]);

  return {
    checkRateLimit,
    getRemainingCalls,
    resetLimit,
    isLimited,
    resetTime,
  };
}
