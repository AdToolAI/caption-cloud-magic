import { useEffect, useCallback, useRef } from 'react';

interface CapturedError {
  message: string;
  stack?: string;
  url?: string;
  timestamp: string;
  type: 'error' | 'unhandledrejection';
}

interface UseErrorCaptureOptions {
  onError?: (error: CapturedError) => void;
  enabled?: boolean;
}

export function useErrorCapture({ onError, enabled = true }: UseErrorCaptureOptions = {}) {
  const errorsRef = useRef<CapturedError[]>([]);
  const lastErrorRef = useRef<CapturedError | null>(null);

  const captureError = useCallback((error: CapturedError) => {
    // Avoid duplicates
    if (lastErrorRef.current?.message === error.message) {
      return;
    }

    lastErrorRef.current = error;
    errorsRef.current = [...errorsRef.current.slice(-9), error]; // Keep last 10

    onError?.(error);
  }, [onError]);

  useEffect(() => {
    if (!enabled) return;

    const handleError = (event: ErrorEvent) => {
      // Ignore certain non-critical errors
      const ignoredPatterns = [
        'ResizeObserver',
        'Script error',
        'Loading chunk',
        'ChunkLoadError',
        'Failed to fetch',
        'Network request failed',
        'timeout',
        'AbortError',
        'cancelled',
        'internal error occurred' // Sentry's own error message
      ];
      
      if (ignoredPatterns.some(pattern => event.message?.includes(pattern))) {
        return;
      }

      captureError({
        message: event.message || 'Unknown error',
        stack: event.error?.stack,
        url: event.filename || window.location.href,
        timestamp: new Date().toISOString(),
        type: 'error',
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason?.message || String(reason) || '';
      
      // Ignore certain promise rejections
      const ignoredPatterns = [
        'AbortError',
        'cancelled',
        'Failed to fetch',
        'Network request failed',
        'timeout',
        'ChunkLoadError'
      ];
      
      if (ignoredPatterns.some(pattern => message.includes(pattern))) {
        return;
      }

      captureError({
        message: message || 'Unhandled promise rejection',
        stack: reason?.stack,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        type: 'unhandledrejection',
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [enabled, captureError]);

  const getRecentErrors = useCallback(() => errorsRef.current, []);
  const getLastError = useCallback(() => lastErrorRef.current, []);
  const clearErrors = useCallback(() => {
    errorsRef.current = [];
    lastErrorRef.current = null;
  }, []);

  return {
    getRecentErrors,
    getLastError,
    clearErrors,
  };
}
