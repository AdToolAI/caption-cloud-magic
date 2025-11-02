/**
 * CDN utilities for optimized asset delivery
 */

export interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'png' | 'jpg';
}

/**
 * Get optimized image URL using Supabase Storage transformations
 * @param url - Original image URL
 * @param options - Optimization options
 * @returns Optimized image URL with transformation parameters
 */
export function getOptimizedImageUrl(
  url: string,
  options?: ImageOptimizationOptions
): string {
  if (!url) return url;
  
  // Only apply transformations to Supabase Storage URLs
  if (!url.includes('supabase.co/storage')) {
    return url;
  }

  const params = new URLSearchParams();
  
  if (options?.width) {
    params.set('width', options.width.toString());
  }
  
  if (options?.height) {
    params.set('height', options.height.toString());
  }
  
  if (options?.quality) {
    params.set('quality', Math.min(100, Math.max(1, options.quality)).toString());
  }
  
  if (options?.format) {
    params.set('format', options.format);
  }

  const separator = url.includes('?') ? '&' : '?';
  return params.toString() ? `${url}${separator}${params.toString()}` : url;
}

/**
 * Preload critical images for faster page loads
 */
export function preloadImage(url: string): void {
  if (typeof window === 'undefined') return;
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
}
