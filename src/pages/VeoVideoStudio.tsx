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
import { Sparkles, CreditCard, History, Loader2, ImagePlus, X, Upload, ArrowLeft, Wand2, Clock, Volume2 } from 'lucide-react';
import { VideoPromptOptimizer } from '@/components/ai-video/VideoPromptOptimizer';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { AIVideoCreditPurchase } from '@/components/ai-video/AIVideoCreditPurchase';
import { VideoGenerationHistory } from '@/components/ai-video/VideoGenerationHistory';
import { VEO_VIDEO_MODELS, VeoVideoModel, VeoAspectRatio } from '@/config/veoVideoCredits';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useSearchParams, Link } from 'react-router-dom';
import { getCurrencyForLanguage } from '@/lib/currency';
import { useTranslation } from '@/hooks/useTranslation';
import { Currency } from '@/config/pricing';

export default function VeoVideoStudio() {
  const { user } = useAuth();
  const { language } = useTranslation();
  const { wallet, loading: walletLoading, refetch: refetchWallet } = useAIVideoWallet();
  const [generating, setGenerating] = useState(false);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('generate');

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [model, setModel] = useState<VeoVideoModel>('veo-3.1-lite');
  const [duration, setDuration] = useState(4);
  const [aspectRatio, setAspectRatio] = useState<VeoAspectRatio>('16:9');
  const [generateAudio, setGenerateAudio] = useState(true);

  const [startImageUrl, setStartImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const startImageRef = useRef<HTMLInputElement>(null);

  const [showPromptOptimizer, setShowPromptOptimizer] = useState(false);

  const currency: Currency = getCurrencyForLanguage(language);
  const modelConfig = VEO_VIDEO_MODELS[model];
  const costPerSecond = modelConfig.costPerSecond[currency];
  const cost = duration * costPerSecond;
  const canAfford = wallet && wallet.balance_euros >= cost;
  const currencySymbol = currency === 'USD' ? '$' : '€';

  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      toast.success(language === 'de' ? 'Credits erfolgreich gekauft!' : 'Credits purchased successfully!');
      refetchWallet();
    }
  }, [searchParams]);

  const uploadFile = async (file: File): Promise<string | null> => {
    if (!user) return null;
    const ext = file.name.split('.').pop();
    const path = `${user.id}/veo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('ai-video-reference').upload(path, file, { upsert: true });
    if (error) {
      toast.error(language === 'de' ? 'Upload fehlgeschlagen' : 'Upload failed');
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
      toast.error(language === 'de' ? 'Nicht genügend Credits' : 'Insufficient credits');
      setActiveTab('credits');
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-veo-video', {
        body: {
          prompt: prompt.trim(),
          model,
          duration,
          aspectRatio,
          startImageUrl,
          generateAudio,
          negativePrompt: negativePrompt.trim() || undefined,
        },
      });

      if (error) throw error;
      if (data?.error) {
        if (data.code === 'INSUFFICIENT_CREDITS' || data.code === 'NO_WALLET') {
          setActiveTab('credits');
        }
        throw new Error(data.error);
      }

      toast.success(
        (language === 'de' ? 'Veo 3.1 Video wird generiert! Kosten: ' : 'Veo 3.1 video generating! Cost: ') +
        `${currencySymbol}${cost.toFixed(2)}`
      );
      refetchWallet();
      setActiveTab('history');
    } catch (err: any) {
      toast.error(err.message || (language === 'de' ? 'Fehler bei der Videogenerierung' : 'Generation failed'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Veo 3.1 Lite Studio | Native Audio Video Generation</title>
        <meta name="description" content="Generate AI videos with native audio using Google Veo 3.1 Lite — sound effects, music, and visuals in one pass." />
      </Helmet>

      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Veo 3.1 Lite Studio</h1>
              <Badge variant="default" className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
                <Volume2 className="h-3 w-3 mr-1" />Native Audio
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              {language === 'de'
                ? 'Video + Sound + Sprache in einem Pass — Google Veo 3.1'
                : 'Video + sound + speech in one pass — Google Veo 3.1'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/ai-video-studio">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                AI Video Studio
              </Button>
            </Link>
            {wallet && (
              <Badge variant="outline" className="text-base px-3 py-1">
                {currencySymbol}{wallet.balance_euros.toFixed(2)}
              </Badge>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="generate"><Sparkles className="h-4 w-4 mr-1" />{language === 'de' ? 'Generieren' : 'Generate'}</TabsTrigger>
            <TabsTrigger value="credits"><CreditCard className="h-4 w-4 mr-1" />Credits</TabsTrigger>
            <TabsTrigger value="history"><History className="h-4 w-4 mr-1" />{language === 'de' ? 'Verlauf' : 'History'}</TabsTrigger>
          </TabsList>

          <TabsContent value="generate">
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="space-y-5">
                {/* Prompt */}
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Prompt</Label>
                    <Button variant="outline" size="sm" onClick={() => setShowPromptOptimizer(true)} className="h-7 text-xs">
                      <Wand2 className="h-3 w-3 mr-1" />✨ {language === 'de' ? 'Optimieren' : 'Optimize'}
                    </Button>
                  </div>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="A glass shattering on a marble floor with crystal clarity, slow motion, golden hour studio lighting"
                    className="min-h-[100px]"
                    maxLength={2000}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{prompt.length}/2000</p>
                  <div className="mt-2 p-3 rounded-md bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20">
                    <p className="text-xs text-foreground">
                      🎵 <strong>{language === 'de' ? 'Audio-Native:' : 'Audio-Native:'}</strong>{' '}
                      {language === 'de'
                        ? 'Beschreibe Geräusche direkt im Prompt (z. B. „glass shattering“, „rain on metal roof“, „woman whispers hello“) — Veo erzeugt Sound automatisch.'
                        : 'Describe sounds directly in the prompt (e.g. "glass shattering", "rain on metal roof", "woman whispers hello") — Veo generates audio automatically.'}
                    </p>
                  </div>
                </Card>

                {/* Audio toggle */}
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-primary" />
                      <div>
                        <Label className="text-sm font-medium">{language === 'de' ? 'Audio generieren' : 'Generate audio'}</Label>
                        <p className="text-xs text-muted-foreground">{language === 'de' ? 'Sound, Stimme & Effekte aus dem Prompt' : 'Sound, speech & FX from the prompt'}</p>
                      </div>
                    </div>
                    <Switch checked={generateAudio} onCheckedChange={setGenerateAudio} />
                  </div>
                </Card>

                {/* Negative Prompt */}
                <Card className="p-4">
                  <Label className="text-sm font-medium mb-2 block">
                    {language === 'de' ? 'Negativer Prompt (optional)' : 'Negative Prompt (optional)'}
                  </Label>
                  <Textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder={language === 'de' ? 'z. B. blurry, low quality, distorted faces' : 'e.g. blurry, low quality, distorted faces'}
                    className="min-h-[60px]"
                    maxLength={500}
                  />
                </Card>

                {/* Model */}
                <Card className="p-4">
                  <Label className="text-sm font-medium mb-3 block">{language === 'de' ? 'Modell' : 'Model'}</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.entries(VEO_VIDEO_MODELS) as [VeoVideoModel, typeof VEO_VIDEO_MODELS[VeoVideoModel]][]).map(([key, m]) => (
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
                        <p className="text-xs text-muted-foreground">{m.quality} • {currencySymbol}{m.costPerSecond[currency].toFixed(2)}/s</p>
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Duration */}
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />{language === 'de' ? 'Dauer' : 'Duration'}
                    </Label>
                    <span className="text-sm font-semibold text-primary">{currencySymbol}{cost.toFixed(2)}</span>
                  </div>
                  <ToggleGroup
                    type="single"
                    value={String(duration)}
                    onValueChange={(v) => v && setDuration(Number(v))}
                    className="w-full"
                  >
                    {[4, 6, 8].map(d => (
                      <ToggleGroupItem
                        key={d}
                        value={String(d)}
                        className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                      >
                        {d}s
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Card>

                {/* Aspect ratio */}
                <Card className="p-4">
                  <Label className="text-sm font-medium mb-3 block">{language === 'de' ? 'Seitenverhältnis' : 'Aspect Ratio'}</Label>
                  <div className="flex gap-2">
                    {(['16:9', '9:16'] as VeoAspectRatio[]).map((ar) => (
                      <Button
                        key={ar}
                        variant={aspectRatio === ar ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setAspectRatio(ar)}
                      >
                        {ar === '16:9' ? '🖥️ 16:9' : '📱 9:16'}
                      </Button>
                    ))}
                  </div>
                </Card>

                {/* Image-to-Video */}
                <Card className="p-4">
                  <Label className="text-sm font-medium mb-3 block">
                    <ImagePlus className="h-4 w-4 inline mr-1" />Image-to-Video (optional)
                  </Label>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">{language === 'de' ? 'Startbild hochladen' : 'Upload start image'}</p>
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
                        {language === 'de' ? 'Bild hochladen' : 'Upload image'}
                      </Button>
                    )}
                    <input ref={startImageRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
                  </div>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <Card className="p-4 sticky top-4">
                  <h3 className="font-semibold mb-3">{language === 'de' ? 'Zusammenfassung' : 'Summary'}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === 'de' ? 'Modell' : 'Model'}</span>
                      <span>{modelConfig.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === 'de' ? 'Qualität' : 'Quality'}</span>
                      <span>{modelConfig.quality}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === 'de' ? 'Dauer' : 'Duration'}</span>
                      <span>{duration}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === 'de' ? 'Format' : 'Format'}</span>
                      <span>{aspectRatio}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Audio</span>
                      <span>{generateAudio ? '🎵 ON' : 'OFF'}</span>
                    </div>
                    {startImageUrl && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{language === 'de' ? 'Modus' : 'Mode'}</span>
                        <span>Image-to-Video</span>
                      </div>
                    )}
                    <hr className="my-2" />
                    <div className="flex justify-between font-semibold text-base">
                      <span>{language === 'de' ? 'Kosten' : 'Cost'}</span>
                      <span className="text-primary">{currencySymbol}{cost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{language === 'de' ? 'Guthaben' : 'Balance'}</span>
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
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />{language === 'de' ? 'Generiere...' : 'Generating...'}</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" />{language === 'de' ? 'Video generieren' : 'Generate video'}</>
                    )}
                  </Button>

                  {!canAfford && !walletLoading && (
                    <p className="text-xs text-destructive mt-2 text-center">
                      {language === 'de' ? 'Nicht genügend Credits.' : 'Insufficient credits.'}{' '}
                      <button className="underline" onClick={() => setActiveTab('credits')}>
                        {language === 'de' ? 'Credits kaufen' : 'Buy credits'}
                      </button>
                    </p>
                  )}
                </Card>

                <Card className="p-4">
                  <h4 className="font-medium text-sm mb-2">{language === 'de' ? 'Preisübersicht' : 'Pricing'}</h4>
                  <div className="text-xs space-y-1 text-muted-foreground">
                    <div className="flex justify-between"><span>Lite 4s</span><span>{currencySymbol}1.60</span></div>
                    <div className="flex justify-between"><span>Lite 8s</span><span>{currencySymbol}3.20</span></div>
                    <hr className="my-1" />
                    <div className="flex justify-between"><span>Pro 4s</span><span>{currencySymbol}2.60</span></div>
                    <div className="flex justify-between"><span>Pro 8s</span><span>{currencySymbol}5.20</span></div>
                  </div>
                </Card>

                <Card className="p-4 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
                  <h4 className="font-medium text-sm mb-2">⚖️ Legal</h4>
                  <p className="text-xs text-muted-foreground">
                    {language === 'de'
                      ? 'Veo-Videos enthalten ein unsichtbares SynthID-Watermark von Google. Audio-Generierung ist experimentell.'
                      : 'Veo videos contain an invisible Google SynthID watermark. Audio generation is experimental.'}
                  </p>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="credits">
            <AIVideoCreditPurchase />
          </TabsContent>

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
