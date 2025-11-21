import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Play, Eye, Star } from 'lucide-react';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import type { ContentTemplate } from '@/types/content-studio';

interface TemplateCardProps {
  template: ContentTemplate;
  isSelected: boolean;
  onSelect: (template: ContentTemplate) => void;
}

export const TemplateCard = ({ template, isSelected, onSelect }: TemplateCardProps) => {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      <Card 
        className={`overflow-hidden cursor-pointer transition-all hover:shadow-lg ${
          isSelected ? 'ring-2 ring-primary' : ''
        }`}
        onClick={() => onSelect(template)}
      >
      {/* Thumbnail/Preview */}
      <div className="relative aspect-video bg-muted">
        {template.thumbnail_url ? (
          <img 
            src={template.thumbnail_url} 
            alt={template.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        {isSelected && (
          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-2">
            <Check className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-foreground">{template.name}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {template.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{template.category}</Badge>
          <Badge variant="outline">{template.aspect_ratio}</Badge>
          <Badge variant="outline">
            {template.duration_min}-{template.duration_max}s
          </Badge>
        </div>

        {/* Rating Display */}
        {(template as any).average_rating && (
          <div className="flex items-center gap-1 text-sm">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            <span className="font-medium">{((template as any).average_rating as number).toFixed(1)}</span>
            <span className="text-muted-foreground">
              ({(template as any).total_ratings || 0})
            </span>
          </div>
        )}

        {/* Tags */}
        {(template as any).tags && (template as any).tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {((template as any).tags as string[]).slice(0, 3).map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button 
            variant="outline"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              setShowPreview(true);
            }}
          >
            <Eye className="h-4 w-4 mr-2" />
            Vorschau
          </Button>
          <Button 
            variant={isSelected ? 'default' : 'outline'} 
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(template);
            }}
          >
            {isSelected ? 'Ausgewählt' : 'Wählen'}
          </Button>
        </div>
      </div>
    </Card>

    <TemplatePreviewModal
      template={template}
      open={showPreview}
      onOpenChange={setShowPreview}
      onSelect={onSelect}
    />
    </>
  );
};
