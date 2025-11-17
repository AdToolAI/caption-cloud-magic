/**
 * Redis Cache Helper for Upstash Redis (Deno Edge Functions)
 * 
 * Features:
 * - Connection Pooling via Upstash REST API
 * - get/set/delete/invalidate methods
 * - TTL Support (Time To Live)
 * - Error Handling (graceful degradation if Redis unavailable)
 * - Logging for Cache Hits/Misses
 */

interface RedisCacheOptions {
  ttl?: number; // Time to live in seconds
  logHits?: boolean; // Log cache hits/misses for monitoring
}

class RedisCache {
  private redisUrl: string;
  private redisToken: string;
  private enabled: boolean;
  private static instance: RedisCache | null = null;

  private constructor() {
    this.redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL') || '';
    this.redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN') || '';
    this.enabled = Boolean(this.redisUrl && this.redisToken);

    if (!this.enabled) {
      console.warn('[Redis Cache] UPSTASH credentials not found - caching disabled');
    }
  }

  static getInstance(): RedisCache {
    if (!RedisCache.instance) {
      RedisCache.instance = new RedisCache();
    }
    return RedisCache.instance;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, options: RedisCacheOptions = {}): Promise<T | null> {
    if (!this.enabled) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
      const response = await fetch(`${this.redisUrl}/get/${encodeURIComponent(key)}`, {
        headers: {
          Authorization: `Bearer ${this.redisToken}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[Redis Cache] GET failed for key "${key}":`, response.status);
        return null;
      }

      const data = await response.json();
      
      if (data.result === null) {
        if (options.logHits) {
          console.log(`[Redis Cache] MISS: ${key}`);
        }
        return null;
      }

      if (options.logHits) {
        console.log(`[Redis Cache] HIT: ${key}`);
      }

      // Parse JSON if it's a string
      try {
        return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
      } catch {
        return data.result;
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error?.name === 'AbortError') {
        console.warn(`[Redis Cache] Timeout (5s) for GET key "${key}" - degrading to DB query`);
        return null;
      }
      console.error(`[Redis Cache] GET error for key "${key}":`, error);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    if (!this.enabled) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      // Use SETEX if TTL is provided, otherwise SET
      const endpoint = ttlSeconds 
        ? `${this.redisUrl}/setex/${encodeURIComponent(key)}/${ttlSeconds}`
        : `${this.redisUrl}/set/${encodeURIComponent(key)}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(serializedValue),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[Redis Cache] SET failed for key "${key}":`, response.status);
        return false;
      }

      console.log(`[Redis Cache] SET: ${key} (TTL: ${ttlSeconds || 'none'}s)`);
      return true;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error?.name === 'AbortError') {
        console.warn(`[Redis Cache] Timeout (5s) for SET key "${key}"`);
        return false;
      }
      console.error(`[Redis Cache] SET error for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Delete specific key
   */
  async delete(key: string): Promise<boolean> {
    if (!this.enabled) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
      const response = await fetch(`${this.redisUrl}/del/${encodeURIComponent(key)}`, {
        headers: {
          Authorization: `Bearer ${this.redisToken}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[Redis Cache] DELETE failed for key "${key}":`, response.status);
        return false;
      }

      console.log(`[Redis Cache] DELETE: ${key}`);
      return true;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error?.name === 'AbortError') {
        console.warn(`[Redis Cache] Timeout (5s) for DELETE key "${key}"`);
        return false;
      }
      console.error(`[Redis Cache] DELETE error for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Invalidate all keys matching a pattern
   * Example: invalidate('planner:workspace_123:*')
   */
  async invalidate(pattern: string): Promise<number> {
    if (!this.enabled) return 0;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
      // Step 1: Get all keys matching pattern using SCAN
      const scanResponse = await fetch(`${this.redisUrl}/keys/${encodeURIComponent(pattern)}`, {
        headers: {
          Authorization: `Bearer ${this.redisToken}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!scanResponse.ok) {
        console.error(`[Redis Cache] KEYS failed for pattern "${pattern}":`, scanResponse.status);
        return 0;
      }

      const scanData = await scanResponse.json();
      const keys = scanData.result || [];

      if (keys.length === 0) {
        console.log(`[Redis Cache] INVALIDATE: No keys found for pattern "${pattern}"`);
        return 0;
      }

      // Step 2: Delete all matching keys
      const deletePromises = keys.map((key: string) => this.delete(key));
      await Promise.all(deletePromises);

      console.log(`[Redis Cache] INVALIDATE: Deleted ${keys.length} keys matching "${pattern}"`);
      return keys.length;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error?.name === 'AbortError') {
        console.warn(`[Redis Cache] Timeout (5s) for INVALIDATE pattern "${pattern}"`);
        return 0;
      }
      console.error(`[Redis Cache] INVALIDATE error for pattern "${pattern}":`, error);
      return 0;
    }
  }

  /**
   * Check if Redis is available
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generate cache key hash from object
   */
  generateKeyHash(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${JSON.stringify(params[key])}`)
      .join('|');
    
    return `${prefix}:${this.hashString(sortedParams)}`;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

// Phase 3.3: Singleton Pattern for Connection Pooling
// Reuses same RedisCache instance across requests to reduce overhead
export function getRedisCache(): RedisCache {
  return RedisCache.getInstance();
}

export { RedisCache };
