import { useState, useRef, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowLeft, Loader2, ImagePlus, X, FolderOpen, CreditCard } from 'lucide-react';
import { AlbumImagePicker } from '@/components/media-library/AlbumImagePicker';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { VideoPromptOptimizer } from '@/components/ai-video/VideoPromptOptimizer';
import { AI_VIDEO_PRICING, AI_VIDEO_MODELS, AIVideoModel } from '@/config/aiVideoCredits';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useTranslation';
import { Currency } from '@/config/pricing';
import { formatPrice, getCurrencyForLanguage } from '@/lib/currency';
import { Sora2ComingSoonGate } from '@/components/sora2/Sora2ComingSoonGate';

export default function SoraVideoStudio() {
  return (
    <Sora2ComingSoonGate>
      <SoraVideoStudioInner />
    </Sora2ComingSoonGate>
  );
}

function SoraVideoStudioInner() {
  const { user } = useAuth();
  const { language, t } = useTranslation();
  const { wallet, loading: walletLoading, refetch: refetchWallet } = useAIVideoWallet();
  const [generating, setGenerating] = useState(false);
  const [showPromptOptimizer, setShowPromptOptimizer] = useState(false);

  const [prompt, setPrompt] = useState(() => sessionStorage.getItem('sora-video-prompt') || '');
  const [model, setModel] = useState<AIVideoModel>(() => (sessionStorage.getItem('sora-video-model') as AIVideoModel) || 'sora-2-standard');
  const [duration, setDuration] = useState<4 | 8 | 12>(() => (Number(sessionStorage.getItem('sora-video-duration')) || 4) as 4 | 8 | 12);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>(() => (sessionStorage.getItem('sora-video-aspect') as '16:9' | '9:16' | '1:1') || '16:9');

  useEffect(() => { sessionStorage.setItem('sora-video-prompt', prompt); }, [prompt]);
  useEffect(() => { sessionStorage.setItem('sora-video-model', model); }, [model]);
  useEffect(() => { sessionStorage.setItem('sora-video-duration', String(duration)); }, [duration]);
  useEffect(() => { sessionStorage.setItem('sora-video-aspect', aspectRatio); }, [aspectRatio]);

  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currency: Currency = getCurrencyForLanguage(language);
  const costPerSecond = AI_VIDEO_MODELS[model].costPerSecond[currency];
  const cost = duration * costPerSecond;
  const canAfford = wallet && wallet.balance_euros >= cost;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error(t('aiVid.imageFileOnly')); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t('aiVid.imageTooLarge')); return; }
    setUploadingImage(true);
    setReferenceImage(file);
    try {
      const previewUrl = URL.createObjectURL(file);
      setReferenceImageUrl(previewUrl);
      const fileName = `${user!.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { data, error } = await supabase.storage.from('ai-video-reference').upload(fileName, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('ai-video-reference').getPublicUrl(fileName);
      URL.revokeObjectURL(previewUrl);
      setReferenceImageUrl(publicUrl);
      toast.success(t('aiVid.referenceUploaded'));
    } catch (error: any) {
      toast.error(t('aiVid.uploadError') + (error.message || t('aiVid.unknownError')));
      setReferenceImage(null);
      setReferenceImageUrl(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    if (referenceImageUrl?.startsWith('blob:')) URL.revokeObjectURL(referenceImageUrl);
    setReferenceImage(null);
    setReferenceImageUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error(t('aiVid.enterDescription')); return; }
    if (!canAfford) { toast.error(t('aiVid.notEnoughCredits')); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-ai-video', {
        body: { prompt, model, duration, aspectRatio, resolution: '1080p', imageUrl: referenceImageUrl }
      });
      if (error) throw error;
      const modeLabel = referenceImageUrl ? 'Image-to-Video' : 'Text-to-Video';
      toast.success(t('aiVid.generatingCost', { mode: modeLabel, cost: formatPrice(data.cost, currency) }));
      setPrompt('');
      sessionStorage.removeItem('sora-video-prompt');
      handleRemoveImage();
      refetchWallet();
    } catch (error: any) {
      console.error('Generation error:', error);
      let serverError: string | undefined;
      try {
        if (error?.context && typeof error.context === 'object' && 'status' in error.context) {
          const response = error.context as Response;
          const responseData = await response.json();
          serverError = responseData.error;
        } else {
          serverError = error?.message;
        }
      } catch { serverError = error?.message; }
      toast.error(serverError || t('aiVid.generationError'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Sora 2 Video Studio | AI Video Generation</title>
        <meta name="description" content="Generate cinematic AI videos with OpenAI Sora 2" />
      </Helmet>

      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        {/* Back Link */}
        <Link to="/ai-video-studio" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          ← AI Video Studio
        </Link>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 rounded-xl bg-card border border-border">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold font-heading" style={{ background: 'linear-gradient(135deg, hsl(43 90% 68%), hsl(187 84% 55%))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Sora 2 Studio
              </h1>
              <p className="text-sm text-muted-foreground">OpenAI · {language === 'de' ? 'Kinematische Storytelling-Videos' : 'Cinematic storytelling videos'}</p>
            </div>
            <div className="ml-auto hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/60 border border-border">
              <CreditCard className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold">{walletLoading ? '...' : formatPrice(wallet?.balance_euros || 0, currency)}</span>
            </div>
          </div>
        </motion.div>

        {/* Generator */}
        <Card className="p-6 space-y-6">
          {/* Prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">{t('aiVid.videoDescription')}</label>
              <Button variant="outline" size="sm" onClick={() => setShowPromptOptimizer(true)}>
                <Sparkles className="w-3 h-3 mr-1" />
                {t('aiVid.optimizePrompt')}
              </Button>
            </div>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('aiVid.promptPlaceholder')} rows={4} className="resize-none" />
            <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-md">
              <p className="text-xs text-muted-foreground flex items-start gap-2">
                <span className="text-primary">ℹ️</span>
                <span><strong>{t('aiVid.promptHintTitle')}</strong> {t('aiVid.promptHint')}</span>
              </p>
            </div>
          </div>

          {/* Reference Image */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('aiVid.referenceImage')}</label>
            <p className="text-xs text-muted-foreground mb-3">{t('aiVid.referenceImageDesc')}</p>
            {!referenceImageUrl ? (
              <>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-all"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-accent/50'); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove('border-primary', 'bg-accent/50'); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-primary', 'bg-accent/50');
                    const file = e.dataTransfer.files[0];
                    if (file && fileInputRef.current) {
                      const dt = new DataTransfer();
                      dt.items.add(file);
                      fileInputRef.current.files = dt.files;
                      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                  }}
                >
                  {uploadingImage ? (
                    <Loader2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground animate-spin" />
                  ) : (
                    <ImagePlus className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  )}
                  <p className="text-sm text-muted-foreground">{uploadingImage ? t('aiVid.uploading') : t('aiVid.uploadOrDrag')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('aiVid.uploadLimit')}</p>
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                </div>
                <Button variant="outline" className="w-full mt-2" onClick={() => setAlbumPickerOpen(true)}>
                  <FolderOpen className="w-4 h-4 mr-2" />
                  {t('aiVid.chooseFromAlbums')}
                </Button>
              </>
            ) : (
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img src={referenceImageUrl} alt={t('aiVid.referenceImage')} className="w-full max-h-48 object-contain bg-muted" />
                <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={handleRemoveImage}>
                  <X className="w-4 h-4" />
                </Button>
                <Badge className="absolute bottom-2 left-2 bg-primary/90" variant="default">
                  <ImagePlus className="w-3 h-3 mr-1" />
                  {t('aiVid.imageToVideoActive')}
                </Badge>
              </div>
            )}
            <AlbumImagePicker open={albumPickerOpen} onOpenChange={setAlbumPickerOpen} onSelectImage={(url) => { setReferenceImageUrl(url); setReferenceImage(null); toast.success(t('aiVid.albumImageSelected')); }} />
          </div>

          {/* Model */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('aiVid.model')}</label>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(AI_VIDEO_MODELS) as AIVideoModel[]).map((modelKey) => {
                const modelInfo = AI_VIDEO_MODELS[modelKey];
                return (
                  <Card key={modelKey} className={`p-4 cursor-pointer transition-all ${model === modelKey ? 'ring-2 ring-primary' : 'hover:bg-accent'}`} onClick={() => setModel(modelKey)}>
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold">{modelInfo.name}</h3>
                      <Badge variant={model === modelKey ? 'default' : 'secondary'}>{modelInfo.badge}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{modelInfo.description}</p>
                    <p className="text-xs font-medium">{formatPrice(modelInfo.costPerSecond[currency], currency)}{t('aiVid.perSec')}</p>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('aiVid.videoDuration')}</label>
            <div className="flex gap-3">
              {([4, 8, 12] as const).map((seconds) => (
                <Button key={seconds} variant={duration === seconds ? 'default' : 'outline'} onClick={() => setDuration(seconds)} className="flex-1">
                  <div className="text-center">
                    <div className="font-semibold">{seconds}s</div>
                    <div className="text-xs opacity-80">{formatPrice(seconds * costPerSecond, currency)}</div>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('aiVid.aspectRatio')}</label>
            <div className="flex gap-2">
              {(['16:9', '9:16', '1:1'] as const).map((ratio) => (
                <Button key={ratio} variant={aspectRatio === ratio ? 'default' : 'outline'} onClick={() => setAspectRatio(ratio)} size="sm">{ratio}</Button>
              ))}
            </div>
          </div>

          {/* Cost */}
          <Card className="p-4 bg-muted/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('aiVid.cost')}</p>
                <p className="text-xl font-bold">{formatPrice(cost, currency)}</p>
              </div>
              <Badge variant={canAfford ? 'default' : 'destructive'}>
                {canAfford ? t('aiVid.sufficientCredits') : t('aiVid.insufficientCredits')}
              </Badge>
            </div>
          </Card>

          {/* Generate */}
          <Button className="w-full" size="lg" onClick={handleGenerate} disabled={generating || !canAfford || !prompt.trim()}>
            {generating ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('aiVid.generating')}</>) : (<><Sparkles className="w-4 h-4 mr-2" />{t('aiVid.generateVideo')}</>)}
          </Button>
        </Card>

        <VideoPromptOptimizer
          open={showPromptOptimizer}
          onClose={() => setShowPromptOptimizer(false)}
          onPromptGenerated={(optimizedPrompt) => { setPrompt(optimizedPrompt); setShowPromptOptimizer(false); }}
        />
      </div>
    </>
  );
}
