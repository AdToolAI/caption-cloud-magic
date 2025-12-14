import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ExplainerBriefing, ExplainerScript, ScriptScene } from '@/types/explainer-studio';
import { toast } from 'sonner';

export function useExplainerScript() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [script, setScript] = useState<ExplainerScript | null>(null);

  const generateScript = async (briefing: ExplainerBriefing): Promise<ExplainerScript | null> => {
    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-explainer-script', {
        body: { briefing }
      });

      if (error) {
        console.error('Script generation error:', error);
        toast.error('Fehler bei der Drehbuch-Generierung', {
          description: error.message || 'Bitte versuche es erneut.'
        });
        return null;
      }

      if (data?.error) {
        toast.error('KI-Fehler', {
          description: data.error
        });
        return null;
      }

      const generatedScript = data.script as ExplainerScript;
      setScript(generatedScript);
      toast.success('Drehbuch erfolgreich generiert!');
      return generatedScript;

    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Unerwarteter Fehler', {
        description: 'Bitte versuche es erneut.'
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const updateScene = (sceneId: string, updates: Partial<ScriptScene>) => {
    if (!script) return;
    
    setScript({
      ...script,
      scenes: script.scenes.map(scene =>
        scene.id === sceneId ? { ...scene, ...updates } : scene
      )
    });
  };

  const reorderScenes = (newScenes: ScriptScene[]) => {
    if (!script) return;
    setScript({ ...script, scenes: newScenes });
  };

  return {
    script,
    setScript,
    isGenerating,
    generateScript,
    updateScene,
    reorderScenes
  };
}
