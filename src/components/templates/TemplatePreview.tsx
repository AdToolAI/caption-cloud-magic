import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Download, Copy, Clock, Video } from 'lucide-react';
import { useTemplateVersion } from '@/hooks/useTemplateVersion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface TemplatePreviewProps {
  template: any | null;
  open: boolean;
  onClose: () => void;
  onUse: (template: any) => void;
  onDuplicate: (templateId: string) => void;
}

export const TemplatePreview = ({
  template,
  open,
  onClose,
  onUse,
  onDuplicate,
}: TemplatePreviewProps) => {
  const { versions } = useTemplateVersion(template?.id);

  if (!template) return null;

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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-8rem)]">
          <div className="space-y-6">
            {/* Preview Video/Image */}
            <div className="aspect-video bg-muted rounded-lg overflow-hidden">
              {template.preview_video_url ? (
                <video
                  src={template.preview_video_url}
                  controls
                  className="w-full h-full"
                />
              ) : template.thumbnail_url ? (
                <img
                  src={template.thumbnail_url}
                  alt={template.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Video className="h-16 w-16 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={() => onUse(template)} className="flex-1">
                <Play className="mr-2 h-4 w-4" />
                Template verwenden
              </Button>
              <Button
                variant="outline"
                onClick={() => onDuplicate(template.id)}
              >
                <Copy className="mr-2 h-4 w-4" />
                Duplizieren
              </Button>
            </div>

            {/* Details */}
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Beschreibung</h3>
                <p className="text-sm text-muted-foreground">
                  {template.description || 'Keine Beschreibung verfügbar'}
                </p>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Kategorie</h4>
                  <Badge variant="outline">
                    {getCategoryLabel(template.category)}
                  </Badge>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Format</h4>
                  <Badge variant="outline">{template.aspect_ratio || '16:9'}</Badge>
                </div>

                {template.duration && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Dauer</h4>
                    <div className="flex items-center gap-1 text-sm">
                      <Clock className="h-4 w-4" />
                      {template.duration}s
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-medium mb-2">Verwendungen</h4>
                  <p className="text-sm">{template.usage_count || 0}×</p>
                </div>
              </div>

              <Separator />

              {/* Customizable Fields */}
              {template.customizable_fields && template.customizable_fields.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Anpassbare Felder</h3>
                  <div className="grid gap-2">
                    {template.customizable_fields.map((field: any, index: number) => (
                      <div
                        key={index}
                        className="p-3 bg-muted rounded-lg"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{field.label || field.key}</span>
                          <Badge variant="secondary">{field.type}</Badge>
                        </div>
                        {field.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {field.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {template.tags && template.tags.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Tags</h3>
                    <div className="flex gap-1 flex-wrap">
                      {template.tags.map((tag: string) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Version History */}
              {versions && versions.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-3">Versionshistorie</h3>
                    <div className="space-y-2">
                      {versions.map((version: any) => (
                        <div
                          key={version.id}
                          className="p-3 bg-muted rounded-lg text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              Version {version.version_number}
                            </span>
                            {version.is_published && (
                              <Badge variant="secondary">Veröffentlicht</Badge>
                            )}
                          </div>
                          {version.change_notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {version.change_notes}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(version.created_at).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
