import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useTemplateGenerator() {
  const [loading, setLoading] = useState(false);
  const [generatedTemplate, setGeneratedTemplate] = useState<any>(null);
  const { toast } = useToast();

  const generateFromPost = async (params: {
    post_id?: string;
    source_url?: string;
    template_name: string;
  }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-template-from-post', {
        body: params,
      });

      if (error) throw error;

      setGeneratedTemplate(data);

      toast({
        title: 'Template erstellt',
        description: `"${data.template_name}" wurde generiert`,
      });

      return data;
    } catch (error) {
      console.error('Error generating template:', error);
      toast({
        title: 'Fehler',
        description: 'Template-Generierung fehlgeschlagen',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getGeneratedTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('generated_templates')
        .select(`
          *,
          template:content_templates(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching generated templates:', error);
      return [];
    }
  };

  return {
    loading,
    generatedTemplate,
    generateFromPost,
    getGeneratedTemplates,
  };
}
