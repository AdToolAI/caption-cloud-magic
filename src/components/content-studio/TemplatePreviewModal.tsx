import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Download, Edit } from 'lucide-react';
import type { ContentTemplate } from '@/types/content-studio';

interface TemplatePreviewModalProps {
  template: ContentTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: ContentTemplate) => void;
}

export const TemplatePreviewModal = ({ 
  template, 
  open, 
  onOpenChange, 
  onSelect 
}: TemplatePreviewModalProps) => {
  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{template.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Video Preview */}
          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
            {template.preview_video_url ? (
              <video 
                src={template.preview_video_url} 
                controls 
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
              />
            ) : template.thumbnail_url ? (
              <img 
                src={template.thumbnail_url} 
                alt={template.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Play className="h-16 w-16 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Template Info */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">Beschreibung</h3>
              <p className="text-sm text-muted-foreground">{template.description}</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Kategorie:</span>
                  <Badge variant="secondary">{template.category}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Plattform:</span>
                  <Badge variant="outline">{template.platform}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Format:</span>
                  <Badge variant="outline">{template.aspect_ratio}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Dauer:</span>
                  <Badge variant="outline">
                    {template.duration_min}-{template.duration_max}s
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Customizable Fields */}
          {template.customizable_fields.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Anpassbare Felder</h3>
              <div className="grid grid-cols-2 gap-3">
                {template.customizable_fields.map((field, index) => (
                  <div key={index} className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Edit className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">{field.label}</span>
                      {field.required && (
                        <Badge variant="destructive" className="text-xs">Pflicht</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {field.placeholder || `${field.type} Feld`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Features */}
          {template.ai_features.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">KI-Features</h3>
              <div className="flex gap-2 flex-wrap">
                {template.ai_features.map((feature, index) => (
                  <Badge key={index} variant="secondary" className="bg-primary/10 text-primary">
                    {feature}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button 
              onClick={() => {
                onSelect(template);
                onOpenChange(false);
              }}
              className="flex-1"
              size="lg"
            >
              <Play className="h-4 w-4 mr-2" />
              Template verwenden
            </Button>
            {template.preview_video_url && (
              <Button 
                variant="outline" 
                onClick={() => window.open(template.preview_video_url!, '_blank')}
              >
                <Download className="h-4 w-4 mr-2" />
                Preview herunterladen
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
