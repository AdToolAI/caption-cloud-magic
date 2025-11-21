import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Download, Video, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { FormatConfig, ContentConfig, SubtitleConfig } from '@/types/universal-creator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';

interface PreviewExportStepProps {
  formatConfig: FormatConfig;
  contentConfig: ContentConfig;
  subtitleConfig: SubtitleConfig;
  projectId: string;
}

interface RenderJob {
  id: string;
  format: FormatConfig;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  downloadUrl?: string;
  error?: string;
}

export function PreviewExportStep({
  formatConfig,
  contentConfig,
  subtitleConfig,
  projectId,
}: PreviewExportStepProps) {
  const [isRendering, setIsRendering] = useState(false);
  const [renderJobs, setRenderJobs] = useState<RenderJob[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<FormatConfig[]>([formatConfig]);

  // Additional format options for multi-format export
  const formatOptions: FormatConfig[] = [
    formatConfig, // Original selected format
    { ...formatConfig, platform: 'instagram', aspectRatio: '9:16', width: 1080, height: 1920, duration: formatConfig.duration, fps: formatConfig.fps },
    { ...formatConfig, platform: 'youtube', aspectRatio: '16:9', width: 1920, height: 1080, duration: formatConfig.duration, fps: formatConfig.fps },
    { ...formatConfig, platform: 'tiktok', aspectRatio: '9:16', width: 1080, height: 1920, duration: formatConfig.duration, fps: formatConfig.fps },
    { ...formatConfig, platform: 'facebook', aspectRatio: '1:1', width: 1080, height: 1080, duration: formatConfig.duration, fps: formatConfig.fps },
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
            j.id === job.id ? { ...j, status: 'processing', progress: 10 } : j
          )
        );

        try {
          // Call render-with-remotion edge function
          const { data, error } = await supabase.functions.invoke('render-with-remotion', {
            body: {
              project_id: projectId,
              component_name: 'UniversalVideo',
              customizations: {
                voiceoverUrl: contentConfig.voiceoverUrl || '',
                voiceoverDuration: contentConfig.voiceoverDuration || 30,
                subtitles: subtitleConfig?.segments || [],
                subtitleStyle: subtitleConfig?.style || {
                  position: 'bottom',
                  font: 'Arial',
                  fontSize: 48,
                  color: '#FFFFFF',
                  backgroundColor: '#000000',
                  backgroundOpacity: 0.7,
                  animation: 'none',
                  outlineStyle: 'none',
                  outlineColor: '#000000',
                  outlineWidth: 2,
                },
                background: {
                  type: 'color',
                  color: '#000000',
                },
              },
              format: 'mp4',
              aspect_ratio: job.format.aspectRatio,
            },
          });

          if (error) {
            throw error;
          }

          if (!data.ok) {
            throw new Error(data.error || 'Rendering failed');
          }

          // Update job with completed status
          setRenderJobs(prev =>
            prev.map(j =>
              j.id === job.id
                ? {
                    ...j,
                    status: 'completed',
                    progress: 100,
                    downloadUrl: data.output_url,
                  }
                : j
            )
          );

          toast.success(`Video für ${job.format.platform} erfolgreich gerendert!`);

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

      const successCount = renderJobs.filter(j => j.status === 'completed').length;
      if (successCount > 0) {
        toast.success(`${successCount} Video(s) erfolgreich gerendert!`);
      }

    } catch (error: any) {
      console.error('Error rendering videos:', error);
      toast.error(`Fehler: ${error.message}`);
    } finally {
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
                  {formatConfig.width}x{formatConfig.height} • {formatConfig.duration}s
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

      {/* Render Button */}
      <div className="flex gap-3">
        <Button
          onClick={handleRenderVideo}
          disabled={isRendering || selectedFormats.length === 0}
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
                    job.status === 'processing' ? 'text-blue-500' :
                    'text-muted-foreground'
                  }`}>
                    {job.status === 'pending' && 'Ausstehend...'}
                    {job.status === 'processing' && 'Rendere...'}
                    {job.status === 'completed' && '✓ Abgeschlossen'}
                    {job.status === 'failed' && '✗ Fehlgeschlagen'}
                  </span>
                </div>

                {job.status === 'processing' && (
                  <Progress value={job.progress} className="w-full" />
                )}

                {job.status === 'completed' && job.downloadUrl && (
                  <Button
                    onClick={() => handleDownload(job.downloadUrl!, job.format.platform)}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
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
