import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { QueueJob, useRenderQueue } from '@/hooks/useRenderQueue';
import { Clock, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface QueueJobCardProps {
  job: QueueJob;
  onUpdate: () => void;
}

export const QueueJobCard = ({ job, onUpdate }: QueueJobCardProps) => {
  const { cancelJob, loading } = useRenderQueue();

  const handleCancel = async () => {
    await cancelJob(job.id);
    onUpdate();
  };

  const getStatusConfig = () => {
    switch (job.status) {
      case 'queued':
        return { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Wartend' };
      case 'processing':
        return { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Verarbeitung', animate: true };
      case 'completed':
        return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', label: 'Fertig' };
      case 'failed':
        return { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100', label: 'Fehler' };
      case 'cancelled':
        return { icon: X, color: 'text-gray-600', bg: 'bg-gray-100', label: 'Abgebrochen' };
      default:
        return { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100', label: job.status };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className={`p-2 rounded-lg ${config.bg}`}>
              <StatusIcon className={`w-4 h-4 ${config.color} ${config.animate ? 'animate-spin' : ''}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">
                  Job {job.id.slice(0, 8)}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {job.engine || 'auto'}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Priority {job.priority}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>{job.estimated_cost} Credits</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: de })}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={config.color.includes('green') ? 'default' : 'secondary'}>
              {config.label}
            </Badge>
            {job.status === 'queued' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={loading}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {job.error_message && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {job.error_message}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
