import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { TemplateCard } from '../TemplateCard';
import type { ContentTemplate, ContentType } from '@/types/content-studio';

interface TemplateSelectionStepProps {
  contentType: ContentType;
  selectedTemplate: ContentTemplate | null;
  onTemplateSelect: (template: ContentTemplate) => void;
}

export const TemplateSelectionStep = ({ 
  contentType, 
  selectedTemplate, 
  onTemplateSelect 
}: TemplateSelectionStepProps) => {
  const { data: templates, isLoading } = useQuery({
    queryKey: ['content-templates', contentType],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-content-templates', {
        body: { content_type: contentType }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      return data.templates as ContentTemplate[];
    }
  });

  if (isLoading) {
    return (
      <Card className="p-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Wähle ein Template</h2>
        <p className="text-muted-foreground">
          Starte mit einem vorgefertigten Template und passe es an deine Bedürfnisse an
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates?.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedTemplate?.id === template.id}
            onSelect={onTemplateSelect}
          />
        ))}
      </div>

      {templates?.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            Keine Templates für diesen Content-Typ verfügbar
          </p>
        </Card>
      )}
    </div>
  );
};
