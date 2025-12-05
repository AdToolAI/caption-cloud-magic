import { useState, useEffect, useRef } from 'react';
import { Download, Loader2, Play, ArrowLeft, CheckCircle, ExternalLink, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import type { Sora2LongFormProject, Sora2Scene } from '@/types/sora-long-form';

interface FinalExportProps {
  project: Sora2LongFormProject;
  scenes: Sora2Scene[];
  onUpdateProject: (updates: Partial<Sora2LongFormProject>) => Promise<void>;
  onBack: () => void;
}

export function FinalExport({
  project,
  scenes,
  onUpdateProject,
  onBack,
}: FinalExportProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderStatus, setRenderStatus] = useState<string | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [bucketName, setBucketName] = useState<string | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const totalCost = scenes.reduce((sum, s) => sum + s.cost_euros, 0);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Poll for render completion
  const pollRenderStatus = async (renderIdToPoll: string, bucket: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('check-remotion-progress', {
        body: {
          renderId: renderIdToPoll,
          bucketName: bucket,
          source: 'sora-long-form',
        },
      });

      if (error) {
        console.error('Poll error:', error);
        return;
      }

      console.log('[Long-Form] Poll result:', data);

      if (data.done) {
        // Render complete!
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        if (data.outputFile) {
          setProgress(100);
          setRenderStatus('completed');
          
          await onUpdateProject({
            status: 'completed',
            final_video_url: data.outputFile,
            total_cost_euros: totalCost,
          });

          // Save to media library
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('video_creations').insert({
              user_id: user.id,
              output_url: data.outputFile,
              status: 'completed',
              metadata: {
                source: 'sora-long-form',
                project_id: project.id,
                scene_count: scenes.length,
                total_duration: totalDuration,
                aspect_ratio: project.aspect_ratio,
                model: project.model,
              },
            });
          }

          toast({
            title: 'Video erfolgreich gerendert!',
            description: `Dein ${totalDuration}-Sekunden Long-Form Video ist bereit`,
          });

          setRendering(false);
        } else if (data.fatalErrorEncountered) {
          throw new Error(data.errors?.[0]?.message || 'Render failed');
        }
      } else {
        // Update progress
        const overallProgress = data.overallProgress || 0;
        setProgress(Math.round(overallProgress * 100));
        setRenderStatus(`Rendering... ${Math.round(overallProgress * 100)}%`);
      }
    } catch (error) {
      console.error('Poll error:', error);
    }
  };

  const startFinalRender = async () => {
    setRendering(true);
    setProgress(5);
    setRenderStatus('Initialisiere Rendering...');

    // Estimate time: ~5 minutes + 10s per scene
    const estimatedMinutes = Math.ceil(5 + (scenes.length * 10) / 60);
    setEstimatedTime(estimatedMinutes);

    try {
      await onUpdateProject({ status: 'rendering' });

      const { data, error } = await supabase.functions.invoke('render-long-form-video', {
        body: {
          projectId: project.id,
        },
      });

      if (error) throw error;

      console.log('[Long-Form] Render initiated:', data);

      if (data.status === 'rendering' && data.renderId) {
        // Start polling for completion
        setRenderId(data.renderId);
        setBucketName(data.bucketName);
        setProgress(10);
        setRenderStatus('Szenen werden kombiniert...');

        // Initial delay before first poll
        setTimeout(() => {
          // Poll every 30 seconds
          pollingRef.current = setInterval(() => {
            pollRenderStatus(data.renderId, data.bucketName);
          }, 30000);

          // First poll after 30 seconds
          setTimeout(() => {
            pollRenderStatus(data.renderId, data.bucketName);
          }, 30000);
        }, 10000);

      } else if (data.videoUrl) {
        // Immediate completion (shouldn't happen with Remotion Lambda)
        setProgress(100);
        await onUpdateProject({
          status: 'completed',
          final_video_url: data.videoUrl,
          total_cost_euros: totalCost,
        });

        toast({
          title: 'Video erfolgreich gerendert!',
          description: 'Dein Long-Form Video ist bereit zum Download',
        });
        setRendering(false);
      }
    } catch (error) {
      console.error('Render error:', error);
      toast({
        title: 'Rendering fehlgeschlagen',
        description: error instanceof Error ? error.message : 'Bitte versuche es erneut',
        variant: 'destructive',
      });
      await onUpdateProject({ status: 'failed' });
      setRendering(false);
    }
  };

  const downloadVideo = () => {
    if (project.final_video_url) {
      window.open(project.final_video_url, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold">Finaler Export</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Kombiniere alle Szenen zu einem nahtlosen Video
        </p>
      </div>

      {/* Preview Grid */}
      <div className="grid grid-cols-5 gap-2">
        {scenes.map((scene, index) => (
          <div key={scene.id} className="relative">
            <div className="aspect-video rounded-lg overflow-hidden bg-muted">
              {scene.generated_video_url ? (
                <video
                  src={scene.generated_video_url}
                  className="w-full h-full object-cover"
                  muted
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm">
                  {index + 1}
                </div>
              )}
            </div>
            <Badge
              variant="outline"
              className="absolute bottom-1 left-1 text-[10px] px-1"
            >
              {scene.duration}s
            </Badge>
          </div>
        ))}
      </div>

      {/* Summary */}
      <Card className="p-6">
        <h4 className="font-semibold mb-4">Zusammenfassung</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Gesamtdauer</p>
            <p className="text-xl font-bold">{totalDuration} Sek.</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Szenen</p>
            <p className="text-xl font-bold">{scenes.length}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Format</p>
            <p className="text-xl font-bold">{project.aspect_ratio}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Gesamtkosten</p>
            <p className="text-xl font-bold text-primary">{totalCost.toFixed(2)}€</p>
          </div>
        </div>
      </Card>

      {/* Status & Actions */}
      {project.status === 'completed' && project.final_video_url ? (
        <Card className="p-6 border-green-500/50 bg-green-500/5">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-green-600">Video erfolgreich erstellt!</h4>
              <p className="text-sm text-muted-foreground">
                Dein {totalDuration}-Sekunden Long-Form Video ist bereit
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={downloadVideo}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button onClick={() => navigate('/media-library?tab=rendered')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Zur Mediathek
              </Button>
            </div>
          </div>

          {/* Video Preview */}
          <div className="mt-6">
            <video
              src={project.final_video_url}
              controls
              className="w-full rounded-lg"
            />
          </div>
        </Card>
      ) : rendering ? (
        <Card className="p-6 border-cyan-500/50 bg-cyan-500/5">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-cyan-500 animate-spin" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-cyan-600">Rendering läuft...</h4>
                <p className="text-sm text-muted-foreground">
                  {renderStatus || `${scenes.length} Szenen werden mit Übergängen kombiniert`}
                </p>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-sm">~{estimatedTime} Min.</span>
              </div>
            </div>

            <Progress value={progress} className="h-2" />

            <p className="text-xs text-muted-foreground text-center">
              Das Rendering kann {estimatedTime}-{estimatedTime + 5} Minuten dauern. 
              Du kannst diese Seite verlassen - das Video erscheint in deiner Mediathek.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">Bereit zum Rendern</h4>
              <p className="text-sm text-muted-foreground">
                {scenes.length} Szenen werden mit Übergängen kombiniert
              </p>
            </div>
            <Button
              size="lg"
              onClick={startFinalRender}
              disabled={rendering}
            >
              <Play className="h-4 w-4 mr-2" />
              Video rendern
            </Button>
          </div>
        </Card>
      )}

      {/* Back Button */}
      <div className="flex justify-start">
        <Button variant="outline" onClick={onBack} disabled={rendering}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück zu Übergängen
        </Button>
      </div>
    </div>
  );
}
