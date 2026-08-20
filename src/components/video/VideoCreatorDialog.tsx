import { tx } from "@/lib/i18nText";
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
      toast.error(tx({ de: 'Fehler beim Hochladen', en: 'Upload error', es: 'Error al subir' }));
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
      toast.success(tx({ de: `${uploadedUrls.length} Bild(er) hochgeladen`, en: `${uploadedUrls.length} Image(s) uploaded`, es: `${uploadedUrls.length} Imagen(es) cargada(s)` }));
    } catch (error) {
      console.error('Upload error:', error);
      if (error instanceof Error) {
        toast.error(tx({ de: `Bild-Upload fehlgeschlagen: ${error.message}`, en: `Image upload failed: ${error.message}`, es: `Error al subir la imagen: ${error.message}` }));
      } else {
        toast.error(tx({ de: 'Bild-Upload fehlgeschlagen', en: 'Image upload failed', es: 'Error al subir la imagen' }));
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
      toast.success(tx({ de: `${uploadedUrls.length} Video(s) hochgeladen`, en: `${uploadedUrls.length} video(s) uploaded`, es: `${uploadedUrls.length} vídeo(s) subido(s)` }));
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(tx({ de: "Video-Upload fehlgeschlagen", en: "Video upload failed", es: "Error al subir el vídeo" }));
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
      toast.error(tx({ de: 'Bitte generiere zuerst ein Script im AI Script Tab für Voiceover und Untertitel.', en: 'Please generate a script in the AI Script tab first for voiceover and subtitles.', es: 'Por favor, genera primero un script en la pestaña de Script de IA para la voz en off y los subtítulos.' }), {
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
                <span className="ml-1">{tx({ de: "⚠️ Text ist zu lang!", en: "⚠️ Text is too long!", es: "⚠️ ¡El texto es demasiado largo!" })}</span>
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
            {step === 'gallery' && tx({ de: "Template auswählen", en: "Select template", es: "Seleccionar plantilla" })}
            {step === 'customize' && tx({ de: `Video erstellen: ${selectedTemplate?.name}`, en: `Create video: ${selectedTemplate?.name}`, es: `Crear vídeo: ${selectedTemplate?.name}` })}
            {step === 'rendering' && tx({ de: 'Video wird erstellt...', en: 'Video is being created...', es: 'El video se está creando...' })}
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
                  <TabsTrigger value="rendering">{tx({ de: 'Rendering-Optionen', en: 'Rendering options', es: 'Opciones de renderizado' })}</TabsTrigger>
                  <TabsTrigger value="ai-script">AI Script</TabsTrigger>
                  <TabsTrigger value="ai-music">{tx({ de: 'AI Musik', en: 'AI Music', es: 'Música IA' })}</TabsTrigger>
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
                          {tx({ de: "Text-Overlays aktivieren", en: "Enable text overlays", es: "Activar superposiciones de texto" })}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {tx({ de: "Zeigt automatisch generierte Untertitel basierend auf deinem Skript", en: "Shows auto-generated subtitles based on your script", es: "Muestra subtítulos generados automáticamente según tu guion" })}
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
                          {tx({ de: "Voiceover Stimme", en: "Voiceover Voice", es: "Voz en off" })}
                        </Label>
                        <select
                          id="voice-style"
                          value={voiceStyle}
                          onChange={(e) => setVoiceStyle(e.target.value)}
                          className="w-full px-3 py-2 border rounded-md bg-background"
                        >
                          <option value="aria">{tx({ de: "Aria (Weiblich, warm & freundlich)", en: "Aria (Female, warm & friendly)", es: "Aria (Femenina, cálida y amable)" })}</option>
                          <option value="roger">{tx({ de: "Roger (Männlich, professionell)", en: "Roger (Male, professional)", es: "Roger (Masculino, profesional)" })}</option>
                          <option value="sarah">{tx({ de: "Sarah (Weiblich, energisch)", en: "Sarah (Female, energetic)", es: "Sarah (Femenina, enérgica)" })}</option>
                          <option value="laura">{tx({ de: "Laura (Weiblich, beruhigend)", en: "Laura (Female, soothing)", es: "Laura (Femenina, relajante)" })}</option>
                          <option value="charlie">{tx({ de: "Charlie (Männlich, jung & dynamisch)", en: "Charlie (Male, young & dynamic)", es: "Charlie (Masculino, joven y dinámico)" })}</option>
                          <option value="george">{tx({ de: "George (Männlich, autoritativ)", en: "George (Male, authoritative)", es: "George (Masculino, autoritario)" })}</option>
                          <option value="callum">{tx({ de: "Callum (Männlich, britisch)", en: "Callum (Male, British)", es: "Callum (Masculino, británico)" })}</option>
                          <option value="river">{tx({ de: "River (Neutral, moderne)", en: "River (Neutral, modern)", es: "River (Neutra, moderna)" })}</option>
                          <option value="liam">{tx({ de: "Liam (Männlich, kraftvoll)", en: "Liam (Male, powerful)", es: "Liam (Masculino, potente)" })}</option>
                          <option value="charlotte">{tx({ de: "Charlotte (Weiblich, elegant)", en: "Charlotte (Female, elegant)", es: "Charlotte (Femenina, elegante)" })}</option>
                          <option value="alice">{tx({ de: "Alice (Weiblich, klar)", en: "Alice (Female, clear)", es: "Alice (Femenina, clara)" })}</option>
                          <option value="matilda">{tx({ de: "Matilda (Weiblich, reif)", en: "Matilda (Female, mature)", es: "Matilda (Femenina, madura)" })}</option>
                          <option value="will">{tx({ de: "Will (Männlich, freundlich)", en: "Will (Male, friendly)", es: "Will (Masculino, amigable)" })}</option>
                          <option value="jessica">{tx({ de: "Jessica (Weiblich, selbstbewusst)", en: "Jessica (Female, confident)", es: "Jessica (Femenina, segura)" })}</option>
                          <option value="eric">{tx({ de: "Eric (Männlich, tief)", en: "Eric (Male, deep)", es: "Eric (Masculino, grave)" })}</option>
                          <option value="chris">{tx({ de: "Chris (Männlich, entspannt)", en: "Chris (Male, relaxed)", es: "Chris (Masculino, relajado)" })}</option>
                          <option value="brian">{tx({ de: "Brian (Männlich, warm)", en: "Brian (Male, warm)", es: "Brian (Masculino, cálido)" })}</option>
                          <option value="daniel">{tx({ de: "Daniel (Männlich, klar)", en: "Daniel (Male, clear)", es: "Daniel (Masculino, claro)" })}</option>
                          <option value="lily">{tx({ de: "Lily (Weiblich, sanft)", en: "Lily (Female, gentle)", es: "Lily (Femenina, suave)" })}</option>
                          <option value="bill">{tx({ de: "Bill (Männlich, erfahren)", en: "Bill (Male, experienced)", es: "Bill (Masculino, experimentado)" })}</option>
                        </select>
                        <p className="text-xs text-muted-foreground">
                          {tx({ de: "Wähle die Stimme für dein professionelles Voiceover", en: "Choose the voice for your professional voiceover", es: "Elige la voz para tu voz en off profesional" })}
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
                      toast.success(tx({ de: 'Script wurde generiert und ist bereit für Voiceover und Untertitel!', en: 'Script has been generated and is ready for voiceover and subtitles!', es: '¡El script ha sido generado y está listo para voz en off y subtítulos!' }), {
                        duration: 4000
                      });
                    }}
                  />
                  
                  {scriptText && (
                    <div className="space-y-2">
                      <Label htmlFor="script-editor" className="text-sm font-medium">
                        {tx({ de: "Generiertes Script (bearbeitbar)", en: "Generated script (editable)", es: "Guion generado (editable)" })}
                      </Label>
                      <textarea
                        id="script-editor"
                        value={scriptText}
                        onChange={(e) => setScriptText(e.target.value)}
                        rows={10}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                        placeholder={tx({ de: "Dein AI-generiertes Script erscheint hier...", en: "Your AI-generated script appears here...", es: "Su secuencia de comandos generada por IA aparece aquí..." })}
                      />
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          ✓ Script bereit
                        </Badge>
                        <span>{tx({ de: "Wird für Voiceover, intelligentes Timing und Untertitel verwendet", en: "Used for voiceover, intelligent timing, and subtitles", es: "Se utiliza para voz en off, temporización inteligente y subtítulos" })}</span>
                      </div>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="ai-music" className="mt-4">
                  <AIMusicSuggester
                    onSelect={(music) => {
                      toast.success(tx({ de: `Musik ausgewählt: ${music.name}`, en: `Music selected: ${music.name}`, es: `Música seleccionada: ${music.name}` }));
                      // Handle music selection
                    }}
                  />
                </TabsContent>
              </Tabs>

              {/* Action Button */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {tx({ de: 'Geschätzte Kosten:', en: 'Estimated cost:', es: 'Coste estimado:' })} <Badge variant="secondary">{50} Credits</Badge>
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={!isValid || loading || polling}
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {tx({ de: 'Erstelle Video...', en: 'Creating video...', es: 'Creando video...' })}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {tx({ de: "Video erstellen", en: "Create video", es: "Crear video" })}
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
                <h3 className="font-semibold text-lg">{tx({ de: "Dein Video wird erstellt", en: "Your video is being created", es: "Tu video se está creando" })}</h3>
                <p className="text-sm text-muted-foreground">
                  {tx({ de: "Dies kann einige Minuten dauern. Du kannst das Fenster schließen und später zurückkommen.", en: "This may take a few minutes. You can close the window and come back later.", es: "Esto puede tardar unos minutos. Puedes cerrar la ventana y volver más tarde." })}
                </p>
                {polling && (
                  <Badge variant="secondary">{tx({ de: "Rendering läuft...", en: "Rendering in progress...", es: "Renderizando..." })}</Badge>
                )}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
