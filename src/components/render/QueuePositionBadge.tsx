import { useEffect, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { useRenderQueue } from '@/hooks/useRenderQueue';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';

interface QueuePositionBadgeProps {
  jobId: string;
  className?: string;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `~${min} Min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `~${h}h ${m}m`;
}

export const QueuePositionBadge = ({ jobId, className }: QueuePositionBadgeProps) => {
  const { getQueuePosition } = useRenderQueue();
  const [data, setData] = useState<{ position: number; etaSeconds: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const result = await getQueuePosition(jobId);
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    };
    refresh();

    const channel = supabase
      .channel(`queue-position-${jobId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'render_queue' },
        refresh
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className ?? ''}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Position wird ermittelt …</span>
      </div>
    );
  }

  if (!data) return null;

  if (data.position === 0) {
    return (
      <div className={`flex items-center gap-2 text-sm text-primary ${className ?? ''}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="font-medium">Render läuft …</span>
      </div>
    );
  }

  // Progress visual: closer to position 1 = more progress
  const progress = Math.max(5, 100 - Math.min(95, data.position * 15));

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 font-medium">
          <span className="text-base">🎬</span>
          <span>Position {data.position} in der Warteschlange</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span>{formatEta(data.etaSeconds)}</span>
        </div>
      </div>
      <Progress value={progress} className="h-1.5" />
    </div>
  );
};
