import { ReactNode } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BannerProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export const Banner = ({
  type = 'info',
  title,
  children,
  action,
  dismissible = false,
  onDismiss,
  className = ''
}: BannerProps) => {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5" />;
      case 'error':
        return <AlertCircle className="h-5 w-5" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  const getBgColor = () => {
    switch (type) {
      case 'success':
        return 'bg-success/10 border-success/20 text-success';
      case 'warning':
        return 'bg-warning/10 border-warning/20 text-warning';
      case 'error':
        return 'bg-destructive/10 border-destructive/20 text-destructive';
      default:
        return 'bg-primary/10 border-primary/20 text-primary';
    }
  };

  return (
    <div className={`border rounded-lg p-4 ${getBgColor()} ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className="font-semibold mb-1 text-foreground">
              {title}
            </h4>
          )}
          <div className="text-sm text-foreground/90">
            {children}
          </div>
          
          {action && (
            <Button
              size="sm"
              variant="outline"
              onClick={action.onClick}
              className="mt-3"
            >
              {action.label}
            </Button>
          )}
        </div>

        {dismissible && onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-foreground/50 hover:text-foreground transition-colors"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
};
