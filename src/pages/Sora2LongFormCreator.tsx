import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Film, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LongFormWizard } from '@/components/sora-long-form/LongFormWizard';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Sora2LongFormProject, Sora2Scene } from '@/types/sora-long-form';

export default function Sora2LongFormCreator() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<Sora2LongFormProject | null>(null);
  const [scenes, setScenes] = useState<Sora2Scene[]>([]);
  const [loading, setLoading] = useState(false);

  // Create new project on mount
  useEffect(() => {
    createNewProject();
  }, []);

  const createNewProject = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Nicht angemeldet', variant: 'destructive' });
        navigate('/auth');
        return;
      }

      const { data, error } = await supabase
        .from('sora_long_form_projects')
        .insert({
          user_id: user.id,
          name: 'Neues Long-Form Video',
          target_duration: 30,
          aspect_ratio: '16:9',
          model: 'sora-2-standard',
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;

      setProject(data as Sora2LongFormProject);
    } catch (error) {
      console.error('Error creating project:', error);
      toast({
        title: 'Fehler',
        description: 'Projekt konnte nicht erstellt werden',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateProject = async (updates: Partial<Sora2LongFormProject>) => {
    if (!project) return;

    try {
      const { error } = await supabase
        .from('sora_long_form_projects')
        .update(updates)
        .eq('id', project.id);

      if (error) throw error;

      setProject({ ...project, ...updates });
    } catch (error) {
      console.error('Error updating project:', error);
      toast({
        title: 'Fehler',
        description: 'Projekt konnte nicht aktualisiert werden',
        variant: 'destructive',
      });
    }
  };

  const updateScenes = async (newScenes: Sora2Scene[]) => {
    if (!project) return;

    try {
      // Delete existing scenes
      await supabase
        .from('sora_long_form_scenes')
        .delete()
        .eq('project_id', project.id);

      // Insert new scenes
      if (newScenes.length > 0) {
        const { error } = await supabase
          .from('sora_long_form_scenes')
          .insert(
            newScenes.map((scene, index) => ({
              project_id: project.id,
              scene_order: index,
              duration: scene.duration,
              prompt: scene.prompt,
              reference_image_url: scene.reference_image_url,
              status: scene.status,
              transition_type: scene.transition_type,
              transition_duration: scene.transition_duration,
              cost_euros: scene.cost_euros,
            }))
          );

        if (error) throw error;
      }

      setScenes(newScenes);
    } catch (error) {
      console.error('Error updating scenes:', error);
      toast({
        title: 'Fehler',
        description: 'Szenen konnten nicht aktualisiert werden',
        variant: 'destructive',
      });
    }
  };

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Film className="h-12 w-12 text-primary animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">Projekt wird erstellt...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Sora 2 Long-Form Creator | AdTool</title>
        <meta name="description" content="Erstelle längere Videos mit Sora 2 durch intelligente Szenen-Kombination" />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Film className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">Sora 2 Long-Form Creator</h1>
                  <p className="text-sm text-muted-foreground">Erstelle längere Videos (30s - 120s)</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 inline mr-1" />
                Powered by Sora 2
              </span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          <LongFormWizard
            project={project}
            scenes={scenes}
            onUpdateProject={updateProject}
            onUpdateScenes={updateScenes}
          />
        </main>
      </div>
    </>
  );
}
