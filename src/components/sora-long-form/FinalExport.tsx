import { useState } from 'react';
import { Download, Loader2, Play, ArrowLeft, CheckCircle, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const totalCost = scenes.reduce((sum, s) => sum + s.cost_euros, 0);

  const startFinalRender = async () => {
    setRendering(true);
    setProgress(10);

    try {
      await onUpdateProject({ status: 'rendering' });

      const { data, error } = await supabase.functions.invoke('render-long-form-video', {
        body: {
          projectId: project.id,
        },
      });

      if (error) throw error;

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
    } catch (error) {
      console.error('Render error:', error);
      toast({
        title: 'Rendering fehlgeschlagen',
        description: 'Bitte versuche es erneut',
        variant: 'destructive',
      });
      await onUpdateProject({ status: 'failed' });
    } finally {
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
              {rendering ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rendering... {progress}%
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Video rendern
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Back Button */}
      <div className="flex justify-start">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück zu Übergängen
        </Button>
      </div>
    </div>
  );
}
