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
      if (
        event.message?.includes('ResizeObserver') ||
        event.message?.includes('Script error') ||
        event.message?.includes('Loading chunk')
      ) {
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
      
      // Ignore certain promise rejections
      if (
        reason?.message?.includes('AbortError') ||
        reason?.message?.includes('cancelled')
      ) {
        return;
      }

      captureError({
        message: reason?.message || String(reason) || 'Unhandled promise rejection',
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
