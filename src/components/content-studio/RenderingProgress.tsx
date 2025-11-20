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
    let interval: NodeJS.Timeout;
    let timeoutCount = 0;
    const maxTimeout = 60; // 5 Minuten (60 * 5s)

    const checkStatus = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-content-video-status', {
          body: { project_id: projectId }
        });

        if (error) throw error;

        if (data.status === 'completed') {
          setStatus('completed');
          const videoUrl = data.output_urls?.mp4 || data.output_url;
          setOutputUrl(videoUrl);
          setProgress(100);
          clearInterval(interval);

          queryClient.invalidateQueries({ queryKey: ['content-projects'] });
          queryClient.invalidateQueries({ queryKey: ['unified-projects'] });

          toast({
            title: 'Video fertig!',
            description: 'Dein Video wurde erfolgreich erstellt.'
          });
        } else if (data.status === 'failed') {
          setStatus('failed');
          setError(data.error_message || 'Rendering fehlgeschlagen');
          clearInterval(interval);

          toast({
            title: 'Fehler',
            description: 'Video-Rendering fehlgeschlagen',
            variant: 'destructive'
          });
        } else {
          // Still rendering - use progress from API
          setStatus('rendering');
          const apiProgress = data.progress || Math.min(timeoutCount * 3, 90);
          setProgress(apiProgress);
        }

        timeoutCount++;
        if (timeoutCount >= maxTimeout) {
          clearInterval(interval);
          setStatus('failed');
          setError('Timeout - Rendering dauert zu lange');
        }
      } catch (err) {
        console.error('Status check error:', err);
      }
    };

    // Initial check
    checkStatus();

    // Poll every 5 seconds
    interval = setInterval(checkStatus, 5000);

    return () => clearInterval(interval);
  }, [renderId, projectId, toast, queryClient]);

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
