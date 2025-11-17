import { useState } from 'react';
import { useVideoTemplates } from '@/hooks/useVideoTemplates';
import { VideoTemplateCard } from './VideoTemplateCard';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { VideoTemplate } from '@/types/video';

const CATEGORIES = [
  { value: '', label: 'Alle' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'social', label: 'Social Media' },
  { value: 'product', label: 'Produkt' },
  { value: 'brand', label: 'Brand' }
];

interface VideoTemplateGalleryProps {
  onTemplateSelect: (template: VideoTemplate) => void;
}

export const VideoTemplateGallery = ({ onTemplateSelect }: VideoTemplateGalleryProps) => {
  const [selectedCategory, setSelectedCategory] = useState('');
  const { data: templates, isLoading } = useVideoTemplates(selectedCategory || undefined);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((category) => (
          <Button
            key={category.value}
            variant={selectedCategory === category.value ? 'default' : 'outline'}
            onClick={() => setSelectedCategory(category.value)}
          >
            {category.label}
          </Button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates?.map((template) => (
          <VideoTemplateCard 
            key={template.id} 
            template={template}
            onSelect={onTemplateSelect}
          />
        ))}
      </div>

      {templates?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Keine Templates in dieser Kategorie gefunden
        </div>
      )}
    </div>
  );
};
