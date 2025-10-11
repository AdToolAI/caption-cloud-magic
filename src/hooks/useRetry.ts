import { useState, useCallback } from 'react';

interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  exponentialBackoff?: boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Hook for retrying failed operations with exponential backoff
 */
export function useRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
) {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    exponentialBackoff = true,
    onRetry,
  } = options;

  const [isRetrying, setIsRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const executeWithRetry = useCallback(async (): Promise<T> => {
    setIsRetrying(true);
    let lastError: Error | undefined;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        setAttempt(i + 1);
        const result = await operation();
        setIsRetrying(false);
        setAttempt(0);
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on last attempt
        if (i === maxAttempts - 1) {
          break;
        }

        // Calculate delay with optional exponential backoff
        const delay = exponentialBackoff 
          ? delayMs * Math.pow(2, i)
          : delayMs;

        // Call retry callback if provided
        if (onRetry) {
          onRetry(i + 1, lastError);
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    setIsRetrying(false);
    setAttempt(0);
    throw lastError || new Error('Operation failed after retries');
  }, [operation, maxAttempts, delayMs, exponentialBackoff, onRetry]);

  return {
    executeWithRetry,
    isRetrying,
    attempt,
  };
}