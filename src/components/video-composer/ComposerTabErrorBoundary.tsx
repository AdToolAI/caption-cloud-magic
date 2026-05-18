import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Lightweight, in-place error boundary for individual composer tabs.
 *
 * Unlike the global ErrorBoundary, this never replaces the whole page —
 * a single broken scene / library row only shows a small inline card with
 * a "Retry" button so the rest of the composer stays usable.
 */
export class ComposerTabErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ComposerTabErrorBoundary]', this.props.label || 'unknown', error, info);
  }

  private reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="text-sm leading-snug">
              <div className="font-medium">
                {this.props.label
                  ? `${this.props.label} konnte nicht gerendert werden`
                  : 'Beim Rendern ist ein Fehler aufgetreten'}
              </div>
              {this.state.error?.message && (
                <div className="text-xs text-muted-foreground font-mono mt-1 break-all">
                  {this.state.error.message}
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                Häufige Ursache: ein Charakter / Asset ohne Namen in deiner Library.
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={this.reset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Erneut versuchen
          </Button>
        </CardContent>
      </Card>
    );
  }
}

export default ComposerTabErrorBoundary;
