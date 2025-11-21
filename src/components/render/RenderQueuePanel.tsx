import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRenderQueue, QueueJob } from '@/hooks/useRenderQueue';
import { QueueJobCard } from './QueueJobCard';
import { Loader2, ListOrdered } from 'lucide-react';

export const RenderQueuePanel = () => {
  const { getQueueJobs } = useRenderQueue();
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const loadJobs = async () => {
    const data = await getQueueJobs();
    setJobs(data);
    setLoading(false);
  };

  const queuedJobs = jobs.filter(j => j.status === 'queued');
  const processingJobs = jobs.filter(j => j.status === 'processing');
  const completedJobs = jobs.filter(j => j.status === 'completed');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListOrdered className="w-5 h-5" />
          Render Queue
        </CardTitle>
        <CardDescription>
          {queuedJobs.length} wartend • {processingJobs.length} in Bearbeitung • {completedJobs.length} fertig
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Keine Jobs in der Queue
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.slice(0, 10).map((job) => (
              <QueueJobCard key={job.id} job={job} onUpdate={loadJobs} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
