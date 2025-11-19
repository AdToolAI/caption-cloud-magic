import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Video, ArrowLeft, Sparkles } from 'lucide-react';
import { useVideoTemplates } from '@/hooks/useVideoTemplates';
import { useVideoCreation } from '@/hooks/useVideoCreation';
import type { VideoTemplate, CustomizableField, BackgroundMusic } from '@/types/video';
import { supabase } from '@/integrations/supabase/client';
import { MultiImageUpload } from './MultiImageUpload';
import { MultiVideoUpload } from './MultiVideoUpload';
import { VideoUpload } from './VideoUpload';
import { AudioUpload } from './AudioUpload';
import { TransitionSelector } from './TransitionSelector';
import { BrandKitSelector } from './BrandKitSelector';
import { VideoTemplateGallery } from './VideoTemplateGallery';
import { RenderingOptionsSelector, RenderingOptions } from './RenderingOptionsSelector';
import { AIScriptGenerator } from './AIScriptGenerator';
import { AIMusicSuggester } from './AIMusicSuggester';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface VideoCreatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVideoCreated?: (videoUrl: string) => void;
}

type Step = 'gallery' | 'customize' | 'rendering';

export const VideoCreatorDialog = ({ open, onOpenChange, onVideoCreated }: VideoCreatorDialogProps) => {
  const [step, setStep] = useState<Step>('gallery');
  const [selectedTemplate, setSelectedTemplate] = useState<VideoTemplate | null>(null);
  const [customizations, setCustomizations] = useState<Record<string, string | number>>({});
  const [uploadingImages, setUploadingImages] = useState<Set<string>>(new Set());
  const [multiImageUploads, setMultiImageUploads] = useState<Record<string, Array<{ id: string; url: string; file: File }>>>({});
  const [multiVideoUploads, setMultiVideoUploads] = useState<Record<string, Array<{ id: string; url: string; file: File; duration?: number; thumbnail?: string }>>>({});
  const [brandKitId, setBrandKitId] = useState<string | null>(null);
  const [backgroundMusic, setBackgroundMusic] = useState<BackgroundMusic | null>(null);
  const [scriptText, setScriptText] = useState<string>('');
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [voiceStyle, setVoiceStyle] = useState<string>('aria');
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.0);
  const [renderingOptions, setRenderingOptions] = useState<RenderingOptions>({
    quality: '1080p',
    format: 'mp4',
    aspectRatio: '16:9',
    framerate: 30
  });

  const { data: templates, isLoading: templatesLoading } = useVideoTemplates();
  const { createVideo, pollStatus, loading, polling } = useVideoCreation();

  const handleTemplateSelect = (template: VideoTemplate) => {
    setSelectedTemplate(template);
    
    // Initialize customizations with default values
    const defaultCustomizations: Record<string, string | number> = {};
    template.customizable_fields.forEach(field => {
      if (field.default !== undefined && field.default !== null) {
        defaultCustomizations[field.key] = field.default;
      }
    });
    setCustomizations(defaultCustomizations);
    
    setStep('customize');
  };

  const handleBack = () => {
    if (step === 'customize') {
      setStep('gallery');
      setSelectedTemplate(null);
      setCustomizations({});
      setScriptText('');
    }
  };

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
          .upload(fileName, image.file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('media-assets')
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
      }

      handleFieldChange(key, JSON.stringify(uploadedUrls));
      toast.success(`${uploadedUrls.length} Bild(er) hochgeladen`);
    } catch (error) {
      console.error('Upload error:', error);
      if (error instanceof Error) {
        toast.error(`Bild-Upload fehlgeschlagen: ${error.message}`);
      } else {
        toast.error('Bild-Upload fehlgeschlagen');
      }
    } finally {
      setUploadingImages(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleMultiVideoUpload = async (key: string, videos: Array<{ id: string; url: string; file: File }>) => {
    if (videos.length === 0) return;
    
    setUploadingImages(prev => new Set(prev).add(key));
    try {
      const uploadedUrls: string[] = [];

      for (const video of videos) {
        const fileName = `${Date.now()}-${video.file.name}`;
        const { data, error } = await supabase.storage
          .from('video-assets')
          .upload(fileName, video.file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('video-assets')
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
      }

      handleFieldChange(key, JSON.stringify(uploadedUrls));
      toast.success(`${uploadedUrls.length} Video(s) hochgeladen`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Video-Upload fehlgeschlagen');
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

    // Validate script if subtitles or voiceover enabled
    if ((enableSubtitles || voiceStyle) && !scriptText) {
      toast.error('Bitte generiere zuerst ein Script im AI Script Tab für Voiceover und Untertitel.', {
        duration: 5000
      });
      return;
    }

    // Apply defaults
    const finalCustomizations = { ...customizations };
    selectedTemplate.customizable_fields.forEach(field => {
      if (field.default && !finalCustomizations[field.key]) {
        finalCustomizations[field.key] = field.default;
      }
    });

    // Add rendering options
    finalCustomizations._renderingOptions = JSON.stringify(renderingOptions);
    
    // Add subtitle preference
    finalCustomizations.enable_subtitles = enableSubtitles ? 'true' : 'false';
    
    // Add voiceover settings
    finalCustomizations.voice_style = voiceStyle;
    finalCustomizations.voice_speed = voiceSpeed;
    
    // Add script text if available
    if (scriptText) {
      finalCustomizations.script_text = scriptText;
    }

    setStep('rendering');
    const result = await createVideo(selectedTemplate.id, finalCustomizations);
    if (!result) {
      setStep('customize');
      return;
    }

    pollStatus(result.creation_id, (outputUrl) => {
      onVideoCreated?.(outputUrl);
      onOpenChange(false);
      setStep('gallery');
      setSelectedTemplate(null);
      setCustomizations({});
    }, () => {
      setStep('customize');
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

    if (field.type === 'videos') {
      return (
        <div key={field.key} className="space-y-2">
          <MultiVideoUpload
            label={field.label}
            value={multiVideoUploads[field.key] || []}
            onChange={(videos) => {
              setMultiVideoUploads(prev => ({ ...prev, [field.key]: videos }));
              if (videos.length > 0) {
                handleMultiVideoUpload(field.key, videos);
              }
            }}
            maxFiles={field.max_count || 3}
            minFiles={field.min_count || 1}
            maxSizeMB={field.max_size_mb || 100}
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
          <div className="flex items-center justify-between">
            <p className={`text-xs ${
              String(customizations[field.key] || '').length > field.maxLength
                ? 'text-destructive font-medium'
                : 'text-muted-foreground'
            }`}>
              {String(customizations[field.key] || '').length}/{field.maxLength}
              {String(customizations[field.key] || '').length > field.maxLength && (
                <span className="ml-1">⚠️ Text ist zu lang!</span>
              )}
            </p>
          </div>
        )}
      </div>
    );
  };

  const isValid = selectedTemplate?.customizable_fields
    .filter(f => f.required)
    .every(f => {
      const value = customizations[f.key];
      
      // Special handling for images and videos fields
      if (f.type === 'images' || f.type === 'videos') {
        try {
          const parsed = JSON.parse(String(value || '[]'));
          const hasMinCount = Array.isArray(parsed) && (f.min_count ? parsed.length >= f.min_count : parsed.length > 0);
          
          console.log(`Field ${f.key} (${f.label}):`, {
            required: f.required,
            type: f.type,
            value: value,
            parsed: parsed,
            min_count: f.min_count,
            hasMinCount,
            valid: hasMinCount
          });
          
          return hasMinCount;
        } catch {
          console.log(`Field ${f.key} (${f.label}): JSON parse error`);
          return false;
        }
      }
      
      // For text/number fields
      const hasValue = value !== undefined && value !== null && value !== '';
      const isValidLength = !f.maxLength || String(value).length <= f.maxLength;
      
      console.log(`Field ${f.key} (${f.label}):`, {
        required: f.required,
        value: value,
        valueLength: String(value || '').length,
        maxLength: f.maxLength,
        hasValue,
        isValidLength,
        valid: hasValue && isValidLength
      });
      
      return hasValue && isValidLength;
    });

  console.log('All customizations:', customizations);
  console.log('isValid:', isValid);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'customize' && (
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Video className="h-5 w-5" />
            {step === 'gallery' && 'Template auswählen'}
            {step === 'customize' && `Video erstellen: ${selectedTemplate?.name}`}
            {step === 'rendering' && 'Video wird erstellt...'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          {step === 'gallery' && (
            <div className="p-4">
              <VideoTemplateGallery onTemplateSelect={handleTemplateSelect} />
            </div>
          )}

          {step === 'customize' && selectedTemplate && (
            <div className="space-y-6 p-4">
              {/* Template Fields */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Template-Felder</h3>
                {selectedTemplate.customizable_fields.map(field => renderFieldInput(field))}
              </div>

              {/* Brand Kit Selector */}
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">Brand Kit (Optional)</h3>
                <BrandKitSelector
                  value={brandKitId}
                  onChange={setBrandKitId}
                />
              </div>

              {/* AI Features */}
              <Tabs defaultValue="rendering" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="rendering">Rendering-Optionen</TabsTrigger>
                  <TabsTrigger value="ai-script">AI Script</TabsTrigger>
                  <TabsTrigger value="ai-music">AI Musik</TabsTrigger>
                </TabsList>
                
                <TabsContent value="rendering" className="mt-4">
                  <div className="space-y-4">
                    <RenderingOptionsSelector
                      value={renderingOptions}
                      onChange={setRenderingOptions}
                    />
                    
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <Label htmlFor="subtitles-toggle" className="text-sm font-medium">
                          Text-Overlays aktivieren
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Zeigt automatisch generierte Untertitel basierend auf deinem Skript
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          id="subtitles-toggle"
                          type="checkbox"
                          checked={enableSubtitles}
                          onChange={(e) => setEnableSubtitles(e.target.checked)}
                          className="h-4 w-4 rounded border-input"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-4 p-4 border rounded-lg">
                      <div className="space-y-2">
                        <Label htmlFor="voice-style" className="text-sm font-medium">
                          Voiceover Stimme
                        </Label>
                        <select
                          id="voice-style"
                          value={voiceStyle}
                          onChange={(e) => setVoiceStyle(e.target.value)}
                          className="w-full px-3 py-2 border rounded-md bg-background"
                        >
                          <option value="aria">Aria (Weiblich, warm & freundlich)</option>
                          <option value="roger">Roger (Männlich, professionell)</option>
                          <option value="sarah">Sarah (Weiblich, energisch)</option>
                          <option value="laura">Laura (Weiblich, beruhigend)</option>
                          <option value="charlie">Charlie (Männlich, jung & dynamisch)</option>
                          <option value="george">George (Männlich, autoritativ)</option>
                          <option value="callum">Callum (Männlich, britisch)</option>
                          <option value="river">River (Neutral, moderne)</option>
                          <option value="liam">Liam (Männlich, kraftvoll)</option>
                          <option value="charlotte">Charlotte (Weiblich, elegant)</option>
                          <option value="alice">Alice (Weiblich, klar)</option>
                          <option value="matilda">Matilda (Weiblich, reif)</option>
                          <option value="will">Will (Männlich, freundlich)</option>
                          <option value="jessica">Jessica (Weiblich, selbstbewusst)</option>
                          <option value="eric">Eric (Männlich, tief)</option>
                          <option value="chris">Chris (Männlich, entspannt)</option>
                          <option value="brian">Brian (Männlich, warm)</option>
                          <option value="daniel">Daniel (Männlich, klar)</option>
                          <option value="lily">Lily (Weiblich, sanft)</option>
                          <option value="bill">Bill (Männlich, erfahren)</option>
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Wähle die Stimme für dein professionelles Voiceover
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="voice-speed" className="text-sm font-medium">
                          Sprechgeschwindigkeit: {voiceSpeed.toFixed(1)}x
                        </Label>
                        <input
                          id="voice-speed"
                          type="range"
                          min="0.5"
                          max="1.5"
                          step="0.1"
                          value={voiceSpeed}
                          onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>0.5x langsamer</span>
                          <span>1.0x normal</span>
                          <span>1.5x schneller</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="ai-script" className="mt-4 space-y-4">
                  <AIScriptGenerator
                    onGenerate={(script) => {
                      setScriptText(script);
                      toast.success('Script wurde generiert und ist bereit für Voiceover und Untertitel!', {
                        duration: 4000
                      });
                    }}
                  />
                  
                  {scriptText && (
                    <div className="space-y-2">
                      <Label htmlFor="script-editor" className="text-sm font-medium">
                        Generiertes Script (bearbeitbar)
                      </Label>
                      <textarea
                        id="script-editor"
                        value={scriptText}
                        onChange={(e) => setScriptText(e.target.value)}
                        rows={10}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                        placeholder="Dein AI-generiertes Script erscheint hier..."
                      />
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          ✓ Script bereit
                        </Badge>
                        <span>Wird für Voiceover, intelligentes Timing und Untertitel verwendet</span>
                      </div>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="ai-music" className="mt-4">
                  <AIMusicSuggester
                    onSelect={(music) => {
                      toast.success(`Musik ausgewählt: ${music.name}`);
                      // Handle music selection
                    }}
                  />
                </TabsContent>
              </Tabs>

              {/* Action Button */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Geschätzte Kosten: <Badge variant="secondary">{50} Credits</Badge>
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={!isValid || loading || polling}
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Erstelle Video...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Video erstellen
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 'rendering' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">Dein Video wird erstellt</h3>
                <p className="text-sm text-muted-foreground">
                  Dies kann einige Minuten dauern. Du kannst das Fenster schließen und später zurückkommen.
                </p>
                {polling && (
                  <Badge variant="secondary">Rendering läuft...</Badge>
                )}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
