import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, X, ExternalLink } from 'lucide-react';
import { TemplateCard } from '../TemplateCard';
import { AITemplateRecommendations } from '../AITemplateRecommendations';
import { TrendingTemplatesSection } from '../TrendingTemplatesSection';
import { useNavigate } from 'react-router-dom';
import type { ContentTemplate, ContentType } from '@/types/content-studio';

interface TemplateSelectionStepProps {
  contentType: ContentType;
  selectedTemplate: ContentTemplate | null;
  onTemplateSelect: (template: ContentTemplate) => void;
  brief?: string;
  brandKitId?: string;
}

export const TemplateSelectionStep = ({
  contentType,
  selectedTemplate,
  onTemplateSelect,
  brief = '',
  brandKitId
}: TemplateSelectionStepProps) => {
  const navigate = useNavigate();
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

  const renderTemplateCard = (template: ContentTemplate) => (
    <TemplateCard
      key={template.id}
      template={template}
      isSelected={selectedTemplate?.id === template.id}
      onSelect={onTemplateSelect}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Wähle ein Template</h2>
          <p className="text-muted-foreground">
            Finde das perfekte Template für dein {contentType} Projekt
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate('/template-browser')}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Alle Templates durchsuchen
        </Button>
      </div>

      {/* AI Template Recommendations */}
      <AITemplateRecommendations
        contentType={contentType as any}
        brief={brief}
        brandKitId={brandKitId}
        onSelectTemplate={onTemplateSelect}
      />

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

      {/* Trending Templates Section with Tabs */}
      <TrendingTemplatesSection
        contentType={contentType}
        platform={selectedPlatform !== 'all' ? selectedPlatform : undefined}
        allTemplates={filteredTemplates || []}
        selectedTemplate={selectedTemplate}
        onSelectTemplate={onTemplateSelect}
        renderTemplateCard={renderTemplateCard}
      />
    </div>
  );
};
