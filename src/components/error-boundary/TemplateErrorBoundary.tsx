import React, { Component, ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { ErrorHandler, TemplateError } from '@/lib/template-errors';
import { templateLogger } from '@/lib/template-logger';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class TemplateErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to logger
    templateLogger.error('ErrorBoundary', 'Component error caught', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // Log using error handler
    ErrorHandler.log(error, 'ErrorBoundary');

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    this.setState({
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      // Default error UI
      const errorDetails = ErrorHandler.handle(this.state.error);
      const isTemplateError = this.state.error instanceof TemplateError;

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="max-w-2xl w-full p-6 space-y-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-8 w-8 text-destructive flex-shrink-0 mt-1" />
              <div className="flex-1 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2">
                    {isTemplateError ? 'Template-Fehler' : 'Etwas ist schief gelaufen'}
                  </h2>
                  <p className="text-muted-foreground">
                    {errorDetails.message}
                  </p>
                </div>

                {import.meta.env.DEV && errorDetails.details && (
                  <Alert variant="destructive">
                    <AlertTitle>Entwickler-Details</AlertTitle>
                    <AlertDescription className="mt-2 font-mono text-xs whitespace-pre-wrap">
                      {errorDetails.details}
                    </AlertDescription>
                  </Alert>
                )}

                {isTemplateError && this.state.error instanceof TemplateError && (
                  <div className="bg-muted p-4 rounded-lg">
                    <h3 className="font-semibold mb-2 text-sm">Fehlercode</h3>
                    <code className="text-xs">{this.state.error.code}</code>
                    
                    {this.state.error.metadata && (
                      <>
                        <h3 className="font-semibold mb-2 text-sm mt-4">Details</h3>
                        <pre className="text-xs overflow-auto">
                          {JSON.stringify(this.state.error.metadata, null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button onClick={this.handleReset} className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Erneut versuchen
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.location.href = '/'}
                    className="flex items-center gap-2"
                  >
                    <Home className="h-4 w-4" />
                    Zur Startseite
                  </Button>
                </div>

                {import.meta.env.DEV && (
                  <details className="mt-6">
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                      Erweiterte Fehlerinformationen anzeigen
                    </summary>
                    <div className="mt-4 p-4 bg-muted rounded-lg">
                      <pre className="text-xs overflow-auto whitespace-pre-wrap">
                        {this.state.error.stack}
                      </pre>
                      {this.state.errorInfo?.componentStack && (
                        <>
                          <h4 className="font-semibold mt-4 mb-2 text-sm">Component Stack</h4>
                          <pre className="text-xs overflow-auto whitespace-pre-wrap">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * HOC to wrap components with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: (error: Error, reset: () => void) => ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <TemplateErrorBoundary fallback={fallback}>
        <Component {...props} />
      </TemplateErrorBoundary>
    );
  };
}
