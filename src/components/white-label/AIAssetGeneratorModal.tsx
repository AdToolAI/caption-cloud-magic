import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Wand2, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type AssetType = 'logo' | 'favicon' | 'login_background';

interface AIAssetGeneratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetType: AssetType;
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  onGenerated: (imageUrl: string) => void;
}

const STYLES = [
  { id: 'minimalist', label: 'Minimalistisch', description: 'Klar & einfach' },
  { id: 'modern', label: 'Modern', description: 'Zeitgemäß & trendy' },
  { id: 'corporate', label: 'Corporate', description: 'Professionell & seriös' },
  { id: 'creative', label: 'Kreativ', description: 'Einzigartig & auffällig' },
  { id: 'elegant', label: 'Elegant', description: 'Luxuriös & raffiniert' },
];

const ASSET_LABELS: Record<AssetType, string> = {
  logo: 'Logo',
  favicon: 'Favicon',
  login_background: 'Login-Hintergrund',
};

const PROMPT_SUGGESTIONS: Record<AssetType, string[]> = {
  logo: [
    'Ein abstraktes Symbol das Wachstum darstellt',
    'Geometrische Formen mit Gold-Akzenten',
    'Ein modernes Monogramm',
    'Minimalistisches Tech-Symbol',
  ],
  favicon: [
    'Ein einzelner Buchstabe im modernen Stil',
    'Ein einfaches geometrisches Symbol',
    'Ein abstraktes Icon',
  ],
  login_background: [
    'Abstrakte dunkle Wellen mit goldenen Highlights',
    'Geometrisches Muster mit Farbverlauf',
    'Futuristischer Cityscape bei Nacht',
    'Elegante Partikel und Lichteffekte',
  ],
};

export function AIAssetGeneratorModal({
  open,
  onOpenChange,
  assetType,
  brandName,
  primaryColor,
  secondaryColor,
  onGenerated,
}: AIAssetGeneratorModalProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('modern');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedImage(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-brand-asset', {
        body: {
          assetType,
          prompt: prompt || undefined,
          style: STYLES.find(s => s.id === selectedStyle)?.label,
          brandName,
          primaryColor,
          secondaryColor,
        },
      });

      if (error) throw error;
      
      if (data.error) {
        toast.error(data.error);
        return;
      }

      setGeneratedImage(data.imageUrl);
      toast.success('Asset generiert!');
    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error(error.message || 'Generierung fehlgeschlagen');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (generatedImage) {
      onGenerated(generatedImage);
      onOpenChange(false);
      setGeneratedImage(null);
      setPrompt('');
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setGeneratedImage(null);
    setPrompt('');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl bg-card/95 backdrop-blur-xl border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            {ASSET_LABELS[assetType]} mit KI generieren
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Brand Info Display */}
          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border border-white/5">
            <div className="flex gap-2">
              <div 
                className="w-6 h-6 rounded-full border-2 border-white/20"
                style={{ backgroundColor: primaryColor }}
              />
              <div 
                className="w-6 h-6 rounded-full border-2 border-white/20"
                style={{ backgroundColor: secondaryColor }}
              />
            </div>
            <span className="text-sm text-muted-foreground">
              Marke: <span className="text-foreground font-medium">{brandName || 'Nicht angegeben'}</span>
            </span>
          </div>

          {/* Style Selection */}
          <div className="space-y-3">
            <Label>Stil wählen</Label>
            <div className="grid grid-cols-5 gap-2">
              {STYLES.map((style) => (
                <motion.button
                  key={style.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`p-3 rounded-lg border text-center transition-all ${
                    selectedStyle === style.id
                      ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(245,199,106,0.2)]'
                      : 'border-white/10 bg-muted/20 hover:border-white/20'
                  }`}
                >
                  <div className="text-sm font-medium">{style.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{style.description}</div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Prompt Input */}
          <div className="space-y-3">
            <Label>Beschreibung (optional)</Label>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Beschreibe dein ${ASSET_LABELS[assetType]}...`}
              className="bg-muted/20 border-white/10 focus:border-primary/60"
            />
            
            {/* Prompt Suggestions */}
            <div className="flex flex-wrap gap-2">
              {PROMPT_SUGGESTIONS[assetType].map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => setPrompt(suggestion)}
                  className="text-xs px-3 py-1.5 rounded-full bg-muted/30 border border-white/10 hover:border-primary/40 hover:bg-primary/10 transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Generated Image Preview */}
          <AnimatePresence mode="wait">
            {isGenerating && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center justify-center p-8 rounded-xl bg-muted/20 border border-white/10"
              >
                <div className="relative">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <div className="absolute inset-0 blur-xl bg-primary/30 animate-pulse" />
                </div>
                <p className="mt-4 text-sm text-muted-foreground">Generiere {ASSET_LABELS[assetType]}...</p>
              </motion.div>
            )}

            {!isGenerating && generatedImage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-muted/20">
                  <img
                    src={generatedImage}
                    alt="Generated asset"
                    className={`w-full object-contain ${
                      assetType === 'login_background' ? 'h-48' : 'h-40'
                    }`}
                  />
                  <div className="absolute top-2 right-2">
                    <div className="px-2 py-1 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 text-xs flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Generiert
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1 border-white/10 hover:bg-muted/30"
            >
              Abbrechen
            </Button>
            
            {generatedImage ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="border-white/10 hover:bg-muted/30"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Neu generieren
                </Button>
                <Button
                  onClick={handleApply}
                  className="flex-1 bg-gradient-to-r from-primary to-amber-500 text-primary-foreground hover:opacity-90"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Übernehmen
                </Button>
              </>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex-1 bg-gradient-to-r from-primary to-amber-500 text-primary-foreground hover:opacity-90"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Generieren
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
