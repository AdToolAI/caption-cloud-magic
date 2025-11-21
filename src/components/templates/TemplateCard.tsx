import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Copy, 
  Edit, 
  Trash2, 
  Star,
  Clock,
  Eye,
  MoreVertical
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TemplateCardProps {
  template: any;
  onPreview: (template: any) => void;
  onEdit: (template: any) => void;
  onDuplicate: (templateId: string) => void;
  onDelete: (templateId: string) => void;
  onUse: (template: any) => void;
}

export const TemplateCard = ({
  template,
  onPreview,
  onEdit,
  onDuplicate,
  onDelete,
  onUse,
}: TemplateCardProps) => {
  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      social_media: 'Social Media',
      advertising: 'Werbung',
      explainer: 'Erklärvideos',
      tutorial: 'Tutorials',
      testimonial: 'Testimonials',
      product_showcase: 'Produktpräsentation',
      event: 'Events',
      educational: 'Bildung',
      entertainment: 'Unterhaltung',
      other: 'Sonstige',
    };
    return labels[category] || category;
  };

  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-shadow">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted overflow-hidden">
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
        
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onPreview(template)}
          >
            <Eye className="mr-2 h-4 w-4" />
            Vorschau
          </Button>
          <Button
            size="sm"
            onClick={() => onUse(template)}
          >
            <Play className="mr-2 h-4 w-4" />
            Verwenden
          </Button>
        </div>

        {/* Featured Badge */}
        {template.is_featured && (
          <Badge className="absolute top-2 left-2 bg-yellow-500">
            <Star className="mr-1 h-3 w-3" />
            Featured
          </Badge>
        )}

        {/* Duration */}
        {template.duration && (
          <Badge variant="secondary" className="absolute bottom-2 right-2">
            <Clock className="mr-1 h-3 w-3" />
            {template.duration}s
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{template.name}</h3>
            {template.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {template.description}
              </p>
            )}
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(template)}>
                <Edit className="mr-2 h-4 w-4" />
                Bearbeiten
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(template.id)}>
                <Copy className="mr-2 h-4 w-4" />
                Duplizieren
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(template.id)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Meta Info */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">
            {getCategoryLabel(template.category)}
          </Badge>
          {template.aspect_ratio && (
            <Badge variant="outline">{template.aspect_ratio}</Badge>
          )}
          {template.usage_count > 0 && (
            <span className="text-xs text-muted-foreground">
              {template.usage_count}× verwendet
            </span>
          )}
        </div>

        {/* Tags */}
        {template.tags && template.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {template.tags.slice(0, 3).map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {template.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{template.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
