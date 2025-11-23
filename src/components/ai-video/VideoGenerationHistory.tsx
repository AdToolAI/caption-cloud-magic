import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Download, RefreshCw, Loader2, Save, RotateCcw, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';

interface VideoGeneration {
  id: string;
  prompt: string;
  model: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  duration_seconds: number;
  total_cost_euros: number;
  created_at: string;
  completed_at: string | null;
}

interface VideoGenerationHistoryProps {
  onRetryGeneration?: (params: {
    prompt: string;
    model: string;
    duration: number;
  }) => void;
}

export function VideoGenerationHistory({ onRetryGeneration }: VideoGenerationHistoryProps = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [savingVideo, setSavingVideo] = useState<string | null>(null);
  const { toast } = useToast();
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const { data: generations, isLoading, refetch } = useQuery({
    queryKey: ['ai-video-generations', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('ai_video_generations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as VideoGeneration[];
    },
    enabled: !!user
  });

  // Realtime updates for generation status changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`ai-video-generations-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_video_generations',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          console.log('[VideoHistory] Realtime update received, refetching...');
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refetch]);

  const getStatusBadge = (status: VideoGeneration['status']) => {
    const variants = {
      pending: 'secondary',
      processing: 'default',
      completed: 'default',
      failed: 'destructive'
    } as const;

    const labels = {
      pending: 'Warteschlange',
      processing: 'Wird generiert...',
      completed: 'Fertig',
      failed: 'Fehlgeschlagen'
    };

    return (
      <Badge variant={variants[status]} className={status === 'completed' ? 'bg-green-500' : ''}>
        {status === 'processing' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
        {labels[status]}
      </Badge>
    );
  };

  const getFriendlyErrorMessage = (errorMessage: string | null): string => {
    if (!errorMessage) return 'Ein unbekannter Fehler ist aufgetreten.';

    // Check for Replicate service unavailable errors (E004)
    if (
      errorMessage.includes('Service is temporarily unavailable') ||
      errorMessage.includes('(E004)') ||
      errorMessage.includes('internal error')
    ) {
      return 'Der Videoanbieter war vorübergehend nicht verfügbar. Deine Credits wurden automatisch zurückerstattet. Bitte versuche es später erneut.';
    }

    // Check for other common Replicate errors
    if (errorMessage.includes('Rate limit exceeded')) {
      return 'Zu viele Anfragen. Bitte warte einen Moment und versuche es erneut.';
    }

    if (errorMessage.includes('Invalid input')) {
      return 'Ungültige Eingabe. Bitte überprüfe deine Eingaben und versuche es erneut.';
    }

    // For other errors, show a shortened version (max 150 chars)
    if (errorMessage.length > 150) {
      return errorMessage.substring(0, 147) + '...';
    }

    return errorMessage;
  };

  const handleRetry = (gen: VideoGeneration) => {
    if (onRetryGeneration) {
      onRetryGeneration({
        prompt: gen.prompt,
        model: gen.model,
        duration: gen.duration_seconds
      });
      toast({
        title: 'Formular vorbefüllt',
        description: 'Die Parameter wurden übernommen. Du kannst jetzt die Generierung erneut starten.'
      });
    }
  };

  const handleDownload = async (videoUrl: string, prompt: string) => {
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sora-${prompt.slice(0, 30)}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Video heruntergeladen',
        description: 'Das Video wurde erfolgreich heruntergeladen.'
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: 'Download fehlgeschlagen',
        description: 'Das Video konnte nicht heruntergeladen werden.',
        variant: 'destructive'
      });
    }
  };

  const handleSaveToLibrary = async (generationId: string) => {
    setSavingVideo(generationId);
    try {
      const { data, error } = await supabase.functions.invoke('save-ai-video-to-library', {
        body: { generation_id: generationId }
      });

      if (error) throw error;

      if (!data.ok) {
        throw new Error(data.error || 'Fehler beim Speichern');
      }

      sonnerToast.success('Video in Mediathek gespeichert!', {
        description: 'Du wirst zur Mediathek weitergeleitet...',
        duration: 2000
      });
      
      queryClient.invalidateQueries({ queryKey: ['video-history'] });
      
      // Navigate to Media Library with AI tab selected after 1 second
      setTimeout(() => {
        navigate('/media-library?tab=ai');
      }, 1000);
    } catch (error) {
      console.error('Save to library error:', error);
      sonnerToast.error(error instanceof Error ? error.message : 'Fehler beim Speichern in Mediathek');
    } finally {
      setSavingVideo(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!generations || generations.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Noch keine Videos generiert</p>
        <p className="text-sm text-muted-foreground">
          Erstelle dein erstes AI-Video im "Generieren" Tab
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Deine AI-Videos ({generations.length})</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Aktualisieren
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-4 mb-4">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
              Hinweis zur Video-Generierung
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
              <span className="block">
                Die Generierung von AI-Videos kann 5-10 Minuten dauern. Bitte warte mindestens 5-10 Minuten, bevor du die Seite neu lädst. Der Status wird automatisch aktualisiert, sobald dein Video fertig ist – ein manuelles Neuladen ist nicht nötig.
              </span>
              <span className="block mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                <strong>Wichtiger Hinweis:</strong> Sora 2 befindet sich derzeit in der Beta-Phase und kann gelegentlich Fehler bei der Videogenerierung aufweisen. Sollte ein Fehler auftreten, werden deine Credits automatisch wieder deinem Konto gutgeschrieben. Falls die Rückerstattung nicht innerhalb von 24 Stunden erfolgt, erstelle bitte ein Support-Ticket über unser Help-Center, damit wir die Angelegenheit umgehend prüfen können.
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 w-full">
        {generations.map((gen) => (
          <Card key={gen.id} className="p-4 w-full overflow-hidden">
            <div className="flex gap-4 w-full overflow-hidden">
              {/* Video Thumbnail/Player */}
              <div className="flex-shrink-0 w-48 h-32 bg-muted rounded-lg overflow-hidden relative">
                {gen.video_url && gen.status === 'completed' ? (
                  <>
                    {selectedVideo === gen.id ? (
                      <video
                        src={gen.video_url}
                        controls
                        autoPlay
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full cursor-pointer flex items-center justify-center bg-black/50"
                        onClick={() => setSelectedVideo(gen.id)}
                      >
                        <Play className="w-12 h-12 text-white" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {gen.status === 'processing' && (
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    )}
                    {gen.status === 'pending' && (
                      <div className="text-sm text-muted-foreground">Wartend...</div>
                    )}
                    {gen.status === 'failed' && (
                      <div className="text-sm text-destructive">Fehlgeschlagen</div>
                    )}
                  </div>
                )}
              </div>

              {/* Video Info */}
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium line-clamp-2 break-words mb-1">{gen.prompt}</h4>
                    <p className="text-sm text-muted-foreground">
                      {gen.model === 'sora-2-pro' ? 'Sora 2 Pro' : 'Sora 2 Standard'}
                      {' · '}
                      {gen.duration_seconds}s
                      {' · '}
                      {gen.total_cost_euros.toFixed(2)}€
                    </p>
                  </div>
                  {getStatusBadge(gen.status)}
                </div>

                <p className="text-xs text-muted-foreground mb-3">
                  {formatDistanceToNow(new Date(gen.created_at), {
                    addSuffix: true,
                    locale: de
                  })}
                </p>

                {gen.error_message && (
                  <div className="mb-3">
                    <p className="text-sm text-destructive">
                      {getFriendlyErrorMessage(gen.error_message)}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 flex-wrap w-full">
                  {gen.status === 'completed' && gen.video_url && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedVideo(gen.id)}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Abspielen
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(gen.video_url!, gen.prompt)}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSaveToLibrary(gen.id)}
                        disabled={savingVideo === gen.id}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {savingVideo === gen.id ? 'Speichert...' : 'In Mediathek'}
                      </Button>
                    </>
                  )}
                  {gen.status === 'processing' && (
                    <Button size="sm" variant="ghost" disabled>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generierung läuft...
                    </Button>
                  )}
                  {gen.status === 'failed' && onRetryGeneration && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleRetry(gen)}
                      className="border-primary text-primary hover:bg-primary/10"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Erneut generieren
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
