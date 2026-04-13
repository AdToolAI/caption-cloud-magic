import { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, CreditCard, History, Loader2, ImagePlus, X, Upload, FolderOpen, Video, Film, Wand2, Clapperboard, Eye, Camera } from 'lucide-react';
import { AlbumImagePicker } from '@/components/media-library/AlbumImagePicker';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { AIVideoCreditPurchase } from '@/components/ai-video/AIVideoCreditPurchase';
import { VideoGenerationHistory } from '@/components/ai-video/VideoGenerationHistory';
import { VideoPromptOptimizer } from '@/components/ai-video/VideoPromptOptimizer';
import { AIVideoProviderCard } from '@/components/ai-video/AIVideoProviderCard';
import { AIVideoDisclaimer } from '@/components/ai-video/AIVideoDisclaimer';
import { AI_VIDEO_PRICING, AI_VIDEO_MODELS, AIVideoModel } from '@/config/aiVideoCredits';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { canUseAIVideoGeneration } from '@/lib/entitlements';
import { PlanId, Currency } from '@/config/pricing';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { detectUserCurrency, formatPrice, getCurrencyForLanguage } from '@/lib/currency';
import { useTranslation } from '@/hooks/useTranslation';

/* ── Floating particles (James Bond 2028) ── */
const particles = [
  { x: '10%', y: '20%', size: 4, delay: 0, dur: 6 },
  { x: '85%', y: '15%', size: 3, delay: 1.2, dur: 7 },
  { x: '70%', y: '75%', size: 5, delay: 0.5, dur: 8 },
  { x: '25%', y: '80%', size: 3, delay: 2, dur: 6.5 },
  { x: '50%', y: '10%', size: 4, delay: 0.8, dur: 7.5 },
  { x: '90%', y: '50%', size: 3, delay: 1.5, dur: 6 },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.09, delayChildren: 0.3 } },
};

