import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Download, RefreshCw, Loader2, RotateCcw, Info, CheckCircle2, Library } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de, enUS, es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import { formatPrice, getCurrencyForLanguage } from '@/lib/currency';

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
  onRetryGeneration?: (params: { prompt: string; model: string; duration: number }) => void;
}

const dateFnsLocales = { de, en: enUS, es };

export function VideoGenerationHistory({ onRetryGeneration }: VideoGenerationHistoryProps = {}) {
  const { user } = useAuth();
  const { language, t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [savingVideo, setSavingVideo] = useState<string | null>(null);
  const currency = getCurrencyForLanguage(language);
  const dateLocale = dateFnsLocales[language as keyof typeof dateFnsLocales] || enUS;

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

  const { data: savedGenerationIds } = useQuery({
    queryKey: ['saved-generation-ids', user?.id],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const { data, error } = await supabase
        .from('video_creations')
        .select('metadata')
        .eq('user_id', user.id);
      if (error) return new Set<string>();
      const ids = new Set<string>();
      data?.forEach((vc: any) => {
        const genId = vc.metadata?.ai_generation_id;
        if (genId) ids.add(genId);
      });
      return ids;
    },
    enabled: !!user
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`ai-video-generations-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_video_generations', filter: `user_id=eq.${user.id}` }, () => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ['saved-generation-ids', user?.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, refetch, queryClient]);

  const getStatusBadge = (status: VideoGeneration['status']) => {
    const variants = { pending: 'secondary', processing: 'default', completed: 'default', failed: 'destructive' } as const;
    const labels = {
      pending: t('aiVid.statusPending'),
      processing: t('aiVid.statusProcessing'),
      completed: t('aiVid.statusCompleted'),
      failed: t('aiVid.statusFailed'),
    };
    return (
      <Badge variant={variants[status]} className={status === 'completed' ? 'bg-green-500' : ''}>
        {status === 'processing' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
        {labels[status]}
      </Badge>
    );
  };

  const getFriendlyErrorMessage = (errorMessage: string | null): string => {
    if (!errorMessage) return t('aiVid.errorUnknown');
    if (errorMessage.includes('Service is temporarily unavailable') || errorMessage.includes('(E004)') || errorMessage.includes('internal error')) {
      return t('aiVid.errorProviderUnavail');
    }
    if (errorMessage.includes('Rate limit exceeded')) return t('aiVid.errorRateLimit');
    if (errorMessage.includes('Invalid input')) return t('aiVid.errorInvalidInput');
    if (errorMessage.length > 150) return errorMessage.substring(0, 147) + '...';
    return errorMessage;
  };

  const handleRetry = (gen: VideoGeneration) => {
    if (onRetryGeneration) {
      onRetryGeneration({ prompt: gen.prompt, model: gen.model, duration: gen.duration_seconds });
      toast({ title: t('aiVid.formPrefilled'), description: t('aiVid.formPrefilledDesc') });
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
      toast({ title: t('aiVid.videoDownloaded'), description: t('aiVid.videoDownloadedDesc') });
    } catch (error) {
      console.error('Download error:', error);
      toast({ title: t('aiVid.downloadFailed'), description: t('aiVid.downloadFailedDesc'), variant: 'destructive' });
    }
  };

  const handleSaveToLibrary = async (generationId: string) => {
    if (!user) return;
    setSavingVideo(generationId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error(t('aiVid.notAuthenticated'));

      const response = await supabase.functions.invoke('save-ai-video-to-library', {
        body: { generation_id: generationId },
      });

      if (response.error) {
        let errorMsg = t('aiVid.saveError');
        try {
          if ('context' in response.error && response.error.context) {
            const payload = await (response.error.context as Response).json();
            errorMsg = payload?.error || payload?.message || response.error.message;
          } else {
            errorMsg = response.error.message;
          }
        } catch {
          errorMsg = response.error.message || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const result = response.data;
      if (result && !result.ok) throw new Error(result.error || t('aiVid.saveError'));

      sonnerToast.success(t('aiVid.savedToLibraryToast'));
      queryClient.invalidateQueries({ queryKey: ['saved-generation-ids', user?.id] });
    } catch (error: any) {
      console.error('Save to library error:', error);
      const errorMsg = error?.message || '';
      if (errorMsg.includes('nicht mehr verfügbar') || errorMsg.includes('abgelaufen') || errorMsg.includes('not reachable') || errorMsg.includes('expired')) {
        sonnerToast.error(t('aiVid.videoExpired'), { description: t('aiVid.videoExpiredDesc') });
      } else {
        sonnerToast.error(t('aiVid.saveFailed'), { description: errorMsg || t('aiVid.saveFailedDesc') });
      }
    } finally {
      setSavingVideo(null);
    }
  };

  const isVideoSaved = (generationId: string): boolean => savedGenerationIds?.has(generationId) ?? false;

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
        <p className="text-muted-foreground mb-4">{t('aiVid.noVideosYet')}</p>
        <p className="text-sm text-muted-foreground">{t('aiVid.createFirstVideo')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">{t('aiVid.yourVideos')} ({generations.length})</h3>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {t('aiVid.refresh')}
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-4 mb-4">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">{t('aiVid.historyInfoTitle')}</h4>
            <p className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
              <span className="block">{t('aiVid.historyInfoText')}</span>
              <span className="block mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                <strong>{t('aiVid.historyInfoBeta')}</strong>
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 w-full">
        {generations.map((gen) => (
          <Card key={gen.id} className="p-4 w-full overflow-hidden">
            <div className="flex gap-4 w-full overflow-hidden">
              <div className="flex-shrink-0 w-48 h-32 bg-muted rounded-lg overflow-hidden relative">
                {gen.video_url && gen.status === 'completed' ? (
                  <>
                    {selectedVideo === gen.id ? (
                      <video src={gen.video_url} controls autoPlay className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full cursor-pointer flex items-center justify-center bg-black/50" onClick={() => setSelectedVideo(gen.id)}>
                        <Play className="w-12 h-12 text-white" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {gen.status === 'processing' && <Loader2 className="w-8 h-8 animate-spin text-primary" />}
                    {gen.status === 'pending' && <div className="text-sm text-muted-foreground">{t('aiVid.waiting')}</div>}
                    {gen.status === 'failed' && <div className="text-sm text-destructive">{t('aiVid.failed')}</div>}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium line-clamp-2 break-words mb-1">{gen.prompt}</h4>
                    <p className="text-sm text-muted-foreground">
                      {gen.model === 'sora-2-pro' ? 'Sora 2 Pro' : 'Sora 2 Standard'}
                      {' · '}{gen.duration_seconds}s{' · '}{formatPrice(gen.total_cost_euros, currency)}
                    </p>
                  </div>
                  {getStatusBadge(gen.status)}
                </div>

                <p className="text-xs text-muted-foreground mb-3">
                  {formatDistanceToNow(new Date(gen.created_at), { addSuffix: true, locale: dateLocale })}
                </p>

                {gen.error_message && (
                  <div className="mb-3">
                    <p className="text-sm text-destructive">{getFriendlyErrorMessage(gen.error_message)}</p>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap w-full">
                  {gen.status === 'completed' && gen.video_url && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setSelectedVideo(gen.id)}>
                        <Play className="w-4 h-4 mr-2" />{t('aiVid.play')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDownload(gen.video_url!, gen.prompt)}>
                        <Download className="w-4 h-4 mr-2" />{t('aiVid.download')}
                      </Button>
                      {isVideoSaved(gen.id) ? (
                        <span className="inline-flex items-center text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />{t('aiVid.savedToLibrary')}
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleSaveToLibrary(gen.id)} disabled={savingVideo === gen.id}>
                          {savingVideo === gen.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Library className="w-4 h-4 mr-2" />}
                          {t('aiVid.saveToLibrary')}
                        </Button>
                      )}
                    </>
                  )}
                  {(gen.status === 'processing' || gen.status === 'pending') && (
                    <div className="flex items-center gap-3">
                      <Button size="sm" variant="ghost" disabled>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('aiVid.generationRunning')}
                      </Button>
                      <span className="text-xs text-muted-foreground animate-pulse">{t('aiVid.bgRunning')}</span>
                    </div>
                  )}
                  {gen.status === 'failed' && onRetryGeneration && (
                    <Button size="sm" variant="outline" onClick={() => handleRetry(gen)} className="border-primary text-primary hover:bg-primary/10">
                      <RotateCcw className="w-4 h-4 mr-2" />{t('aiVid.retryGenerate')}
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
