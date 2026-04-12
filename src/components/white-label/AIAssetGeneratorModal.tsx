import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Wand2, Check, Palette } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";

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

export function AIAssetGeneratorModal({
  open,
  onOpenChange,
  assetType,
  brandName,
  primaryColor,
  secondaryColor,
  onGenerated,
}: AIAssetGeneratorModalProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('modern');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [customPrimaryColor, setCustomPrimaryColor] = useState(primaryColor);
  const [customSecondaryColor, setCustomSecondaryColor] = useState(secondaryColor);
  const [customBackgroundColor, setCustomBackgroundColor] = useState('#050816');

  const STYLES = useMemo(() => [
    { id: 'minimalist', label: t('wl.styleMinimalist'), description: t('wl.styleMinimalistDesc') },
    { id: 'modern', label: t('wl.styleModern'), description: t('wl.styleModernDesc') },
    { id: 'corporate', label: t('wl.styleCorporate'), description: t('wl.styleCorporateDesc') },
    { id: 'creative', label: t('wl.styleCreative'), description: t('wl.styleCreativeDesc') },
    { id: 'elegant', label: t('wl.styleElegant'), description: t('wl.styleElegantDesc') },
  ], [t]);

  const COLOR_PRESETS = useMemo(() => [
    { primary: '#F5C76A', secondary: '#1A1A2E', background: '#050816', name: t('wl.presetGoldDark') },
    { primary: '#22d3ee', secondary: '#0f172a', background: '#020617', name: t('wl.presetCyanNavy') },
    { primary: '#8B5CF6', secondary: '#1e1b4b', background: '#0c0a1d', name: t('wl.presetVioletIndigo') },
    { primary: '#10B981', secondary: '#064e3b', background: '#022c22', name: t('wl.presetEmerald') },
    { primary: '#F43F5E', secondary: '#1c1917', background: '#0a0a0a', name: t('wl.presetCoralBlack') },
    { primary: '#3B82F6', secondary: '#1e3a5f', background: '#0c1929', name: t('wl.presetBlueNavy') },
  ], [t]);

  const ASSET_LABELS: Record<AssetType, string> = useMemo(() => ({
    logo: t('wl.assetLogo'),
    favicon: t('wl.assetFavicon'),
    login_background: t('wl.assetLoginBg'),
  }), [t]);

  const PROMPT_SUGGESTIONS: Record<AssetType, string[]> = useMemo(() => ({
    logo: [
      t('wl.promptLogoAbstract'),
      t('wl.promptLogoGeo'),
      t('wl.promptLogoMono'),
      t('wl.promptLogoTech'),
    ],
    favicon: [
      t('wl.promptFaviconLetter'),
      t('wl.promptFaviconGeo'),
      t('wl.promptFaviconIcon'),
    ],
    login_background: [
      t('wl.promptBgWaves'),
      t('wl.promptBgPattern'),
      t('wl.promptBgCity'),
      t('wl.promptBgParticles'),
    ],
  }), [t]);

  useEffect(() => {
    if (open) {
      setCustomPrimaryColor(primaryColor);
      setCustomSecondaryColor(secondaryColor);
    }
  }, [open, primaryColor, secondaryColor]);

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
          primaryColor: customPrimaryColor,
          secondaryColor: customSecondaryColor,
          backgroundColor: customBackgroundColor,
        },
      });

      if (error) throw error;
      if (data.error) {
        toast.error(data.error);
        return;
      }

      setGeneratedImage(data.imageUrl);
      toast.success(t('wl.aiModalSuccess'));
    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error(error.message || t('wl.aiModalError'));
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-xl border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            {t('wl.aiModalTitle', { asset: ASSET_LABELS[assetType] })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Brand Info */}
          <div className="p-3 rounded-lg bg-muted/30 border border-white/5">
            <span className="text-sm text-muted-foreground">
              {t('wl.aiModalBrand')} <span className="text-foreground font-medium">{brandName || t('wl.aiModalBrandNotSet')}</span>
            </span>
          </div>

          {/* Color Selection */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary" />
              {t('wl.aiModalColorScheme')}
            </Label>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <label className="relative cursor-pointer group">
                  <div
                    className="w-10 h-10 rounded-full border-2 border-white/20 group-hover:border-primary/60 transition-all shadow-lg"
                    style={{ backgroundColor: customPrimaryColor }}
                  />
                  <input type="color" value={customPrimaryColor} onChange={(e) => setCustomPrimaryColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </label>
                <span className="text-xs text-muted-foreground">{t('wl.aiModalPrimary')}</span>
              </div>

              <div className="flex items-center gap-3">
                <label className="relative cursor-pointer group">
                  <div
                    className="w-10 h-10 rounded-full border-2 border-white/20 group-hover:border-primary/60 transition-all shadow-lg"
                    style={{ backgroundColor: customSecondaryColor }}
                  />
                  <input type="color" value={customSecondaryColor} onChange={(e) => setCustomSecondaryColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </label>
                <span className="text-xs text-muted-foreground">{t('wl.aiModalSecondary')}</span>
              </div>

              <div className="flex items-center gap-3">
                <label className="relative cursor-pointer group">
                  <div
                    className="w-10 h-10 rounded-full border-2 border-white/20 group-hover:border-primary/60 transition-all shadow-lg"
                    style={{ backgroundColor: customBackgroundColor }}
                  />
                  <input type="color" value={customBackgroundColor} onChange={(e) => setCustomBackgroundColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </label>
                <span className="text-xs text-muted-foreground">{t('wl.aiModalBackground')}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCustomPrimaryColor(preset.primary);
                    setCustomSecondaryColor(preset.secondary);
                    setCustomBackgroundColor(preset.background);
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all hover:border-primary/40 ${
                    customPrimaryColor === preset.primary && customSecondaryColor === preset.secondary && customBackgroundColor === preset.background
                      ? 'border-primary bg-primary/10'
                      : 'border-white/10 bg-muted/20'
                  }`}
                  title={preset.name}
                >
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.primary }} />
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.secondary }} />
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.background }} />
                </button>
              ))}
            </div>
          </div>

          {/* Style Selection */}
          <div className="space-y-3">
            <Label>{t('wl.aiModalStyleLabel')}</Label>
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
            <Label>{t('wl.aiModalDescLabel')}</Label>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('wl.aiModalDescPlaceholder', { asset: ASSET_LABELS[assetType] })}
              className="bg-muted/20 border-white/10 focus:border-primary/60"
            />

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
                <p className="mt-4 text-sm text-muted-foreground">{t('wl.aiModalGenerating', { asset: ASSET_LABELS[assetType] })}</p>
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
                    className={`w-full object-contain ${assetType === 'login_background' ? 'h-48' : 'h-40'}`}
                  />
                  <div className="absolute top-2 right-2">
                    <div className="px-2 py-1 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 text-xs flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      {t('wl.aiModalGenerated')}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={handleClose} className="flex-1 border-white/10 hover:bg-muted/30">
              {t('wl.aiModalCancelBtn')}
            </Button>

            {generatedImage ? (
              <>
                <Button variant="outline" onClick={handleGenerate} disabled={isGenerating} className="border-white/10 hover:bg-muted/30">
                  <Wand2 className="w-4 h-4 mr-2" />
                  {t('wl.aiModalRegenerateBtn')}
                </Button>
                <Button onClick={handleApply} className="flex-1 bg-gradient-to-r from-primary to-amber-500 text-primary-foreground hover:opacity-90">
                  <Check className="w-4 h-4 mr-2" />
                  {t('wl.aiModalApplyBtn')}
                </Button>
              </>
            ) : (
              <Button onClick={handleGenerate} disabled={isGenerating} className="flex-1 bg-gradient-to-r from-primary to-amber-500 text-primary-foreground hover:opacity-90">
                {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {t('wl.aiModalGenerateBtn')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
