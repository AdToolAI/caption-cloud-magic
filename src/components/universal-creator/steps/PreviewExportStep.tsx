import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Download, Video, Sparkles, Coins, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { FormatConfig, ContentConfig, SubtitleConfig } from '@/types/universal-creator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useCreditReservation } from '@/hooks/useCreditReservation';
import { useCredits } from '@/hooks/useCredits';
import { FEATURE_COSTS, ESTIMATED_COSTS } from '@/lib/featureCosts';
import { mapBackgroundAssetToUniversalVideo } from '@/lib/background-asset-mapper';

interface PreviewExportStepProps {
  formatConfig: FormatConfig;
  contentConfig: ContentConfig;
  subtitleConfig?: SubtitleConfig;
  backgroundAsset?: any;
  projectId: string;
  scenes?: any[];
  selectedMusicUrl?: string | null;
  musicVolume?: number;
}

interface RenderJob {
  id: string;
  format: FormatConfig;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  progress: number;
  downloadUrl?: string;
  error?: string;
  renderId?: string; // For realtime tracking
}

export function PreviewExportStep({
  formatConfig,
  contentConfig,
  subtitleConfig,
  backgroundAsset,
  projectId,
  scenes = [],
  selectedMusicUrl = null,
  musicVolume = 0.3,
}: PreviewExportStepProps) {
  const [isRendering, setIsRendering] = useState(false);
  const [renderJobs, setRenderJobs] = useState<RenderJob[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<FormatConfig[]>([formatConfig]);
  const [reservationId, setReservationId] = useState<string | null>(null);
  
  const { balance } = useCredits();
  const { reserve, commit, refund } = useCreditReservation();
  
  const totalCost = selectedFormats.length * ESTIMATED_COSTS.video_render;

  // Extract active render IDs to prevent infinite loop
  const activeRenderIds = useMemo(
    () => renderJobs
      .filter(j => j.status === 'rendering' && j.renderId)
      .map(j => j.renderId!),
    [renderJobs]
  );

  // Realtime subscription for render updates with aggressive fallback polling
  useEffect(() => {
    if (activeRenderIds.length === 0) return;

    console.log('🎬 Setting up realtime subscription for render IDs:', activeRenderIds);

    const channel = supabase
      .channel('render-progress')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_renders',
        },
        async (payload) => {
          console.log('📡 Realtime update received:', payload);
          const newData = payload.new as any;
          
          setRenderJobs(prev => {
            const updated = prev.map(j => {
              if (j.renderId !== newData.render_id) return j;
              
              console.log(`🎥 Updating job ${j.id} with status: ${newData.status}`);
              
              if (newData.status === 'completed') {
                toast.success(`Video für ${j.format.platform} fertig gerendert!`);
                return { 
                  ...j, 
                  status: 'completed' as const, 
                  progress: 100, 
                  downloadUrl: newData.video_url 
                };
              } else if (newData.status === 'failed') {
                toast.error(`Render für ${j.format.platform} fehlgeschlagen`);
                return { 
                  ...j, 
                  status: 'failed' as const, 
                  error: newData.error_message || 'Rendering fehlgeschlagen' 
                };
              }
              return j;
            });

            // Check if all jobs are done (completed or failed)
            const allDone = updated.every(j => j.status === 'completed' || j.status === 'failed');
            if (allDone && reservationId) {
              const successCount = updated.filter(j => j.status === 'completed').length;
              const failedCount = updated.filter(j => j.status === 'failed').length;

              if (successCount > 0) {
                // Commit credits for successful renders
                const actualCost = successCount * ESTIMATED_COSTS.video_render;
                commit(reservationId, actualCost).catch(console.error);
                toast.success(`${successCount} Video(s) erfolgreich gerendert! ${actualCost} Credits verwendet.`);
              } else {
                // Refund if all failed
                refund(reservationId, "Alle Renders fehlgeschlagen").catch(console.error);
                toast.error('Alle Renders fehlgeschlagen. Credits wurden zurückerstattet.');
              }
              
              setReservationId(null);
              setIsRendering(false);
            }

            return updated;
          });
        }
      )
      .subscribe();

    // Aggressive fallback polling - check status directly via Lambda every 30 seconds
    const checkRenderStatus = async (renderId: string) => {
      try {
        console.log('⏰ Direct Lambda polling for render:', renderId);
        
        // Call edge function to check progress directly from Lambda
        const { data, error } = await supabase.functions.invoke('check-remotion-progress', {
          body: {
            render_id: renderId
          }
        });

        if (error) {
          console.error('Error checking progress:', error);
          return;
        }

        console.log('📊 Direct progress result:', data);

        if (data?.progress) {
          const { done, fatalErrorEncountered, outputFile, errors } = data.progress;
          
          if (done && outputFile) {
            toast.success('Video fertig gerendert!');
            setRenderJobs(prev => prev.map(j =>
              j.renderId === renderId
                ? { ...j, status: 'completed' as const, progress: 100, downloadUrl: outputFile }
                : j
            ));
          } else if (fatalErrorEncountered) {
            const errorMsg = errors?.join(', ') || 'Rendering fehlgeschlagen';
            toast.error('Render fehlgeschlagen');
            setRenderJobs(prev => prev.map(j =>
              j.renderId === renderId
                ? { ...j, status: 'failed' as const, error: errorMsg }
                : j
            ));
          }
        }
      } catch (error) {
        console.error('Error checking render status:', error);
      }
    };

    // Poll every 30 seconds for all active renders
    const pollIntervalId = setInterval(() => {
      console.log('🔄 Polling for render updates...');
      activeRenderIds.forEach(renderId => checkRenderStatus(renderId));
    }, 30000); // Check every 30 seconds

    return () => {
      console.log('🧹 Cleaning up realtime subscription and polling');
      supabase.removeChannel(channel);
      clearInterval(pollIntervalId);
    };
  }, [activeRenderIds.join(','), renderJobs, reservationId]);

  // Additional format options for multi-format export
  const formatOptions: FormatConfig[] = [
    formatConfig, // Original selected format
    { ...formatConfig, platform: 'instagram', aspectRatio: '9:16', width: 1080, height: 1920, fps: formatConfig.fps },
    { ...formatConfig, platform: 'youtube', aspectRatio: '16:9', width: 1920, height: 1080, fps: formatConfig.fps },
    { ...formatConfig, platform: 'tiktok', aspectRatio: '9:16', width: 1080, height: 1920, fps: formatConfig.fps },
    { ...formatConfig, platform: 'facebook', aspectRatio: '1:1', width: 1080, height: 1080, fps: formatConfig.fps },
  ];

  const handleFormatToggle = (format: FormatConfig) => {
    setSelectedFormats(prev => {
      const exists = prev.some(f => 
        f.platform === format.platform && f.aspectRatio === format.aspectRatio
      );
      if (exists) {
        return prev.filter(f => 
          !(f.platform === format.platform && f.aspectRatio === format.aspectRatio)
        );
      } else {
        return [...prev, format];
      }
    });
  };

  const isFormatSelected = (format: FormatConfig) => {
    return selectedFormats.some(f => 
      f.platform === format.platform && f.aspectRatio === format.aspectRatio
    );
  };

  const handleRenderVideo = async () => {
    if (selectedFormats.length === 0) {
      toast.error('Bitte wähle mindestens ein Format aus');
      return;
    }

    // Check credits and reserve
    try {
      const reservation = await reserve(
        FEATURE_COSTS.VIDEO_RENDER,
        totalCost,
        {
          project_id: projectId,
          format_count: selectedFormats.length,
          formats: selectedFormats.map(f => `${f.platform}-${f.aspectRatio}`),
        }
      );
      setReservationId(reservation.reservation_id); // Store for later commit/refund
    } catch (error) {
      // Reserve hook already shows error toast
      return;
    }

    setIsRendering(true);
    const jobs: RenderJob[] = selectedFormats.map(format => ({
      id: crypto.randomUUID(),
      format,
      status: 'pending' as const,
      progress: 0,
    }));
    setRenderJobs(jobs);

    try {
      // Render each format sequentially
      for (const job of jobs) {
        setRenderJobs(prev =>
          prev.map(j =>
            j.id === job.id ? { ...j, status: 'rendering', progress: 10 } : j
          )
        );

        try {
          // Calculate duration from voiceover or scenes
          const calculatedDuration = contentConfig.voiceoverDuration || 
            (scenes.length > 0 ? scenes.reduce((sum, s) => sum + s.duration, 0) : 30);

          // Call render-with-remotion edge function (AWS Lambda)
          const { data, error } = await supabase.functions.invoke('render-with-remotion', {
            body: {
              project_id: projectId,
              component_name: 'UniversalVideo',
              customizations: {
                voiceoverUrl: contentConfig.voiceoverUrl || '',
                voiceoverDuration: calculatedDuration,
                backgroundMusicUrl: selectedMusicUrl || '',
                backgroundMusicVolume: musicVolume,
                subtitles: subtitleConfig?.segments || [],
                subtitleStyle: subtitleConfig?.style || {
                  position: 'bottom',
                  font: 'Inter',
                  fontSize: 48,
                  color: '#FFFFFF',
                  backgroundColor: '#000000',
                  backgroundOpacity: 0.7,
                  animation: 'fade',
                  animationSpeed: 1,
                  outlineStyle: 'stroke',
                  outlineColor: '#000000',
                  outlineWidth: 2,
                },
                background: backgroundAsset ? {
                  type: backgroundAsset.type || 'video',
                  videoUrl: backgroundAsset.type === 'video' ? backgroundAsset.url || backgroundAsset.original_url : undefined,
                  imageUrl: backgroundAsset.type === 'image' ? backgroundAsset.url || backgroundAsset.original_url : undefined,
                  color: backgroundAsset.type === 'color' ? backgroundAsset.color : undefined,
                } : undefined,
              },
              format: 'mp4',
              aspect_ratio: job.format.aspectRatio,
            },
          });

          if (error) {
            throw error;
          }

          // New webhook-based architecture: receive render_id, not output_url
          if (!data?.render_id) {
            throw new Error('Render-ID nicht erhalten');
          }

          console.log('🎬 Render started with ID:', data.render_id);

          // Update job with render_id and status 'rendering'
          // Realtime subscription will update to 'completed' when webhook fires
          setRenderJobs(prev =>
            prev.map(j =>
              j.id === job.id
                ? {
                    ...j,
                    status: 'rendering',
                    progress: 20,
                    renderId: data.render_id,
                  }
                : j
            )
          );

          toast.success(`Rendering für ${job.format.platform} gestartet. Dies dauert 2-5 Minuten...`);

        } catch (error: any) {
          console.error('Error rendering format:', error);
          setRenderJobs(prev =>
            prev.map(j =>
              j.id === job.id
                ? {
                    ...j,
                    status: 'failed',
                    error: error.message,
                  }
                : j
            )
          );
          toast.error(`Fehler bei ${job.format.platform}: ${error.message}`);
        }
      }

      // Credit commit/refund logic moved to Realtime handler
      // Renders are now async and Realtime will notify us when they complete

    } catch (error: any) {
      console.error('Error rendering videos:', error);
      toast.error(`Fehler: ${error.message}`);
      
      // Refund on error if reservation exists
      if (reservationId) {
        await refund(reservationId, `Error: ${error.message}`);
        setReservationId(null);
      }
      setIsRendering(false);
    }
  };

  const handleDownload = (url: string, platform: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectId}-${platform}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatLabel = (format: FormatConfig) => {
    return `${format.platform.charAt(0).toUpperCase() + format.platform.slice(1)} (${format.aspectRatio})`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Vorschau & Export</h2>
        <p className="text-muted-foreground">
          Rendere dein Video in mehreren Formaten für verschiedene Plattformen
        </p>
      </div>

      {/* Format Selection */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Export-Formate auswählen</h3>
        <div className="space-y-3">
          {formatOptions.map((format, index) => (
            <div key={index} className="flex items-center space-x-3">
              <Checkbox
                id={`format-${index}`}
                checked={isFormatSelected(format)}
                onCheckedChange={() => handleFormatToggle(format)}
              />
              <Label 
                htmlFor={`format-${index}`}
                className="flex-1 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span>{formatLabel(format)}</span>
                  <span className="text-sm text-muted-foreground">
                    {format.width}x{format.height} • {format.fps}fps
                  </span>
                </div>
              </Label>
            </div>
          ))}
        </div>
      </Card>

      {/* Preview */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Vorschau</h3>
        <div 
          className="bg-muted rounded-lg overflow-hidden"
          style={{
            aspectRatio: formatConfig.aspectRatio === '16:9' ? '16/9' :
                       formatConfig.aspectRatio === '9:16' ? '9/16' :
                       formatConfig.aspectRatio === '1:1' ? '1/1' :
                       formatConfig.aspectRatio === '4:5' ? '4/5' :
                       formatConfig.aspectRatio === '4:3' ? '4/3' : '16/9',
            maxHeight: '500px',
          }}
        >
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <div className="text-center space-y-4 p-8">
              <Video className="h-16 w-16 mx-auto text-muted-foreground" />
              <div>
                <p className="font-medium">Video-Vorschau</p>
                <p className="text-sm text-muted-foreground">
                  {formatConfig.width}x{formatConfig.height} • {contentConfig.voiceoverDuration || (scenes.length > 0 ? scenes.reduce((sum, s) => sum + s.duration, 0) : 0).toFixed(0)}s
                </p>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>✓ Voice-over: {contentConfig.voiceoverConfig?.voiceName}</p>
                <p>✓ Untertitel: {subtitleConfig.segments.length} Segmente</p>
                <p>✓ Style: {subtitleConfig.style.font}, {subtitleConfig.style.fontSize}px</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Credit Balance & Render Button */}
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Deine Credits</p>
              <p className="text-2xl font-bold">{balance?.balance || 0}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Kosten für Render</p>
            <p className="text-xl font-semibold text-primary">{totalCost} Credits</p>
            <p className="text-xs text-muted-foreground">
              ({ESTIMATED_COSTS.video_render} pro Format)
            </p>
          </div>
        </div>
        
        {balance && balance.balance < totalCost && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive font-medium">
              ⚠️ Nicht genügend Credits verfügbar
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Du benötigst {totalCost - balance.balance} weitere Credits
            </p>
          </div>
        )}
      </Card>

      <div className="flex gap-3">
        <Button
          onClick={handleRenderVideo}
          disabled={isRendering || selectedFormats.length === 0 || (balance && balance.balance < totalCost)}
          size="lg"
          className="flex-1"
        >
          {isRendering ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Rendere {renderJobs.length} Format(e)...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {selectedFormats.length} Format(e) rendern
            </>
          )}
        </Button>
      </div>

      {/* Render Progress */}
      {renderJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Render-Status</h3>
          {renderJobs.map((job, index) => (
            <Card key={index} className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{formatLabel(job.format)}</span>
                  <span className={`text-sm ${
                    job.status === 'completed' ? 'text-green-500' :
                    job.status === 'failed' ? 'text-red-500' :
                    job.status === 'rendering' ? 'text-blue-500' :
                    'text-muted-foreground'
                  }`}>
                    {job.status === 'pending' && 'Ausstehend...'}
                    {job.status === 'rendering' && 'Wird gerendert...'}
                    {job.status === 'completed' && '✓ Abgeschlossen'}
                    {job.status === 'failed' && '✗ Fehlgeschlagen'}
                  </span>
                </div>

                {job.status === 'rendering' && (
                  <div className="space-y-2">
                    <Progress value={job.progress} className="w-full" />
                    <p className="text-xs text-muted-foreground">
                      Rendering läuft... Dies kann 2-5 Minuten dauern. Status wird automatisch aktualisiert.
                    </p>
                  </div>
                )}

                {job.status === 'completed' && job.downloadUrl && (
                  <div className="space-y-2">
                    <Button
                      onClick={() => handleDownload(job.downloadUrl!, job.format.platform)}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        onClick={() => window.location.href = `/ai-post-generator?video_url=${encodeURIComponent(job.downloadUrl!)}`}
                        variant="secondary"
                        size="sm"
                        className="w-full"
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        An KI-Post
                      </Button>
                      
                      <Button
                        onClick={() => window.location.href = `/directors-cut?source_video=${encodeURIComponent(job.downloadUrl!)}&project_id=${projectId}`}
                        variant="secondary"
                        size="sm"
                        className="w-full"
                      >
                        <Video className="mr-2 h-4 w-4" />
                        An Director's Cut
                      </Button>

                      <Button
                        onClick={() => window.location.href = `/media-library?tab=rendered`}
                        variant="secondary"
                        size="sm"
                        className="w-full"
                      >
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Zur Mediathek
                      </Button>
                    </div>
                  </div>
                )}

                {job.status === 'failed' && job.error && (
                  <p className="text-sm text-red-500">{job.error}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Export Summary */}
      <Card className="p-6 bg-muted/50">
        <h3 className="text-lg font-semibold mb-3">Export-Zusammenfassung</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Script-Länge:</span>
            <span className="font-medium">
              {contentConfig.scriptText.split(/\s+/).filter(Boolean).length} Wörter
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Voice-over Dauer:</span>
            <span className="font-medium">
              {contentConfig.voiceoverDuration?.toFixed(1)}s
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Untertitel-Segmente:</span>
            <span className="font-medium">{subtitleConfig.segments.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ausgewählte Formate:</span>
            <span className="font-medium">{selectedFormats.length}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
