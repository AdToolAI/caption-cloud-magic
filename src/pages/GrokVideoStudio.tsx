import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Sparkles, CreditCard, History, Loader2, ImagePlus, X, Upload, ArrowLeft, Wand2, Clock, Volume2, TrendingUp } from 'lucide-react';
import { VideoPromptOptimizer } from '@/components/ai-video/VideoPromptOptimizer';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { AIVideoCreditPurchase } from '@/components/ai-video/AIVideoCreditPurchase';
import { VideoGenerationHistory } from '@/components/ai-video/VideoGenerationHistory';
import { GROK_VIDEO_MODELS, GrokVideoModel, GrokAspectRatio } from '@/config/grokVideoCredits';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useSearchParams, Link } from 'react-router-dom';
import { getCurrencyForLanguage } from '@/lib/currency';
import { useTranslation } from '@/hooks/useTranslation';
import { Currency } from '@/config/pricing';

export default function GrokVideoStudio() {
  const { user } = useAuth();
  const { language } = useTranslation();
  const { wallet, loading: walletLoading, refetch: refetchWallet } = useAIVideoWallet();
  const [generating, setGenerating] = useState(false);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('generate');

  const [prompt, setPrompt] = useState('');
  const [model] = useState<GrokVideoModel>('grok-imagine');
  const [duration, setDuration] = useState(6);
  const [aspectRatio, setAspectRatio] = useState<GrokAspectRatio>('16:9');
  const [enableAudio, setEnableAudio] = useState(true);

  const [startImageUrl, setStartImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const startImageRef = useRef<HTMLInputElement>(null);

  const [showPromptOptimizer, setShowPromptOptimizer] = useState(false);

  const currency: Currency = getCurrencyForLanguage(language);
  const modelConfig = GROK_VIDEO_MODELS[model];
  const costPerSecond = modelConfig.costPerSecond[currency];
  const cost = duration * costPerSecond;
  const canAfford = wallet && wallet.balance_euros >= cost;
  const currencySymbol = currency === 'USD' ? '$' : '€';

  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      toast.success('Credits erfolgreich gekauft!');
      refetchWallet();
    }
  }, [searchParams]);

  const uploadFile = async (file: File): Promise<string | null> => {
    if (!user) return null;
    const ext = file.name.split('.').pop();
    const path = `${user.id}/grok-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('ai-video-reference').upload(path, file, { upsert: true });
    if (error) {
      toast.error('Upload fehlgeschlagen');
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from('ai-video-reference').getPublicUrl(path);
    return publicUrl;
  };

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true);
    const url = await uploadFile(file);
    if (url) setStartImageUrl(url);
    setUploadingImage(false);
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
      const { data, error } = await supabase.functions.invoke('generate-grok-video', {
        body: { prompt: prompt.trim(), model, duration, aspectRatio, startImageUrl, enableAudio },
      });
      if (error) throw error;
      if (data?.error) {
        if (data.code === 'INSUFFICIENT_CREDITS' || data.code === 'NO_WALLET') setActiveTab('credits');
        if (data.code === 'MODEL_UNAVAILABLE') {
          toast.info('Grok Imagine ist auf Replicate noch nicht öffentlich verfügbar. Wir aktivieren es, sobald xAI den Endpoint freigibt.');
        }
        throw new Error(data.error);
      }
      toast.success(`Grok Imagine Video wird generiert! Kosten: ${currencySymbol}${cost.toFixed(2)}`);
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
        <title>Grok Imagine Studio | AI Video Generator</title>
        <meta name="description" content="Generate trending AI videos with xAI Grok Imagine - native audio, viral-ready output" />
      </Helmet>

      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Grok Imagine Studio</h1>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                <TrendingUp className="h-3 w-3 mr-1" />Trending
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              xAI Grok Imagine • 6 oder 12 Sekunden • Native Audio
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/ai-video-studio">
              <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />AI Video Studio</Button>
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

          <TabsContent value="generate">
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="space-y-5">
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
                    placeholder="A futuristic cyberpunk city at night with neon lights reflecting off wet streets, dynamic camera movement"
                    className="min-h-[100px]"
                    maxLength={2000}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{prompt.length}/2000</p>
                  <div className="mt-2 p-2 rounded-md bg-muted/50 border border-border/50">
                    <p className="text-xs text-muted-foreground">
                      💡 <strong>Tipp:</strong> Grok Imagine ist optimiert für virale, dynamische Inhalte mit nativer Audio-Spur. Nutze englische Prompts mit klaren Action-Verben.
                    </p>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-medium flex items-center gap-1.5"><Clock className="h-4 w-4" />Dauer</Label>
                    <span className="text-sm font-semibold text-primary">{currencySymbol}{cost.toFixed(2)}</span>
                  </div>
                  <ToggleGroup type="single" value={String(duration)} onValueChange={(v) => v && setDuration(Number(v))} className="w-full">
                    <ToggleGroupItem value="6" className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">6 Sekunden</ToggleGroupItem>
                    <ToggleGroupItem value="12" className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">12 Sekunden</ToggleGroupItem>
                  </ToggleGroup>
                </Card>

                <Card className="p-4">
                  <Label className="text-sm font-medium mb-3 block">Seitenverhältnis</Label>
                  <div className="flex gap-2">
                    {(['16:9', '9:16', '1:1'] as GrokAspectRatio[]).map((ar) => (
                      <Button key={ar} variant={aspectRatio === ar ? 'default' : 'outline'} size="sm" onClick={() => setAspectRatio(ar)}>
                        {ar === '16:9' ? '🖥️ 16:9' : ar === '9:16' ? '📱 9:16' : '⬜ 1:1'}
                      </Button>
                    ))}
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Volume2 className="h-4 w-4" />Native Audio
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Grok generiert passende Soundeffekte und Atmosphäre
                      </p>
                    </div>
                    <Switch checked={enableAudio} onCheckedChange={setEnableAudio} />
                  </div>
                </Card>

                <Card className="p-4">
                  <Label className="text-sm font-medium mb-3 block">
                    <ImagePlus className="h-4 w-4 inline mr-1" />Image-to-Video (optional)
                  </Label>
                  {startImageUrl ? (
                    <div className="relative">
                      <img src={startImageUrl} alt="Start" className="w-full h-32 object-cover rounded-lg" />
                      <Button size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6" onClick={() => setStartImageUrl(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => startImageRef.current?.click()} disabled={uploadingImage}>
                      {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                      Bild hochladen
                    </Button>
                  )}
                  <input ref={startImageRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
                </Card>
              </div>

              <div className="space-y-4">
                <Card className="p-4 sticky top-4">
                  <h3 className="font-semibold mb-3">Zusammenfassung</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Modell</span><span>{modelConfig.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Qualität</span><span>{modelConfig.quality}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Dauer</span><span>{duration}s</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Format</span><span>{aspectRatio}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Audio</span><span>{enableAudio ? 'An' : 'Aus'}</span></div>
                    {startImageUrl && <div className="flex justify-between"><span className="text-muted-foreground">Modus</span><span>Image-to-Video</span></div>}
                    <hr className="my-2" />
                    <div className="flex justify-between font-semibold text-base"><span>Kosten</span><span className="text-primary">{currencySymbol}{cost.toFixed(2)}</span></div>
                    <div className="flex justify-between text-xs text-muted-foreground"><span>Guthaben</span><span>{wallet ? `${currencySymbol}${wallet.balance_euros.toFixed(2)}` : '...'}</span></div>
                  </div>
                  <Button className="w-full mt-4" size="lg" onClick={handleGenerate} disabled={generating || !prompt.trim() || !canAfford || walletLoading}>
                    {generating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generiere...</> : <><Sparkles className="h-4 w-4 mr-2" />Video generieren</>}
                  </Button>
                  {!canAfford && !walletLoading && (
                    <p className="text-xs text-destructive mt-2 text-center">
                      Nicht genügend Credits.{' '}
                      <button className="underline" onClick={() => setActiveTab('credits')}>Credits kaufen</button>
                    </p>
                  )}
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="credits"><AIVideoCreditPurchase /></TabsContent>
          <TabsContent value="history"><VideoGenerationHistory /></TabsContent>
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
