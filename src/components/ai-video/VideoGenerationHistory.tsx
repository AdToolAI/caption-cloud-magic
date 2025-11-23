import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Download, RefreshCw, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

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

export function VideoGenerationHistory() {
  const { user } = useAuth();
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

      <div className="grid gap-4">
        {generations.map((gen) => (
          <Card key={gen.id} className="p-4">
            <div className="flex gap-4">
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
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate mb-1">{gen.prompt}</h4>
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
                  <p className="text-sm text-destructive mb-3">
                    Fehler: {gen.error_message}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2">
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
                    </>
                  )}
                  {gen.status === 'processing' && (
                    <Button size="sm" variant="ghost" disabled>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generierung läuft...
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
