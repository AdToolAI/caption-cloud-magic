/**
 * Performance monitoring and optimization utilities
 */

import React from 'react';
import { templateLogger } from '@/lib/template-logger';

/**
 * Measure function execution time
 */
export function measurePerformance<T>(
  name: string,
  fn: () => T
): T {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  
  templateLogger.debug('Performance', `${name} execution time`, { 
    duration: `${duration.toFixed(2)}ms` 
  });
  
  return result;
}

/**
 * Measure async function execution time
 */
export async function measurePerformanceAsync<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  
  templateLogger.debug('Performance', `${name} execution time`, { 
    duration: `${duration.toFixed(2)}ms` 
  });
  
  return result;
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return function debounced(...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function for performance optimization
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function throttled(...args: Parameters<T>) {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Memoize function results
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>) => {
    const key = keyGenerator 
      ? keyGenerator(...args) 
      : JSON.stringify(args);
    
    if (cache.has(key)) {
      templateLogger.debug('Performance', 'Memoized result used', { key });
      return cache.get(key)!;
    }
    
    const result = fn(...args);
    cache.set(key, result);
    
    return result;
  }) as T;
}

/**
 * Lazy load component with timeout
 */
export function lazyWithTimeout<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  timeout: number = 10000
): Promise<{ default: T }> {
  return Promise.race([
    factory(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Lazy load timeout')), timeout)
    ),
  ]);
}

/**
 * Check if value is in viewport (for lazy loading)
 */
export function isInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Batch multiple function calls
 */
export function batchCalls<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 100
): (...args: Parameters<T>) => void {
  let batch: Parameters<T>[] = [];
  let timeoutId: NodeJS.Timeout;
  
  return function batched(...args: Parameters<T>) {
    batch.push(args);
    clearTimeout(timeoutId);
    
    timeoutId = setTimeout(() => {
      const currentBatch = [...batch];
      batch = [];
      
      currentBatch.forEach(batchArgs => fn(...batchArgs));
      
      templateLogger.debug('Performance', 'Batch executed', { 
        count: currentBatch.length 
      });
    }, delay);
  };
}

/**
 * Request idle callback wrapper with fallback
 */
export function requestIdleTask(
  callback: () => void,
  options?: { timeout?: number }
): void {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, options);
  } else {
    // Fallback for browsers that don't support requestIdleCallback
    setTimeout(callback, 1);
  }
}

/**
 * Performance observer for monitoring
 */
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  record(name: string, duration: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(duration);
  }

  getMetrics(name: string): {
    count: number;
    avg: number;
    min: number;
    max: number;
    total: number;
  } | null {
    const durations = this.metrics.get(name);
    if (!durations || durations.length === 0) return null;

    return {
      count: durations.length,
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      total: durations.reduce((a, b) => a + b, 0),
    };
  }

  getAllMetrics(): Record<string, ReturnType<typeof this.getMetrics>> {
    const result: Record<string, ReturnType<typeof this.getMetrics>> = {};
    
    for (const name of this.metrics.keys()) {
      result[name] = this.getMetrics(name);
    }
    
    return result;
  }

  reset(): void {
    this.metrics.clear();
  }

  export(): string {
    return JSON.stringify(this.getAllMetrics(), null, 2);
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * HOC for measuring component render time
 */
export function withPerformanceTracking<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string
): React.ComponentType<P> {
  return function PerformanceTrackedComponent(props: P) {
    const start = performance.now();
    
    React.useEffect(() => {
      const duration = performance.now() - start;
      performanceMonitor.record(`${componentName}.render`, duration);
      
      templateLogger.debug('Performance', `${componentName} render time`, {
        duration: `${duration.toFixed(2)}ms`,
      });
    });
    
    return React.createElement(Component, props);
  };
}
