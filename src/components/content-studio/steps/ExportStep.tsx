import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RenderingProgress } from '../RenderingProgress';
import { Play } from 'lucide-react';
import type { ContentTemplate } from '@/types/content-studio';

interface ExportStepProps {
  selectedTemplate: ContentTemplate | null;
  customizations: Record<string, any>;
  projectId: string | null;
  onProjectIdChange: (id: string) => void;
}

export const ExportStep = ({ 
  selectedTemplate, 
  customizations, 
  projectId, 
  onProjectIdChange 
}: ExportStepProps) => {
  const [projectName, setProjectName] = useState(customizations.PROJECT_NAME || 'Mein Video');
  const [isRendering, setIsRendering] = useState(false);
  const [renderId, setRenderId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleStartRendering = async () => {
    if (!selectedTemplate) return;

    setIsRendering(true);
    try {
      // 1. Create content_project
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data: project, error: projectError } = await supabase
        .from('content_projects')
        .insert({
          user_id: user.user.id,
          template_id: selectedTemplate.id,
          content_type: selectedTemplate.content_type,
          project_name: projectName,
          customizations,
          status: 'rendering'
        })
        .select()
        .single();

      if (projectError) throw projectError;
      onProjectIdChange(project.id);

      // 2. Start Rendering via Edge Function
      const { data: renderResult, error: renderError } = await supabase.functions.invoke(
        'create-video-from-template',
        {
          body: {
            template_id: selectedTemplate.id,
            customizations: {
              ...customizations,
              PROJECT_NAME: projectName
            }
          }
        }
      );

      if (renderError) throw renderError;
      if (!renderResult.ok) {
        if (renderResult.error === 'INSUFFICIENT_CREDITS') {
          toast({
            title: 'Nicht genügend Credits',
            description: renderResult.message,
            variant: 'destructive'
          });
          return;
        }
        throw new Error(renderResult.error);
      }

      // 3. Update project with render_id
      await supabase
        .from('content_projects')
        .update({ 
          render_id: renderResult.render_id
        })
        .eq('id', project.id);

      setRenderId(renderResult.render_id);

      toast({
        title: 'Rendering gestartet',
        description: 'Dein Video wird erstellt. Das dauert 2-5 Minuten.'
      });

    } catch (error) {
      console.error('Rendering error:', error);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Video konnte nicht gerendert werden',
        variant: 'destructive'
      });
    } finally {
      setIsRendering(false);
    }
  };

  if (renderId) {
    return <RenderingProgress renderId={renderId} projectId={projectId!} />;
  }

  if (!selectedTemplate) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">Bitte wähle zuerst ein Template</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Video erstellen</h2>
        <p className="text-muted-foreground">
          Gib deinem Projekt einen Namen und starte das Rendering
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="projectName">Projekt-Name</Label>
          <Input
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="z.B. Sommer-Sale Video"
          />
        </div>

        <div className="border-t pt-6">
          <h3 className="font-semibold mb-4">Zusammenfassung</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Template:</span>
              <span className="font-medium">{selectedTemplate.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Format:</span>
              <span className="font-medium">{selectedTemplate.aspect_ratio}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dauer:</span>
              <span className="font-medium">
                {selectedTemplate.duration_min}-{selectedTemplate.duration_max}s
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Credits:</span>
              <span className="font-medium">1 Credit</span>
            </div>
          </div>
        </div>

        <Button 
          className="w-full" 
          size="lg"
          onClick={handleStartRendering}
          disabled={isRendering || !projectName}
        >
          <Play className="mr-2 h-5 w-5" />
          {isRendering ? 'Wird gestartet...' : 'Video erstellen'}
        </Button>
      </Card>
    </div>
  );
};
