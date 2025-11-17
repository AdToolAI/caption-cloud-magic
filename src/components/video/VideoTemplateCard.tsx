import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Info, Video } from 'lucide-react';
import type { VideoTemplate } from '@/types/video';

interface VideoTemplateCardProps {
  template: VideoTemplate;
  onSelect?: (template: VideoTemplate) => void;
}

export const VideoTemplateCard = ({ template, onSelect }: VideoTemplateCardProps) => {
  const [showPreview, setShowPreview] = useState(false);

  const handleUseTemplate = () => {
    onSelect?.(template);
  };

  return (
    <Card 
      className="overflow-hidden cursor-pointer transition-all hover:shadow-lg group"
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      <div className="relative aspect-video bg-muted">
        {showPreview && template.preview_video_url ? (
          <video
            src={template.preview_video_url}
            autoPlay
            loop
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={template.thumbnail_url || template.preview_url || '/placeholder.svg'}
            alt={template.name}
            className="w-full h-full object-cover"
          />
        )}
        
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Play className="h-12 w-12 text-white" />
        </div>

        <Badge className="absolute top-2 right-2 bg-primary">
          {template.category}
        </Badge>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-foreground">{template.name}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {template.description}
          </p>
        </div>

        <div className="flex gap-2">
          <Button 
            className="flex-1"
            onClick={handleUseTemplate}
          >
            <Video className="h-4 w-4 mr-2" />
            Template verwenden
          </Button>
          <Button 
            variant="outline" 
            size="icon"
            onClick={handleUseTemplate}
          >
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
