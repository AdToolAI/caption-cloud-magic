import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Film, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LongFormWizard } from '@/components/sora-long-form/LongFormWizard';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';
import { Sora2ComingSoonGate } from '@/components/sora2/Sora2ComingSoonGate';
import { trackFeatureUsage } from '@/lib/featureUsageTracker';
import type { Sora2LongFormProject, Sora2Scene } from '@/types/sora-long-form';

export default function Sora2LongFormCreator() {
  useEffect(() => {
    trackFeatureUsage('sora_long_form');
  }, []);

  return (
    <Sora2ComingSoonGate>
      <Sora2LongFormCreatorInner />
    </Sora2ComingSoonGate>
  );
}

function Sora2LongFormCreatorInner() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [project, setProject] = useState<Sora2LongFormProject | null>(null);
  const [scenes, setScenes] = useState<Sora2Scene[]>([]);
  const [loading, setLoading] = useState(false);
  const updateLockRef = useRef(false);

  useEffect(() => {
    createNewProject();
  }, []);

  const createNewProject = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: t('soraLf.notLoggedIn'), variant: 'destructive' });
        navigate('/auth');
        return;
      }

      const { data, error } = await supabase
        .from('sora_long_form_projects')
        .insert({
          user_id: user.id,
          name: t('soraLf.newLongFormVideo'),
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
        title: t('soraLf.errorTitle'),
        description: t('soraLf.projectCreateError'),
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
        title: t('soraLf.errorTitle'),
        description: t('soraLf.projectUpdateError'),
        variant: 'destructive',
      });
    }
  };

  const updateScenes = async (newScenes: Sora2Scene[]) => {
    if (!project) return;

    if (project.status === 'generating') {
      console.warn('[Scenes] Update blocked during generation - only updating local state');
      setScenes(newScenes);
      return;
    }

    if (updateLockRef.current) {
      console.warn('[Scenes] Update already in progress - skipping');
      return;
    }

    updateLockRef.current = true;

    try {
      const existingScenes = newScenes.filter(s => !s.id.startsWith('temp-'));
      const newTempScenes = newScenes.filter(s => s.id.startsWith('temp-'));

      if (existingScenes.length > 0) {
        const { error: upsertError } = await supabase
          .from('sora_long_form_scenes')
          .upsert(
            existingScenes.map((scene, index) => ({
              id: scene.id,
              project_id: project.id,
              scene_order: newScenes.findIndex(s => s.id === scene.id),
              duration: scene.duration,
              prompt: scene.prompt,
              reference_image_url: scene.reference_image_url,
              status: scene.status,
              transition_type: scene.transition_type,
              transition_duration: scene.transition_duration,
              cost_euros: scene.cost_euros,
              shot_director: scene.shot_director ?? {},
            })),
            { onConflict: 'id' }
          );
        if (upsertError) throw upsertError;
      }

      if (newTempScenes.length > 0) {
        const { data: insertedScenes, error: insertError } = await supabase
          .from('sora_long_form_scenes')
          .insert(
            newTempScenes.map((scene) => ({
              project_id: project.id,
              scene_order: newScenes.findIndex(s => s.id === scene.id),
              duration: scene.duration,
              prompt: scene.prompt,
              reference_image_url: scene.reference_image_url,
              status: scene.status,
              transition_type: scene.transition_type,
              transition_duration: scene.transition_duration,
              cost_euros: scene.cost_euros,
            }))
          )
          .select();

        if (insertError) throw insertError;

        if (insertedScenes) {
          const updatedScenes = newScenes.map(scene => {
            if (scene.id.startsWith('temp-')) {
              const inserted = insertedScenes.find(
                is => is.scene_order === newScenes.findIndex(s => s.id === scene.id)
              );
              if (inserted) {
                return { ...scene, id: inserted.id };
              }
            }
            return scene;
          });
          setScenes(updatedScenes);
          return;
        }
      }

      setScenes(newScenes);
    } catch (error) {
      console.error('Error updating scenes:', error);
      toast({
        title: t('soraLf.errorTitle'),
        description: t('soraLf.scenesUpdateError'),
        variant: 'destructive',
      });
    } finally {
      updateLockRef.current = false;
    }
  };

  const updateScenesLocal = (newScenes: Sora2Scene[]) => {
    setScenes(newScenes);
  };

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Film className="h-12 w-12 text-primary animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">{t('soraLf.projectCreating')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{t('soraLf.pageTitle')} | AdTool</title>
        <meta name="description" content={t('soraLf.pageSubtitle')} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <header className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Film className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">{t('soraLf.pageTitle')}</h1>
                  <p className="text-sm text-muted-foreground">{t('soraLf.pageSubtitle')}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 inline mr-1" />
                {t('soraLf.poweredBy')}
              </span>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <LongFormWizard
            project={project}
            scenes={scenes}
            onUpdateProject={updateProject}
            onUpdateScenes={updateScenes}
            onUpdateScenesLocal={updateScenesLocal}
          />
        </main>
      </div>
    </>
  );
}
