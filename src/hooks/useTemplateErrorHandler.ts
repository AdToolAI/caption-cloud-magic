import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { ErrorHandler, TemplateError } from '@/lib/template-errors';
import { templateLogger } from '@/lib/template-logger';

interface ErrorState {
  error: Error | null;
  isError: boolean;
  errorMessage: string | null;
}

export function useTemplateErrorHandler() {
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isError: false,
    errorMessage: null,
  });

  const handleError = useCallback((error: unknown, context?: string) => {
    // Log error
    ErrorHandler.log(error, context);
    
    if (context) {
      templateLogger.error(context, error instanceof Error ? error.message : String(error));
    }

    // Get user-friendly message
    const { message, details } = ErrorHandler.handle(error);

    // Update state
    setErrorState({
      error: error instanceof Error ? error : new Error(String(error)),
      isError: true,
      errorMessage: message,
    });

    // Show toast notification
    toast.error(message, {
      description: details,
      duration: 5000,
    });

    return message;
  }, []);

  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      isError: false,
      errorMessage: null,
    });
  }, []);

  const handleAsyncError = useCallback(
    async <T,>(
      operation: () => Promise<T>,
      context?: string
    ): Promise<T | null> => {
      try {
        clearError();
        return await operation();
      } catch (error) {
        handleError(error, context);
        return null;
      }
    },
    [handleError, clearError]
  );

  return {
    ...errorState,
    handleError,
    clearError,
    handleAsyncError,
  };
}

/**
 * Hook for handling transformation errors specifically
 */
export function useTransformationErrorHandler() {
  const { handleError } = useTemplateErrorHandler();

  const handleTransformationError = useCallback(
    (fieldKey: string, transformationFunction: string, value: any, error: unknown) => {
      const { TransformationError } = require('@/lib/template-errors');
      const transformError = new TransformationError(
        fieldKey,
        transformationFunction,
        value,
        error instanceof Error ? error : undefined
      );
      
      handleError(transformError, 'Transformation');
      
      return value; // Return original value as fallback
    },
    [handleError]
  );

  return {
    handleTransformationError,
  };
}