export default function AIVideoStudio() {
  const { user } = useAuth();
  const { language, t } = useTranslation();
  const { wallet, loading: walletLoading, refetch: refetchWallet } = useAIVideoWallet();
  const [generating, setGenerating] = useState(false);
  const [hasActiveGeneration, setHasActiveGeneration] = useState(false);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('studios');
  const [showPromptOptimizer, setShowPromptOptimizer] = useState(false);

  // Generation parameters — persisted via sessionStorage
  const [prompt, setPrompt] = useState(() => sessionStorage.getItem('ai-video-prompt') || '');
  const [model, setModel] = useState<AIVideoModel>(() => (sessionStorage.getItem('ai-video-model') as AIVideoModel) || 'sora-2-standard');
  const [duration, setDuration] = useState<4 | 8 | 12>(() => (Number(sessionStorage.getItem('ai-video-duration')) || 4) as 4 | 8 | 12);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>(() => (sessionStorage.getItem('ai-video-aspect') as '16:9' | '9:16' | '1:1') || '16:9');
  const [resolution, setResolution] = useState<'1080p' | '720p'>(() => (sessionStorage.getItem('ai-video-resolution') as '1080p' | '720p') || '1080p');

  // Sync to sessionStorage
  useEffect(() => { sessionStorage.setItem('ai-video-prompt', prompt); }, [prompt]);
  useEffect(() => { sessionStorage.setItem('ai-video-model', model); }, [model]);
  useEffect(() => { sessionStorage.setItem('ai-video-duration', String(duration)); }, [duration]);
  useEffect(() => { sessionStorage.setItem('ai-video-aspect', aspectRatio); }, [aspectRatio]);
  useEffect(() => { sessionStorage.setItem('ai-video-resolution', resolution); }, [resolution]);

  // Image-to-Video state
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currency: Currency = getCurrencyForLanguage(language);
  const costPerSecond = AI_VIDEO_MODELS[model].costPerSecond[currency];
  const cost = duration * costPerSecond;
  const canAfford = wallet && wallet.balance_euros >= cost;

  // Check entitlement
  const { data: userWallet } = useQuery({
    queryKey: ['user-wallet', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('wallets').select('plan_code').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  // Handle payment success
  useEffect(() => {
    const payment = searchParams.get('payment');
    const sessionId = searchParams.get('session_id');
    if (payment === 'success' && sessionId) {
      supabase.functions.invoke('ai-video-verify-purchase', { body: { sessionId } }).then(({ data, error }) => {
        if (error) toast.error(t('aiVid.verifyError'));
        else { toast.success(t('aiVid.creditsAdded')); refetchWallet(); }
      });
    } else if (payment === 'canceled') {
      toast.info(t('aiVid.purchaseCanceled'));
    }
  }, [searchParams, refetchWallet]);

  // Track active generations
  const { data: activeGenerations } = useQuery({
    queryKey: ['active-ai-generations', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from('ai_video_generations').select('id, status').eq('user_id', user.id).in('status', ['pending', 'processing']);
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  useEffect(() => { setHasActiveGeneration((activeGenerations?.length ?? 0) > 0 || generating); }, [activeGenerations, generating]);

  useEffect(() => {
    if (!hasActiveGeneration) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasActiveGeneration]);

  useEffect(() => {
    return () => { if (hasActiveGeneration) toast.info(t('aiVid.bgGenerationToast'), { duration: 8000 }); };
  }, [hasActiveGeneration]);

  const handleTabChange = useCallback((newTab: string) => {
    if (hasActiveGeneration && activeTab === 'generate' && newTab !== 'generate') {
      toast.info(t('aiVid.bgContinueToast'), { duration: 5000 });
    }
    setActiveTab(newTab);
  }, [hasActiveGeneration, activeTab]);

  const handleRetryGeneration = (params: { prompt: string; model: string; duration: number }) => {
    setPrompt(params.prompt);
    setModel(params.model as AIVideoModel);
    setDuration(params.duration as 4 | 8 | 12);
    setActiveTab('generate');
  };

  // Image upload handler
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
      console.error('Image upload error:', error);
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
        body: { prompt, model, duration, aspectRatio, resolution, imageUrl: referenceImageUrl }
      });
      if (error) throw error;
      const modeLabel = referenceImageUrl ? 'Image-to-Video' : 'Text-to-Video';
      toast.success(t('aiVid.generatingCost', { mode: modeLabel, cost: formatPrice(data.cost, currency) }));
      setPrompt('');
      sessionStorage.removeItem('ai-video-prompt');
      handleRemoveImage();
      refetchWallet();
      setActiveTab('history');
    } catch (error: any) {
      console.error('Generation error:', error);
      let status: number | undefined;
      let serverError: string | undefined;
      let code: string | undefined;
      let needsPurchase = false;
      if (error?.context && typeof error.context === 'object' && 'status' in error.context) {
        const response = error.context as Response;
        status = response.status;
        try {
          const responseData = await response.json();
          serverError = responseData.error;
          code = responseData.code;
          needsPurchase = responseData.needsPurchase || false;
        } catch { serverError = error?.message; }
      } else {
        status = error?.status;
        serverError = error?.message;
      }
      if (status === 503) {
        toast.error(code === 'SORA_PRO_UNAVAILABLE' ? (serverError ?? t('aiVid.soraProUnavailable')) : (serverError ?? t('aiVid.providerUnavailable')));
      } else if (status === 402 && (needsPurchase || code === 'INSUFFICIENT_CREDITS' || code === 'NO_WALLET')) {
        toast.error(serverError ?? t('aiVid.notEnoughCredits'));
      } else if (status === 429) {
        toast.error(serverError ?? t('aiVid.rateLimitExceeded'));
      } else if (serverError) {
        toast.error(serverError);
      } else {
        toast.error(t('aiVid.generationError'));
      }
    } finally {
      setGenerating(false);
    }
  };

  // Provider card data
  const currSymbol = currency === 'USD' ? '$' : '€';
  const providers = [
    {
      name: 'Sora 2',
      provider: 'OpenAI',
      description: language === 'de' ? 'Kinematische Storytelling-Videos mit erstklassiger visueller Qualität' : 'Cinematic storytelling with top-tier visual quality',
      features: ['Text-to-Video', 'Image-to-Video', '1080p', '4K-ready'],
      pricing: `${currSymbol}0.25–0.53/s`,
      maxDuration: '12s',
      quality: '1080p',
      link: '#',
      icon: Sparkles,
      tab: 'generate',
    },
    {
      name: 'Kling 3.0',
      provider: 'Kuaishou',
      description: language === 'de' ? 'Realistische Bewegungen, Audio-Generierung & Video-zu-Video' : 'Realistic motion, audio generation & video-to-video',
      features: ['Text-to-Video', 'Image-to-Video', 'Video-to-Video', 'Audio'],
      pricing: `${currSymbol}0.10–0.21/s`,
      maxDuration: '10s',
      quality: '1080p',
      link: '/kling-video-studio',
      icon: Film,
    },
    {
      name: 'Seedance 2.0',
      provider: 'ByteDance',
      description: language === 'de' ? 'Kreative Tanzvideos & dynamische Bewegungsszenen' : 'Creative dance videos & dynamic motion scenes',
      features: ['Text-to-Video', 'Image-to-Video', 'Dance Motion'],
      pricing: `${currSymbol}0.10–0.21/s`,
      maxDuration: '10s',
      quality: '720p',
      link: '/seedance-video-studio',
      icon: Video,
    },
    {
      name: 'Wan 2.5',
      provider: 'Wan Video',
      description: language === 'de' ? 'Schnelle Generierung mit gutem Preis-Leistungs-Verhältnis' : 'Fast generation with excellent price-performance ratio',
      features: ['Text-to-Video', 'Image-to-Video', 'Budget-friendly'],
      pricing: `${currSymbol}0.10–0.15/s`,
      maxDuration: '10s',
      quality: '720p',
      link: '/wan-video-studio',
      icon: Wand2,
    },
    {
      name: 'Hailuo 2.3',
      provider: 'MiniMax',
      description: language === 'de' ? 'Realistische Gesichter, Bewegung & Charaktere' : 'Realistic faces, motion & characters',
      features: ['Text-to-Video', 'Image-to-Video', '1080p', 'Realistic Motion'],
      pricing: `${currSymbol}0.15–0.20/s`,
      maxDuration: '10s',
      quality: '1080p',
      link: '/hailuo-video-studio',
      icon: Eye,
    },
    {
      name: 'Luma Ray 2',
      provider: 'Luma AI',
      description: language === 'de' ? 'Cinematic Szenen, surreale & künstlerische Projekte' : 'Cinematic scenes, surreal & artistic projects',
      features: ['Text-to-Video', 'Image-to-Video', 'Camera Concepts', 'Loop'],
      pricing: `${currSymbol}0.18–0.25/s`,
      maxDuration: '9s',
      quality: '720p',
      link: '/luma-video-studio',
      icon: Camera,
    },
  ];

  if (!canUseAIVideoGeneration(userWallet?.plan_code as PlanId)) {
    return (
      <>
        <Helmet><title>AI Video Studio | {t('aiVid.upgradeRequired')}</title></Helmet>
        <div className="container mx-auto p-8">
          <Card className="p-12 text-center">
            <Sparkles className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">AI Video Generation</h2>
            <p className="text-muted-foreground mb-6">{t('aiVid.upgradeMessage')}</p>
            <Link to="/settings/plan"><Button>{t('aiVid.upgradeNow')}</Button></Link>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>AI Video Studio | Professional AI Video Generation</title>
        <meta name="description" content={t('aiVid.metaDesc')} />
      </Helmet>

      <div className="relative p-6 md:p-10 max-w-6xl mx-auto overflow-hidden">
        {/* ── Hub shimmer CSS ── */}
        <style>{`
          @keyframes shimmer-border {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          @keyframes pulse-bg {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.05); }
          }
          @keyframes glow-ring {
            0%, 100% { box-shadow: 0 0 20px hsla(43,90%,68%,0.3), 0 0 40px hsla(187,84%,55%,0.15); }
            50% { box-shadow: 0 0 30px hsla(43,90%,68%,0.5), 0 0 60px hsla(187,84%,55%,0.25); }
          }
          .hub-card-shimmer { position: relative; }
          .hub-card-shimmer::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 1rem;
            padding: 1px;
            background: linear-gradient(90deg, transparent 0%, hsla(43,90%,68%,0.4) 25%, hsla(187,84%,55%,0.4) 50%, hsla(43,90%,68%,0.4) 75%, transparent 100%);
            background-size: 200% 100%;
            animation: shimmer-border 3s linear infinite;
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            pointer-events: none;
            opacity: 0.5;
            transition: opacity 0.3s;
          }
          .hub-card-shimmer:hover::before { opacity: 1; }
        `}</style>

        {/* ── Background glow ── */}
        <div className="absolute inset-0 pointer-events-none -z-10">
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at 30% 20%, hsla(43,90%,68%,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, hsla(187,84%,55%,0.05) 0%, transparent 50%)',
            animation: 'pulse-bg 6s ease-in-out infinite',
          }} />
        </div>

        {/* ── Floating particles ── */}
        {particles.map((p, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full pointer-events-none -z-10"
            style={{ left: p.x, top: p.y, width: p.size, height: p.size, background: i % 2 === 0 ? 'hsla(43,90%,68%,0.5)' : 'hsla(187,84%,55%,0.5)' }}
            animate={{ y: [0, -20, 0, 15, 0], x: [0, 10, -10, 5, 0], opacity: [0.3, 0.7, 0.4, 0.8, 0.3] }}
            transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}

        {/* ── Hero Header ── */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-8">
          <div className="flex items-center gap-5 mb-4">
            <div className="p-4 rounded-2xl bg-card border border-border" style={{ animation: 'glow-ring 3s ease-in-out infinite' }}>
              <Clapperboard className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1
                className="text-3xl md:text-4xl font-bold font-heading tracking-tight"
                style={{ background: 'linear-gradient(135deg, hsl(43 90% 68%), hsl(187 84% 55%))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
              >
                AI Video Studio
              </h1>
              <p className="text-muted-foreground mt-1 text-sm md:text-base">
                {language === 'de' ? '6 KI-Modelle. Endlose kreative Möglichkeiten.' : language === 'es' ? '6 modelos de IA. Posibilidades creativas infinitas.' : '6 AI models. Endless creative possibilities.'}
              </p>
            </div>
            {/* Wallet Badge */}
            <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-xl bg-card/60 backdrop-blur-sm border border-border">
              <CreditCard className="w-4 h-4 text-primary" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('aiVid.yourBalance')}</p>
                <p className="text-sm font-bold">{walletLoading ? '...' : formatPrice(wallet?.balance_euros || 0, currency)}</p>
              </div>
            </div>
          </div>

          {/* Animated divider */}
          <div className="h-px w-full overflow-hidden">
            <motion.div
              className="h-full"
              style={{ background: 'linear-gradient(90deg, hsla(43,90%,68%,0.6), hsla(187,84%,55%,0.6), transparent)', transformOrigin: 'left' }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
            />
          </div>
        </motion.div>

        {/* ── Main Tabs ── */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-card/60 backdrop-blur-sm border border-border">
            <TabsTrigger value="studios">
              <Film className="w-4 h-4 mr-2" />
              Studios
            </TabsTrigger>
            <TabsTrigger value="generate">
              <Sparkles className="w-4 h-4 mr-2" />
              Sora 2
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="w-4 h-4 mr-2" />
              {t('aiVid.tabHistory')}
            </TabsTrigger>
            <TabsTrigger value="purchase" id="purchase">
              <CreditCard className="w-4 h-4 mr-2" />
              {t('aiVid.tabCredits')}
            </TabsTrigger>
          </TabsList>

          {/* ── TAB: Studios Overview ── */}
          <TabsContent value="studios" className="space-y-6">
            {/* Disclaimer */}
            <AIVideoDisclaimer />

            {/* Provider Grid */}
            <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {providers.map((p, idx) => {
                const cardLink = p.tab === 'generate' ? '#' : p.link;
                return (
                  <div key={p.name} onClick={() => { if (p.tab === 'generate') setActiveTab('generate'); }}>
                    <AIVideoProviderCard
                      {...p}
                      index={idx}
                      link={cardLink}
                    />
                  </div>
                );
              })}
            </motion.div>
          </TabsContent>

          {/* ── TAB: Sora 2 Generate ── */}
          <TabsContent value="generate" className="space-y-6">
            <Card className="p-6">
              <div className="space-y-6">
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

                {/* Model Selection */}
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
                  <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-md">
                    <p className="text-xs text-muted-foreground">{t('aiVid.durationBetaNote')}</p>
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

                {/* Cost Display */}
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

                {/* Generate Button */}
                <Button className="w-full" size="lg" onClick={handleGenerate} disabled={generating || !canAfford || !prompt.trim()}>
                  {generating ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('aiVid.generating')}</>) : (<><Sparkles className="w-4 h-4 mr-2" />{t('aiVid.generateVideo')}</>)}
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* ── TAB: History (All Providers) ── */}
          <TabsContent value="history">
            <VideoGenerationHistory onRetryGeneration={handleRetryGeneration} />
          </TabsContent>

          {/* ── TAB: Credits ── */}
          <TabsContent value="purchase">
            <AIVideoCreditPurchase />
          </TabsContent>
        </Tabs>

        <VideoPromptOptimizer
          open={showPromptOptimizer}
          onClose={() => setShowPromptOptimizer(false)}
          onPromptGenerated={(optimizedPrompt) => { setPrompt(optimizedPrompt); setShowPromptOptimizer(false); }}
        />
      </div>
    </>
  );
}
