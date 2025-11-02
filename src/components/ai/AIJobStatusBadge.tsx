/**
 * Badge component to show AI job status
 */

import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface AIJobStatusBadgeProps {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  retryCount?: number;
}

export function AIJobStatusBadge({ status, retryCount }: AIJobStatusBadgeProps) {
  const config = {
    pending: {
      icon: Clock,
      label: 'Warteschlange',
      variant: 'secondary' as const,
      className: 'text-muted-foreground'
    },
    processing: {
      icon: Loader2,
      label: 'Verarbeitung',
      variant: 'default' as const,
      className: 'text-primary animate-spin'
    },
    completed: {
      icon: CheckCircle2,
      label: 'Abgeschlossen',
      variant: 'default' as const,
      className: 'text-success'
    },
    failed: {
      icon: XCircle,
      label: 'Fehlgeschlagen',
      variant: 'destructive' as const,
      className: 'text-destructive'
    },
    cancelled: {
      icon: XCircle,
      label: 'Abgebrochen',
      variant: 'outline' as const,
      className: 'text-muted-foreground'
    }
  };

  const { icon: Icon, label, variant, className } = config[status];

  return (
    <Badge variant={variant} className="gap-2">
      <Icon className={`h-3 w-3 ${className}`} />
      <span className="text-xs">
        {label}
        {retryCount && retryCount > 0 ? ` (Versuch ${retryCount})` : ''}
      </span>
    </Badge>
  );
}
