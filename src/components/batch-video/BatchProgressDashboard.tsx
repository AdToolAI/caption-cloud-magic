import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, XCircle, Loader2, Download, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BatchJob {
  id: string;
  job_name: string;
  total_videos: number;
  completed_videos: number;
  failed_videos: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  error_log: any; // JSONB from database
}

interface BatchProgressDashboardProps {
  batchJobId: string;
}

export function BatchProgressDashboard({ batchJobId }: BatchProgressDashboardProps) {
  const [batchJob, setBatchJob] = useState<BatchJob | null>(null);
  const [videoCreations, setVideoCreations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchBatchJob();
    fetchVideoCreations();

    // Setup realtime subscription for batch job updates
    const channel = supabase
      .channel('batch-progress')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'batch_jobs',
          filter: `id=eq.${batchJobId}`
        },
        (payload) => {
          setBatchJob(payload.new as BatchJob);
        }
      )
      .subscribe();

    // Poll video creations every 5 seconds
    const interval = setInterval(() => {
      fetchVideoCreations();
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [batchJobId]);

  const fetchBatchJob = async () => {
    const { data } = await supabase
      .from('batch_jobs')
      .select('*')
      .eq('id', batchJobId)
      .single();
    
    if (data) {
      setBatchJob(data);
    }
    setLoading(false);
  };

  const fetchVideoCreations = async () => {
    try {
      // @ts-ignore - Supabase type inference issue
      const response = await supabase
        .from('video_creations')
        .select('*')
        .eq('batch_job_id', batchJobId)
        .order('created_at', { ascending: true });
      
      if (!response.error && response.data) {
        setVideoCreations(response.data);
      }
    } catch (err) {
      console.error('Error fetching video creations:', err);
    }
  };

  const downloadAll = async () => {
    const completedVideos = videoCreations.filter(v => v.status === 'completed' && v.output_url);
    
    if (completedVideos.length === 0) {
      toast({
        title: 'Keine fertigen Videos',
        description: 'Es gibt noch keine abgeschlossenen Videos zum Herunterladen.',
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: 'Download gestartet',
      description: `${completedVideos.length} Videos werden heruntergeladen...`
    });

    // Download each video
    for (const video of completedVideos) {
      const a = document.createElement('a');
      a.href = video.output_url;
      a.download = `video-${video.id}.mp4`;
      a.click();
      await new Promise(resolve => setTimeout(resolve, 500)); // Delay between downloads
    }
  };

  if (loading || !batchJob) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  const progressPercent = (batchJob.completed_videos / batchJob.total_videos) * 100;
  const processing = batchJob.total_videos - batchJob.completed_videos - batchJob.failed_videos;

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{batchJob.job_name}</h3>
            <p className="text-sm text-muted-foreground">
              {batchJob.completed_videos} / {batchJob.total_videos} Videos fertig
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchVideoCreations}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Aktualisieren
            </Button>
            <Button
              size="sm"
              onClick={downloadAll}
              disabled={batchJob.completed_videos === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Alle herunterladen
            </Button>
          </div>
        </div>

        <Progress value={progressPercent} className="h-2" />

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>{batchJob.completed_videos} Erfolgreich</span>
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
            <span>{processing} In Bearbeitung</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span>{batchJob.failed_videos} Fehlgeschlagen</span>
          </div>
        </div>
      </Card>

      {/* Video List */}
      <Card className="p-6">
        <h4 className="font-semibold mb-4">Video Status</h4>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {videoCreations.map((video, index) => (
            <div
              key={video.id}
              className="flex items-center justify-between p-3 rounded-lg border"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">#{index + 1}</span>
                {video.status === 'completed' && (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
                {video.status === 'rendering' && (
                  <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                )}
                {video.status === 'failed' && (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div className="text-sm">
                  <p className="font-medium">
                    {video.customizations?.title || video.customizations?.produkt_name || `Video ${index + 1}`}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {video.status === 'completed' && 'Fertig'}
                    {video.status === 'rendering' && 'Wird erstellt...'}
                    {video.status === 'failed' && `Fehler: ${video.error_message?.substring(0, 50)}`}
                    {video.status === 'pending' && 'Wartet...'}
                  </p>
                </div>
              </div>
              {video.status === 'completed' && video.output_url && (
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                >
                  <a href={video.output_url} download>
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Error Log */}
      {batchJob.error_log && Array.isArray(batchJob.error_log) && batchJob.error_log.length > 0 && (
        <Card className="p-6 bg-red-50 dark:bg-red-950">
          <h4 className="font-semibold text-red-900 dark:text-red-100 mb-3">
            Fehlerprotokoll ({batchJob.error_log.length})
          </h4>
          <div className="space-y-2 text-sm text-red-800 dark:text-red-200">
            {batchJob.error_log.slice(0, 5).map((err: any, i: number) => (
              <p key={i}>
                Video {err.index + 1}: {err.error}
              </p>
            ))}
            {batchJob.error_log.length > 5 && (
              <p className="text-xs text-red-600 dark:text-red-400">
                ... und {batchJob.error_log.length - 5} weitere Fehler
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
