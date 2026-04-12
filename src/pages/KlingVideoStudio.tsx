import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sparkles, CreditCard, History, Loader2, ImagePlus, X, Upload, Video, ArrowLeft, Volume2, Wand2 } from 'lucide-react';
import { VideoPromptOptimizer } from '@/components/ai-video/VideoPromptOptimizer';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { AIVideoCreditPurchase } from '@/components/ai-video/AIVideoCreditPurchase';
import { VideoGenerationHistory } from '@/components/ai-video/VideoGenerationHistory';
import { KLING_VIDEO_MODELS, KlingVideoModel, KlingAspectRatio } from '@/config/klingVideoCredits';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useSearchParams, Link } from 'react-router-dom';
import { getCurrencyForLanguage, formatPrice } from '@/lib/currency';
import { useTranslation } from '@/hooks/useTranslation';
import { Currency } from '@/config/pricing';

export default function KlingVideoStudio() {
  const { user } = useAuth();
  const { language, t } = useTranslation();
  const { wallet, loading: walletLoading, refetch: refetchWallet } = useAIVideoWallet();
  const [generating, setGenerating] = useState(false);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('generate');

  // Generation parameters
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<KlingVideoModel>('kling-3-standard');
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<KlingAspectRatio>('16:9');
  const [generateAudio, setGenerateAudio] = useState(false);

  // Image-to-Video
  const [startImageUrl, setStartImageUrl] = useState<string | null>(null);
  const [endImageUrl, setEndImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const startImageRef = useRef<HTMLInputElement>(null);
  const endImageRef = useRef<HTMLInputElement>(null);

  // Video-to-Video
  const [referenceVideoUrl, setReferenceVideoUrl] = useState<string | null>(null);
  const [videoReferenceType, setVideoReferenceType] = useState<'feature' | 'base'>('feature');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoRef = useRef<HTMLInputElement>(null);
  const [showPromptOptimizer, setShowPromptOptimizer] = useState(false);

  const currency: Currency = getCurrencyForLanguage(language);
  const modelConfig = KLING_VIDEO_MODELS[model];
  const costPerSecond = modelConfig.costPerSecond[currency];
  const cost = duration * costPerSecond;
  const canAfford = wallet && wallet.balance_euros >= cost;
  const currencySymbol = currency === 'USD' ? '$' : '€';

  // Handle payment success
  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      toast.success('Credits erfolgreich gekauft!');
      refetchWallet();
    }
  }, [searchParams]);

  const uploadFile = async (file: File, type: 'image' | 'video'): Promise<string | null> => {
    if (!user) return null;
    const bucket = type === 'image' ? 'ai-video-reference' : 'ai-videos';
    const ext = file.name.split('.').pop();
    const path = `${user.id}/kling-${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) {
      toast.error('Upload fehlgeschlagen');
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
    return publicUrl;
  };

  const handleImageUpload = async (file: File, target: 'start' | 'end') => {
    setUploadingImage(true);
    const url = await uploadFile(file, 'image');
    if (url) {
      if (target === 'start') setStartImageUrl(url);
      else setEndImageUrl(url);
    }
    setUploadingImage(false);
  };

  const handleVideoUpload = async (file: File) => {
    setUploadingVideo(true);
    const url = await uploadFile(file, 'video');
    if (url) setReferenceVideoUrl(url);
    setUploadingVideo(false);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !user) return;
    if (!canAfford) {
      toast.error('Nicht genügend Credits');
      setActiveTab('credits');
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-kling-video', {
        body: {
          prompt: prompt.trim(),
          model,
          duration,
          aspectRatio,
          generateAudio,
          startImageUrl,
          endImageUrl,
          referenceVideoUrl,
          videoReferenceType: referenceVideoUrl ? videoReferenceType : undefined,
        },
      });

      if (error) throw error;
      if (data?.error) {
        if (data.code === 'INSUFFICIENT_CREDITS' || data.code === 'NO_WALLET') {
          setActiveTab('credits');
        }
        throw new Error(data.error);
      }

      toast.success(`Kling 3.0 Video wird generiert! Kosten: ${currencySymbol}${cost.toFixed(2)}`);
      refetchWallet();
      setActiveTab('history');
    } catch (err: any) {
      toast.error(err.message || 'Fehler bei der Videogenerierung');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Kling 3.0 Video Studio | AI Video Generator</title>
        <meta name="description" content="Generate AI videos with Kling 3.0 - Text-to-Video, Image-to-Video, and Video-to-Video" />
      </Helmet>

      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Kling 3.0 Video Studio</h1>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">Neu</Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Text-to-Video, Image-to-Video & Video-to-Video • 3–15 Sekunden • Native Audio
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/ai-video-studio">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Sora 2 Studio
              </Button>
            </Link>
            {wallet && (
              <Badge variant="outline" className="text-base px-3 py-1">
                {currencySymbol}{wallet.balance_euros.toFixed(2)} Credits
              </Badge>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="generate"><Sparkles className="h-4 w-4 mr-1" />Generieren</TabsTrigger>
            <TabsTrigger value="credits"><CreditCard className="h-4 w-4 mr-1" />Credits</TabsTrigger>
            <TabsTrigger value="history"><History className="h-4 w-4 mr-1" />Verlauf</TabsTrigger>
          </TabsList>

          {/* GENERATE TAB */}
          <TabsContent value="generate">
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              {/* Main form */}
              <div className="space-y-5">
                {/* Prompt */}
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Prompt</Label>
                    <Button variant="outline" size="sm" onClick={() => setShowPromptOptimizer(true)} className="h-7 text-xs">
                      <Wand2 className="h-3 w-3 mr-1" />✨ Prompt optimieren
                    </Button>
                  </div>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="A golden retriever running through autumn leaves in slow motion, cinematic dolly shot, warm golden hour lighting, 4K quality"
                    className="min-h-[100px]"
                    maxLength={2000}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{prompt.length}/2000</p>
                  <div className="mt-2 p-2 rounded-md bg-muted/50 border border-border/50">
                    <p className="text-xs text-muted-foreground">
                      💡 <strong>Tipp:</strong> Schreibe auf Englisch für beste Ergebnisse. Beschreibe Kamerabewegungen (zoom, pan, dolly, tracking shot) und Beleuchtung (golden hour, dramatic lighting). Vermeide abstrakte Anweisungen wie "erstelle ein Werbevideo".
                    </p>
                  </div>
                </Card>

                {/* Model Selection */}
                <Card className="p-4">
                  <Label className="text-sm font-medium mb-3 block">Modell</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.entries(KLING_VIDEO_MODELS) as [KlingVideoModel, typeof KLING_VIDEO_MODELS[KlingVideoModel]][]).map(([key, m]) => (
                      <button
                        key={key}
                        onClick={() => setModel(key)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          model === key
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{m.name}</span>
                          <Badge variant="outline" className="text-xs">{m.badge}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{m.quality} • {currencySymbol}{m.costPerSecond[currency].toFixed(2)}/Sek</p>
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Duration Slider */}
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-medium">Dauer: {duration} Sekunden</Label>
                    <span className="text-sm font-semibold text-primary">{currencySymbol}{cost.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[duration]}
                    onValueChange={([v]) => setDuration(v)}
                    min={3}
                    max={15}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>3s</span>
                    <span>15s</span>
                  </div>
                </Card>

                {/* Aspect Ratio */}
                <Card className="p-4">
                  <Label className="text-sm font-medium mb-3 block">Seitenverhältnis</Label>
                  <div className="flex gap-2">
                    {(['16:9', '9:16', '1:1'] as KlingAspectRatio[]).map((ar) => (
                      <Button
                        key={ar}
                        variant={aspectRatio === ar ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setAspectRatio(ar)}
                      >
                        {ar === '16:9' ? '🖥️ 16:9' : ar === '9:16' ? '📱 9:16' : '⬜ 1:1'}
                      </Button>
                    ))}
                  </div>
                </Card>

                {/* Audio Toggle */}
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">Native Audio generieren</Label>
                    </div>
                    <Switch checked={generateAudio} onCheckedChange={setGenerateAudio} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Kling generiert passende Soundeffekte zum Video</p>
                </Card>

                {/* Image-to-Video */}
                <Card className="p-4">
                  <Label className="text-sm font-medium mb-3 block">
                    <ImagePlus className="h-4 w-4 inline mr-1" />Image-to-Video (optional)
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Start Image */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Start-Frame</p>
                      {startImageUrl ? (
                        <div className="relative">
                          <img src={startImageUrl} alt="Start" className="w-full h-24 object-cover rounded-lg" />
                          <Button size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6" onClick={() => setStartImageUrl(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" className="w-full" onClick={() => startImageRef.current?.click()} disabled={uploadingImage}>
                          {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                          Upload
                        </Button>
                      )}
                      <input ref={startImageRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'start')} />
                    </div>
                    {/* End Image */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">End-Frame (optional)</p>
                      {endImageUrl ? (
                        <div className="relative">
                          <img src={endImageUrl} alt="End" className="w-full h-24 object-cover rounded-lg" />
                          <Button size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6" onClick={() => setEndImageUrl(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" className="w-full" onClick={() => endImageRef.current?.click()} disabled={uploadingImage}>
                          {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                          Upload
                        </Button>
                      )}
                      <input ref={endImageRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'end')} />
                    </div>
                  </div>
                </Card>

                {/* Video-to-Video */}
                <Card className="p-4">
                  <Label className="text-sm font-medium mb-3 block">
                    <Video className="h-4 w-4 inline mr-1" />Video-to-Video (optional)
                  </Label>
                  {referenceVideoUrl ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground truncate max-w-[200px]">Referenzvideo hochgeladen</span>
                        <Button size="sm" variant="destructive" onClick={() => setReferenceVideoUrl(null)}>
                          <X className="h-3 w-3 mr-1" />Entfernen
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant={videoReferenceType === 'feature' ? 'default' : 'outline'} onClick={() => setVideoReferenceType('feature')}>
                          Style Transfer
                        </Button>
                        <Button size="sm" variant={videoReferenceType === 'base' ? 'default' : 'outline'} onClick={() => setVideoReferenceType('base')}>
                          Video Editing
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => videoRef.current?.click()} disabled={uploadingVideo}>
                      {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                      Video hochladen
                    </Button>
                  )}
                  <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])} />
                </Card>
              </div>

              {/* Sidebar - Cost Summary */}
              <div className="space-y-4">
                <Card className="p-4 sticky top-4">
                  <h3 className="font-semibold mb-3">Zusammenfassung</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Modell</span>
                      <span>{KLING_VIDEO_MODELS[model].name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Qualität</span>
                      <span>{KLING_VIDEO_MODELS[model].quality}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dauer</span>
                      <span>{duration}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Format</span>
                      <span>{aspectRatio}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Audio</span>
                      <span>{generateAudio ? 'Ja' : 'Nein'}</span>
                    </div>
                    {startImageUrl && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Modus</span>
                        <span>Image-to-Video</span>
                      </div>
                    )}
                    {referenceVideoUrl && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Modus</span>
                        <span>Video-to-Video</span>
                      </div>
                    )}
                    <hr className="my-2" />
                    <div className="flex justify-between font-semibold text-base">
                      <span>Kosten</span>
                      <span className="text-primary">{currencySymbol}{cost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Guthaben</span>
                      <span>{wallet ? `${currencySymbol}${wallet.balance_euros.toFixed(2)}` : '...'}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full mt-4"
                    size="lg"
                    onClick={handleGenerate}
                    disabled={generating || !prompt.trim() || !canAfford || walletLoading}
                  >
                    {generating ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generiere...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" />Video generieren</>
                    )}
                  </Button>

                  {!canAfford && !walletLoading && (
                    <p className="text-xs text-destructive mt-2 text-center">
                      Nicht genügend Credits.{' '}
                      <button className="underline" onClick={() => setActiveTab('credits')}>Credits kaufen</button>
                    </p>
                  )}
                </Card>

                {/* Price table */}
                <Card className="p-4">
                  <h4 className="font-medium text-sm mb-2">Preisübersicht</h4>
                  <div className="text-xs space-y-1 text-muted-foreground">
                    <div className="flex justify-between"><span>Standard 5s</span><span>{currencySymbol}0.75</span></div>
                    <div className="flex justify-between"><span>Standard 10s</span><span>{currencySymbol}1.50</span></div>
                    <div className="flex justify-between"><span>Standard 15s</span><span>{currencySymbol}2.25</span></div>
                    <hr className="my-1" />
                    <div className="flex justify-between"><span>Pro 5s</span><span>{currencySymbol}1.00</span></div>
                    <div className="flex justify-between"><span>Pro 10s</span><span>{currencySymbol}2.00</span></div>
                    <div className="flex justify-between"><span>Pro 15s</span><span>{currencySymbol}3.00</span></div>
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* CREDITS TAB */}
          <TabsContent value="credits">
            <AIVideoCreditPurchase />
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history">
            <VideoGenerationHistory />
          </TabsContent>
        </Tabs>
      </div>

      <VideoPromptOptimizer
        open={showPromptOptimizer}
        onClose={() => setShowPromptOptimizer(false)}
        onPromptGenerated={(optimized) => setPrompt(optimized)}
      />
    </>
  );
}
