interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();

  /**
   * Check if a request is allowed under the rate limit
   * @param key Unique identifier for the rate limit (e.g., 'api-call', 'user-action')
   * @param maxRequests Maximum number of requests allowed
   * @param windowMs Time window in milliseconds
   * @returns true if request is allowed, false if rate limited
   */
  check(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = this.limits.get(key);

    // Reset or initialize if expired or not exists
    if (!entry || now >= entry.resetAt) {
      this.limits.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return true;
    }

    // Check if under limit
    if (entry.count < maxRequests) {
      entry.count++;
      return true;
    }

    // Rate limited
    return false;
  }

  /**
   * Get remaining requests for a key
   */
  getRemaining(key: string, maxRequests: number): number {
    const entry = this.limits.get(key);
    if (!entry || Date.now() >= entry.resetAt) {
      return maxRequests;
    }
    return Math.max(0, maxRequests - entry.count);
  }

  /**
   * Get time until reset in milliseconds
   */
  getResetTime(key: string): number {
    const entry = this.limits.get(key);
    if (!entry || Date.now() >= entry.resetAt) {
      return 0;
    }
    return entry.resetAt - Date.now();
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Clear all rate limits
   */
  clear(): void {
    this.limits.clear();
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Decorator function to add rate limiting to async functions
 */
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  key: string,
  maxRequests: number,
  windowMs: number
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    if (!rateLimiter.check(key, maxRequests, windowMs)) {
      const resetTime = rateLimiter.getResetTime(key);
      throw new Error(
        `Rate limit exceeded. Try again in ${Math.ceil(resetTime / 1000)} seconds.`
      );
    }
    return fn(...args);
  }) as T;
}
