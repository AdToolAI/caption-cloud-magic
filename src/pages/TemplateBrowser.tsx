import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { TemplateSearch, SearchFilters } from '@/components/templates/TemplateSearch';
import { useTemplateDiscovery, useAvailableTags } from '@/hooks/useTemplateDiscovery';
import { useRecordTemplateView } from '@/hooks/useTemplateRatings';
import { TemplateCardLazy } from '@/components/content-studio/TemplateCard.lazy';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TemplatePreviewModal } from '@/components/content-studio/TemplatePreviewModal';
import type { ContentTemplate } from '@/types/content-studio';

export default function TemplateBrowser() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    category: 'all',
    platform: 'all',
    aspectRatio: 'all',
    minRating: 0,
    tags: [],
    sortBy: 'popular',
  });

  const [selectedTemplate, setSelectedTemplate] = useState<ContentTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ContentTemplate | null>(null);

  const { data: templates, isLoading } = useTemplateDiscovery(filters);
  const { data: availableTags } = useAvailableTags();
  const { mutate: recordView } = useRecordTemplateView();

  const handleTemplateSelect = (template: ContentTemplate) => {
    setSelectedTemplate(template);
    recordView(template.id);
    
    // Navigate to appropriate creator based on content type
    switch (template.content_type) {
      case 'ad':
        navigate('/content-studio/ads', { state: { template } });
        break;
      case 'story':
        navigate('/content-studio/stories', { state: { template } });
        break;
      case 'reel':
        navigate('/content-studio/reels', { state: { template } });
        break;
      default:
        navigate('/content-studio/ads', { state: { template } });
    }
  };

  const handlePreview = (template: ContentTemplate) => {
    setPreviewTemplate(template);
    recordView(template.id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 py-16 text-primary-foreground">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Template Browser</h1>
          <p className="text-xl opacity-90">
            Entdecken Sie professionelle Video-Templates für Ihre Projekte
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Search & Filters */}
        <Card className="p-6 mb-8">
          <TemplateSearch
            filters={filters}
            onFiltersChange={setFilters}
            availableTags={availableTags}
          />
        </Card>

        {/* Results */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : templates && templates.length > 0 ? (
          <>
            <div className="mb-4 text-sm text-muted-foreground">
              {templates.length} Template{templates.length !== 1 ? 's' : ''} gefunden
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {templates.map((template) => (
                <TemplateCardLazy
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplate?.id === template.id}
                  onSelect={handleTemplateSelect}
                  onPreview={handlePreview}
                />
              ))}
            </div>
          </>
        ) : (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground text-lg">
              Keine Templates gefunden. Versuchen Sie andere Suchkriterien.
            </p>
          </Card>
        )}
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          open={!!previewTemplate}
          onOpenChange={(open) => !open && setPreviewTemplate(null)}
          onSelect={handleTemplateSelect}
        />
      )}
    </div>
  );
}