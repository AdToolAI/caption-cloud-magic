import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Upload, Loader2, Wand2, Image as ImageIcon, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAICall } from "@/hooks/useAICall";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageCard } from "./ImageCard";
import { StudioLightbox } from "./StudioLightbox";
import { SaveToAlbumDialog } from "./SaveToAlbumDialog";
import { FEATURE_COSTS, ESTIMATED_COSTS } from "@/lib/featureCosts";

const STYLES = [
  { value: 'realistic', label: 'Realistisch' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'watercolor', label: 'Aquarell' },
  { value: 'neon-cyberpunk', label: 'Neon Cyberpunk' },
  { value: 'anime', label: 'Anime' },
  { value: 'oil-painting', label: 'Ölgemälde' },
  { value: 'pop-art', label: 'Pop Art' },
  { value: 'minimalist', label: 'Minimalistisch' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'product-photo', label: 'Produktfoto' },
  { value: 'abstract', label: 'Abstrakt' },
  { value: 'sketch', label: 'Bleistiftskizze' },
  { value: '3d-render', label: '3D Render' },
  { value: 'noir', label: 'Film Noir' },
  { value: 'pastel', label: 'Pastell' },
  { value: 'comic', label: 'Comic' },
  { value: 'surreal', label: 'Surreal' },
  { value: 'architectural', label: 'Architektur' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'brand-logo', label: 'Brand Logo' },
];

const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1 Quadrat' },
  { value: '16:9', label: '16:9 Landscape' },
  { value: '9:16', label: '9:16 Portrait' },
  { value: '4:5', label: '4:5 Instagram' },
  { value: '4:3', label: '4:3 Header' },
  { value: '3:4', label: '3:4 Vertikal' },
  { value: '2:1', label: '2:1 Banner' },
];

interface GeneratedImage {
  id?: string;
  url: string;
  prompt: string;
  style: string;
  aspectRatio: string;
}

export function ImageGenerator() {
  const { user } = useAuth();
  const { executeAICall, loading, status } = useAICall();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("realistic");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [quality, setQuality] = useState<'fast' | 'pro'>('fast');
  const [editMode, setEditMode] = useState(false);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  
  // Album save state
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false);
  const [selectedImageForAlbum, setSelectedImageForAlbum] = useState<GeneratedImage | null>(null);

  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setReferenceImage(reader.result as string);
      setEditMode(true);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Bitte gib einen Prompt ein");
      return;
    }
    if (!user) {
      toast.error("Bitte melde dich an");
      return;
    }

    try {
      const result = await executeAICall({
        featureCode: FEATURE_COSTS.STUDIO_IMAGE_GENERATE,
        estimatedCost: ESTIMATED_COSTS.studio_image_generate,
        apiCall: async () => {
          const { data, error } = await supabase.functions.invoke('generate-studio-image', {
            body: {
              prompt: prompt.trim(),
              style,
              aspectRatio,
              quality,
              editMode,
              referenceImageUrl: editMode ? referenceImage : undefined,
            }
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          return data;
        }
      });

      if (result?.image) {
        setGeneratedImages(prev => [
          { ...result.image, prompt: prompt.trim(), style, aspectRatio: aspectRatio },
          ...prev,
        ]);
        toast.success("Bild erfolgreich generiert! 🎨");
      }
    } catch (error: any) {
      if (error.code !== 'INSUFFICIENT_CREDITS') {
        toast.error(error.message || "Fehler bei der Bildgenerierung");
      }
    }
  };

  const handleSaveToAlbum = (image: GeneratedImage) => {
    if (!image.id) {
      toast.error("Dieses Bild hat keine ID — bitte warte bis es gespeichert ist.");
      return;
    }
    setSelectedImageForAlbum(image);
    setAlbumDialogOpen(true);
  };

  const handleImageSaved = () => {
    if (selectedImageForAlbum) {
      setGeneratedImages(prev => prev.filter(img => img.id !== selectedImageForAlbum.id));
      setSelectedImageForAlbum(null);
    }
  };

  const handleDeleteImage = async (image: any) => {
    if (!image.id) {
      setGeneratedImages(prev => prev.filter(img => img.url !== image.url));
      return;
    }
    try {
      // Delete from storage
      const url = new URL(image.url);
      const pathMatch = url.pathname.match(/\/object\/public\/background-projects\/(.+)/);
      if (pathMatch) {
        await supabase.storage.from('background-projects').remove([pathMatch[1]]);
      }
      // Delete from DB
      await supabase.from('studio_images').delete().eq('id', image.id);
      setGeneratedImages(prev => prev.filter(img => img.id !== image.id));
      toast.success("Bild gelöscht 🗑️");
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Löschen");
    }
  };

  return (
    <div className="space-y-6">
      {/* Generator Controls */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6 space-y-5">
          {/* Prompt */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              Prompt
            </Label>
            <Textarea
              placeholder="Beschreibe dein Bild... z.B. 'Ein futuristisches Büro mit Neonlichtern und einem eleganten Schreibtisch'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[100px] bg-background/50 border-border/50 resize-none"
            />
          </div>

          {/* Style + Aspect Ratio + Quality */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Style</Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STYLES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Seitenverhältnis</Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIOS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Qualität</Label>
              <div className="flex items-center gap-3 h-10">
                <span className={`text-sm ${quality === 'fast' ? 'text-foreground' : 'text-muted-foreground'}`}>Schnell</span>
                <Switch checked={quality === 'pro'} onCheckedChange={(v) => setQuality(v ? 'pro' : 'fast')} />
                <span className={`text-sm ${quality === 'pro' ? 'text-foreground' : 'text-muted-foreground'}`}>Pro</span>
              </div>
            </div>
          </div>

          {/* Image-to-Image */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={editMode} onCheckedChange={(v) => { setEditMode(v); if (!v) setReferenceImage(null); }} />
              <Label className="text-sm">Image-to-Image</Label>
            </div>
            {editMode && (
              <div className="flex items-center gap-2">
                {referenceImage ? (
                  <div className="relative">
                    <img src={referenceImage} className="h-12 w-12 rounded-md object-cover border border-border" alt="Reference" />
                    <button onClick={() => { setReferenceImage(null); }} className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5 mr-1" /> Bild hochladen
                  </Button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReferenceUpload} />
              </div>
            )}
          </div>

          {/* Generate Button */}
          <Button
            className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground"
            size="lg"
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {status.message || 'Generiere...'}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Bild generieren
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Images Gallery */}
      <AnimatePresence>
        {generatedImages.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              Generierte Bilder ({generatedImages.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <AnimatePresence>
                {generatedImages.map((img, i) => (
                  <ImageCard
                    key={img.id || img.url}
                    image={img}
                    index={i}
                    onSaveToAlbum={handleSaveToAlbum}
                    onOpenLightbox={setLightboxImage}
                    onDelete={handleDeleteImage}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save to Album Dialog */}
      {selectedImageForAlbum?.id && (
        <SaveToAlbumDialog
          open={albumDialogOpen}
          onOpenChange={setAlbumDialogOpen}
          imageId={selectedImageForAlbum.id}
          onSaved={handleImageSaved}
        />
      )}

      {/* Lightbox */}
      <StudioLightbox
        image={lightboxImage}
        open={!!lightboxImage}
        onOpenChange={(open) => !open && setLightboxImage(null)}
        onSaveToAlbum={handleSaveToAlbum}
        onDelete={handleDeleteImage}
      />
    </div>
  );
}
