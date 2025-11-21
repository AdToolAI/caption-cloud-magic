/**
 * Template System Cache Manager
 * Intelligent caching for templates, field mappings, and customizations
 */

import { templateLogger } from './template-logger';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  hitRate: number;
}

class TemplateCacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    invalidations: 0,
    hitRate: 0,
  };
  
  // Default TTL: 5 minutes
  private defaultTTL = 5 * 60 * 1000;
  
  // Max cache size
  private maxSize = 100;

  /**
   * Get item from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      templateLogger.debug('Cache', 'Cache miss', { key });
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      templateLogger.debug('Cache', 'Cache expired', { key });
      return null;
    }

    this.stats.hits++;
    this.updateHitRate();
    templateLogger.debug('Cache', 'Cache hit', { key });
    return entry.data as T;
  }

  /**
   * Set item in cache
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTTL);

    // Enforce max size
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt,
    });

    this.stats.sets++;
    templateLogger.debug('Cache', 'Cache set', { key, ttl: ttl || this.defaultTTL });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.invalidations++;
      templateLogger.info('Cache', 'Cache invalidated', { key });
    }
  }

  /**
   * Invalidate all entries matching pattern
   */
  invalidatePattern(pattern: string | RegExp): void {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.stats.invalidations += count;
    templateLogger.info('Cache', 'Pattern invalidated', { pattern: pattern.toString(), count });
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.invalidations += size;
    templateLogger.info('Cache', 'Cache cleared', { entriesRemoved: size });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0,
      hitRate: 0,
    };
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Evict oldest entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      templateLogger.debug('Cache', 'Evicted oldest entry', { key: oldestKey });
    }
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      templateLogger.info('Cache', 'Cleaned expired entries', { count: cleaned });
    }

    return cleaned;
  }
}

// Singleton instance
export const templateCache = new TemplateCacheManager();

// Cache key generators
export const cacheKeys = {
  template: (templateId: string) => `template:${templateId}`,
  templates: (contentType?: string) => 
    contentType ? `templates:${contentType}` : 'templates:all',
  fieldMappings: (templateId: string) => `field-mappings:${templateId}`,
  customizations: (projectId: string) => `customizations:${projectId}`,
  compositionSettings: (componentId: string) => `composition:${componentId}`,
} as const;

// Auto-cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    templateCache.cleanExpired();
  }, 5 * 60 * 1000);
}
