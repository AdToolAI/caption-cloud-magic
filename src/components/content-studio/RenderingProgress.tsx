import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Loader2, Download, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface RenderingProgressProps {
  renderId: string;
  projectId: string;
}

export const RenderingProgress = ({ renderId, projectId }: RenderingProgressProps) => {
  const [status, setStatus] = useState<'queued' | 'rendering' | 'completed' | 'failed'>('queued');
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!renderId) return;

    console.log('🎬 Setting up realtime subscription for render:', renderId);

    // Initial status check
    const checkInitialStatus = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-content-video-status', {
          body: { render_id: renderId, project_id: projectId }
        });

        if (error) throw error;

        if (data.status === 'completed') {
          setStatus('completed');
          setProgress(100);
          setOutputUrl(data.output_url);
        } else if (data.status === 'failed') {
          setStatus('failed');
          setError(data.error);
        }
      } catch (err) {
        console.error('Error checking initial status:', err);
      }
    };

    checkInitialStatus();

    // Subscribe to realtime updates for this video creation
    const channel = supabase
      .channel(`video-progress-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_creations',
          filter: `id=eq.${projectId}`,
        },
        (payload) => {
          console.log('📡 Realtime update received:', payload);
          const newData = payload.new as any;

          if (newData.progress_percentage) {
            setProgress(newData.progress_percentage);
          }

          if (newData.status === 'completed') {
            setStatus('completed');
            setProgress(100);
            setOutputUrl(newData.output_url);
            
            queryClient.invalidateQueries({ queryKey: ['content-videos', projectId] });
            queryClient.invalidateQueries({ queryKey: ['content-projects'] });
          } else if (newData.status === 'failed') {
            setStatus('failed');
            setError(newData.error_message);
          } else if (newData.status === 'rendering') {
            setStatus('rendering');
          }
        }
      )
      .subscribe();

    // Timeout fallback
    const timeoutId = setTimeout(() => {
      if (status !== 'completed') {
        setStatus('failed');
        setError('Rendering timeout');
      }
    }, 300000); // 5 minutes

    return () => {
      console.log('🧹 Cleaning up realtime subscription');
      supabase.removeChannel(channel);
      clearTimeout(timeoutId);
    };
  }, [renderId, projectId, status, queryClient]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          {status === 'completed' ? 'Video fertig!' : 'Video wird erstellt...'}
        </h2>
        <p className="text-muted-foreground">
          {status === 'completed' 
            ? 'Dein Video ist bereit zum Download'
            : 'Das dauert normalerweise 2-5 Minuten'}
        </p>
      </div>

      <Card className="p-8 space-y-6">
        {status === 'completed' && outputUrl ? (
          <div className="space-y-6">
            <div className="flex items-center justify-center text-green-600">
              <CheckCircle className="h-16 w-16" />
            </div>
            <div className="text-center space-y-4">
              <h3 className="text-xl font-semibold">Erfolgreich erstellt!</h3>
              <div className="flex gap-3 justify-center">
                <Button asChild>
                  <a href={outputUrl} download target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    Herunterladen
                  </a>
                </Button>
                <Button variant="outline" onClick={() => navigate('/videos')}>
                  <Eye className="mr-2 h-4 w-4" />
                  Alle Videos anzeigen
                </Button>
              </div>
            </div>
          </div>
        ) : status === 'failed' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-center text-destructive">
              <XCircle className="h-16 w-16" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold">Fehler beim Rendern</h3>
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Erneut versuchen
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fortschritt</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {status === 'queued' ? 'In Warteschlange...' : 'Video wird gerendert...'}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};
