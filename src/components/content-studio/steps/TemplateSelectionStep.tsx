import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

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

  // Filter templates based on selected filters
  const filteredTemplates = templates?.filter(template => {
    if (selectedPlatform !== 'all' && !template.platform.toLowerCase().includes(selectedPlatform)) {
      return false;
    }
    if (selectedAspectRatio !== 'all' && template.aspect_ratio !== selectedAspectRatio) {
      return false;
    }
    if (selectedCategory !== 'all' && template.category !== selectedCategory) {
      return false;
    }
    return true;
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

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Plattform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Plattformen</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedAspectRatio} onValueChange={setSelectedAspectRatio}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Formate</SelectItem>
            <SelectItem value="9:16">9:16 (Vertikal)</SelectItem>
            <SelectItem value="16:9">16:9 (Horizontal)</SelectItem>
            <SelectItem value="1:1">1:1 (Quadrat)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kategorien</SelectItem>
            <SelectItem value="product">Produkt</SelectItem>
            <SelectItem value="service">Service</SelectItem>
            <SelectItem value="event">Event</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
          </SelectContent>
        </Select>

        {(selectedPlatform !== 'all' || selectedAspectRatio !== 'all' || selectedCategory !== 'all') && (
          <Badge 
            variant="secondary" 
            className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => {
              setSelectedPlatform('all');
              setSelectedAspectRatio('all');
              setSelectedCategory('all');
            }}
          >
            Filter zurücksetzen
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates?.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedTemplate?.id === template.id}
            onSelect={onTemplateSelect}
          />
        ))}
      </div>

      {filteredTemplates?.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            {templates?.length === 0 
              ? 'Keine Templates für diesen Content-Typ verfügbar'
              : 'Keine Templates gefunden. Versuche andere Filter.'}
          </p>
        </Card>
      )}
    </div>
  );
};
