import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Video, Sparkles } from 'lucide-react';
import { useVideoTemplates } from '@/hooks/useVideoTemplates';
import { useVideoCreation } from '@/hooks/useVideoCreation';
import type { VideoTemplate, CustomizableField, BackgroundMusic } from '@/types/video';
import { supabase } from '@/integrations/supabase/client';
import { MultiImageUpload } from './MultiImageUpload';
import { VideoUpload } from './VideoUpload';
import { AudioUpload } from './AudioUpload';
import { TransitionSelector } from './TransitionSelector';
import { BrandKitSelector } from './BrandKitSelector';
import { toast } from 'sonner';

interface VideoCreatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVideoCreated?: (videoUrl: string) => void;
}

export const VideoCreatorDialog = ({ open, onOpenChange, onVideoCreated }: VideoCreatorDialogProps) => {
  const [selectedTemplate, setSelectedTemplate] = useState<VideoTemplate | null>(null);
  const [customizations, setCustomizations] = useState<Record<string, string | number>>({});
  const [uploadingImages, setUploadingImages] = useState<Set<string>>(new Set());
  const [multiImageUploads, setMultiImageUploads] = useState<Record<string, Array<{ id: string; url: string; file: File }>>>({});
  const [brandKitId, setBrandKitId] = useState<string | null>(null);
  const [backgroundMusic, setBackgroundMusic] = useState<BackgroundMusic | null>(null);

  const { data: templates, isLoading: templatesLoading } = useVideoTemplates();
  const { createVideo, pollStatus, loading, polling } = useVideoCreation();

  const handleFieldChange = (key: string, value: string | number) => {
    setCustomizations(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleImageUpload = async (key: string, file: File) => {
    setUploadingImages(prev => new Set(prev).add(key));
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('media-assets')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('media-assets')
        .getPublicUrl(data.path);

      handleFieldChange(key, publicUrl);
    } catch (error) {
      console.error('Image upload error:', error);
      toast.error('Fehler beim Hochladen');
    } finally {
      setUploadingImages(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleMultiImageUpload = async (key: string, images: Array<{ id: string; url: string; file: File }>) => {
    if (images.length === 0) return;
    
    setUploadingImages(prev => new Set(prev).add(key));
    try {
      const uploadedUrls: string[] = [];

      for (const image of images) {
        const fileName = `${Date.now()}-${image.file.name}`;
        const { data, error } = await supabase.storage
          .from('media-assets')
          .upload(fileName, image.file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('media-assets')
          .getPublicUrl(data.path);

        uploadedUrls.push(publicUrl);
      }

      // Store as JSON array
      handleFieldChange(key, JSON.stringify(uploadedUrls));
      toast.success(`${uploadedUrls.length} Bilder hochgeladen`);
    } catch (error) {
      console.error('Multi-image upload error:', error);
      toast.error('Fehler beim Hochladen der Bilder');
    } finally {
      setUploadingImages(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) return;

    // Apply defaults
    const finalCustomizations = { ...customizations };
    selectedTemplate.customizable_fields.forEach(field => {
      if (field.default && !finalCustomizations[field.key]) {
        finalCustomizations[field.key] = field.default;
      }
    });

    const result = await createVideo(selectedTemplate.id, finalCustomizations);
    if (!result) return;

    pollStatus(result.creation_id, (outputUrl) => {
      onVideoCreated?.(outputUrl);
      onOpenChange(false);
      setSelectedTemplate(null);
      setCustomizations({});
    });
  };

  const renderFieldInput = (field: CustomizableField) => {
    const isUploading = uploadingImages.has(field.key);

    if (field.type === 'images') {
      return (
        <div key={field.key} className="space-y-2">
          <MultiImageUpload
            label={field.label}
            value={multiImageUploads[field.key] || []}
            onChange={(images) => {
              setMultiImageUploads(prev => ({ ...prev, [field.key]: images }));
              if (images.length > 0) {
                handleMultiImageUpload(field.key, images);
              }
            }}
            maxFiles={field.max_count || 5}
            minFiles={field.min_count || 1}
            disabled={isUploading || loading || polling}
          />
        </div>
      );
    }

    if (field.type === 'video') {
      return (
        <div key={field.key} className="space-y-2">
          <VideoUpload
            label={field.label}
            value={customizations[field.key] as string || null}
            onChange={(url) => handleFieldChange(field.key, url || '')}
            disabled={loading || polling}
          />
        </div>
      );
    }

    if (field.type === 'audio') {
      return (
        <div key={field.key} className="space-y-2">
          <AudioUpload
            label={field.label}
            value={backgroundMusic}
            onChange={(audio) => {
              setBackgroundMusic(audio);
              if (audio) {
                handleFieldChange(field.key, JSON.stringify(audio));
              }
            }}
            disabled={loading || polling}
          />
        </div>
      );
    }

    if (field.type === 'transition') {
      return (
        <div key={field.key} className="space-y-2">
          <TransitionSelector
            label={field.label}
            value={customizations[field.key] as string || field.default as string || 'fade'}
            onChange={(transition) => handleFieldChange(field.key, transition)}
            availableTransitions={field.available_transitions}
            disabled={loading || polling}
          />
        </div>
      );
    }

    if (field.type === 'image') {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <div className="flex gap-2">
            <Input
              id={field.key}
              type="file"
              accept="image/*"
              disabled={isUploading || loading || polling}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(field.key, file);
              }}
            />
            {isUploading && <Loader2 className="h-5 w-5 animate-spin" />}
          </div>
          {customizations[field.key] && (
            <img 
              src={String(customizations[field.key])} 
              alt="Preview" 
              className="h-20 w-20 object-cover rounded"
            />
          )}
        </div>
      );
    }

    if (field.type === 'number') {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={field.key}
            type="number"
            min={field.min}
            max={field.max}
            value={customizations[field.key] ?? field.default ?? ''}
            onChange={(e) => handleFieldChange(field.key, parseInt(e.target.value))}
            disabled={loading || polling}
          />
        </div>
      );
    }

    return (
      <div key={field.key} className="space-y-2">
        <Label htmlFor={field.key}>
          {field.label} {field.required && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id={field.key}
          type="text"
          maxLength={field.maxLength}
          value={customizations[field.key] ?? field.default ?? ''}
          onChange={(e) => handleFieldChange(field.key, e.target.value)}
          placeholder={field.default ? String(field.default) : ''}
          disabled={loading || polling}
        />
        {field.maxLength && (
          <p className="text-xs text-muted-foreground">
            {String(customizations[field.key] || '').length}/{field.maxLength}
          </p>
        )}
      </div>
    );
  };

  const isValid = selectedTemplate?.customizable_fields
    .filter(f => f.required)
    .every(f => customizations[f.key]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Werbevideo erstellen
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          {!selectedTemplate ? (
            <div className="space-y-4 p-4">
              <p className="text-sm text-muted-foreground">
                Wähle ein Template aus und passe es an deine Bedürfnisse an.
              </p>

              {templatesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates?.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template)}
                      className="group relative p-4 border rounded-lg hover:border-primary transition-all text-left space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <h3 className="font-semibold">{template.name}</h3>
                        <div className="flex gap-1">
                          <span className="text-xs px-2 py-1 bg-secondary rounded">
                            {template.aspect_ratio}
                          </span>
                          <span className="text-xs px-2 py-1 bg-secondary rounded">
                            {template.duration}s
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {template.description}
                      </p>
                      <div className="flex gap-1 flex-wrap">
                        {template.platforms.map(p => (
                          <span key={p} className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                            {p}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{selectedTemplate.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedTemplate.description}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedTemplate(null);
                    setCustomizations({});
                  }}
                  disabled={loading || polling}
                >
                  Zurück
                </Button>
              </div>

              <BrandKitSelector
                value={brandKitId}
                onChange={setBrandKitId}
                disabled={loading || polling}
              />

              <div className="space-y-4">
                {selectedTemplate.customizable_fields.map(renderFieldInput)}
              </div>

              {polling && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Video wird gerendert... (30-60 Sekunden)
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleGenerate}
                  disabled={!isValid || loading || polling}
                  className="flex-1"
                >
                  {loading || polling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {loading ? 'Starte...' : 'Rendering...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Video erstellen (50 Credits)
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
