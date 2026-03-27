import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Sparkles, CreditCard, History, Loader2, ImagePlus, X, Upload } from 'lucide-react';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { AIVideoCreditPurchase } from '@/components/ai-video/AIVideoCreditPurchase';
import { VideoGenerationHistory } from '@/components/ai-video/VideoGenerationHistory';
import { VideoPromptOptimizer } from '@/components/ai-video/VideoPromptOptimizer';
import { AI_VIDEO_PRICING, AI_VIDEO_MODELS, AIVideoModel } from '@/config/aiVideoCredits';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { canUseAIVideoGeneration } from '@/lib/entitlements';
import { PlanId, Currency } from '@/config/pricing';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { detectUserCurrency, formatPrice } from '@/lib/currency';

export default function AIVideoStudio() {
  const { user } = useAuth();
  const { wallet, loading: walletLoading, refetch: refetchWallet } = useAIVideoWallet();
  const [generating, setGenerating] = useState(false);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('generate');
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
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get currency from wallet or detect from browser
  const currency: Currency = wallet?.currency || detectUserCurrency();
  const costPerSecond = AI_VIDEO_MODELS[model].costPerSecond[currency];
  const cost = duration * costPerSecond;
  const canAfford = wallet && wallet.balance_euros >= cost;

  // Check entitlement
  const { data: userWallet } = useQuery({
    queryKey: ['user-wallet', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('wallets')
        .select('plan_code')
        .eq('user_id', user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  // Handle payment success
  useEffect(() => {
    const payment = searchParams.get('payment');
    const sessionId = searchParams.get('session_id');

    if (payment === 'success' && sessionId) {
      // Verify purchase
      supabase.functions.invoke('ai-video-verify-purchase', {
        body: { sessionId }
      }).then(({ data, error }) => {
        if (error) {
          toast.error('Fehler bei der Verifizierung');
        } else {
          toast.success('Credits erfolgreich hinzugefügt!');
          refetchWallet();
        }
      });
    } else if (payment === 'canceled') {
      toast.info('Kauf abgebrochen');
    }
  }, [searchParams, refetchWallet]);

  const handleRetryGeneration = (params: {
    prompt: string;
    model: string;
    duration: number;
  }) => {
    setPrompt(params.prompt);
    setModel(params.model as AIVideoModel);
    setDuration(params.duration as 4 | 8 | 12);
    setActiveTab('generate');
  };

  // Image upload handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Bitte wähle eine Bilddatei (PNG, JPG)');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Bild darf maximal 10MB groß sein');
      return;
    }

    setUploadingImage(true);
    setReferenceImage(file);

    try {
      // Show local preview immediately
      const previewUrl = URL.createObjectURL(file);
      setReferenceImageUrl(previewUrl);

      // Upload to Supabase Storage
      const fileName = `${user!.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { data, error } = await supabase.storage
        .from('ai-video-reference')
        .upload(fileName, file);

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('ai-video-reference')
        .getPublicUrl(fileName);

      // Revoke local preview URL and set actual URL
      URL.revokeObjectURL(previewUrl);
      setReferenceImageUrl(publicUrl);
      toast.success('Referenzbild hochgeladen');
    } catch (error: any) {
      console.error('Image upload error:', error);
      toast.error('Fehler beim Hochladen: ' + (error.message || 'Unbekannter Fehler'));
      setReferenceImage(null);
      setReferenceImageUrl(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    if (referenceImageUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(referenceImageUrl);
    }
    setReferenceImage(null);
    setReferenceImageUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Bitte gib eine Beschreibung ein');
      return;
    }

    if (!canAfford) {
      toast.error('Nicht genug Credits. Bitte kaufe Credits.');
      return;
    }

    setGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-ai-video', {
        body: {
          prompt,
          model,
          duration,
          aspectRatio,
          resolution,
          imageUrl: referenceImageUrl, // Image-to-Video support
        }
      });

      if (error) throw error;

      const modeLabel = referenceImageUrl ? 'Image-to-Video' : 'Text-to-Video';
      toast.success(`${modeLabel} wird generiert! Kosten: ${data.cost.toFixed(2)}€`);
      setPrompt('');
      handleRemoveImage(); // Clear image after generation
      refetchWallet();
      setActiveTab('history');
    } catch (error: any) {
      console.error('Generation error:', error);

      let status: number | undefined;
      let serverError: string | undefined;
      let code: string | undefined;
      let needsPurchase = false;

      // Prüfen, ob error.context ein Response-Objekt ist
      if (error?.context && typeof error.context === 'object' && 'status' in error.context) {
        const response = error.context as Response;
        status = response.status;

        try {
          // Response-Body als JSON parsen
          const responseData = await response.json();
          console.log('Parsed response data:', responseData);
          
          serverError = responseData.error;
          code = responseData.code;
          needsPurchase = responseData.needsPurchase || false;
        } catch (jsonError) {
          console.error('Failed to parse response JSON:', jsonError);
          // Fallback: Wenn JSON-Parsing fehlschlägt
          serverError = error?.message;
        }
      } else {
        // Fallback für alte Error-Struktur (sollte nicht mehr auftreten)
        status = error?.status;
        serverError = error?.message;
      }

      console.log('Extracted error details:', { status, serverError, code, needsPurchase });

      // Handle 503 Service Unavailable (Replicate/Sora Pro down)
      if (status === 503) {
        if (code === 'SORA_PRO_UNAVAILABLE') {
          toast.error(
            serverError ??
              'Sora 2 Pro ist aktuell nicht verfügbar. Deine Credits wurden automatisch zurückerstattet. Bitte versuche es später erneut oder nutze Sora 2 Standard.'
          );
        } else {
          toast.error(
            serverError ??
              'Der Videoanbieter ist aktuell nicht verfügbar. Deine Credits wurden automatisch zurückerstattet. Bitte versuche es später erneut.'
          );
        }
      } else if (
        status === 402 &&
        (needsPurchase || code === 'INSUFFICIENT_CREDITS' || code === 'NO_WALLET')
      ) {
        toast.error(serverError ?? 'Nicht genug Credits. Bitte kaufe Credits.');
      } else if (status === 429) {
        toast.error(serverError ?? 'Rate Limit überschritten. Bitte warte eine Stunde.');
      } else if (serverError) {
        toast.error(serverError);
      } else {
        toast.error('Fehler beim Generieren. Bitte später erneut versuchen.');
      }
    } finally {
      setGenerating(false);
    }
  };

  if (!canUseAIVideoGeneration(userWallet?.plan_code as PlanId)) {
    return (
      <>
        <Helmet>
          <title>AI Video Studio | Upgrade erforderlich</title>
        </Helmet>
        <div className="container mx-auto p-8">
          <Card className="p-12 text-center">
            <Sparkles className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">AI Video Generation</h2>
            <p className="text-muted-foreground mb-6">
              Dieses Feature ist nur für Pro und Enterprise Nutzer verfügbar.
            </p>
            <Link to="/settings/plan">
              <Button>Jetzt upgraden</Button>
            </Link>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>AI Video Studio | Sora 2 Video Generation</title>
        <meta 
          name="description" 
          content="Generiere professionelle KI-Videos mit Sora 2. Erstelle Videos bis zu 30 Sekunden mit höchster Qualität." 
        />
      </Helmet>
      <div className="container mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Sparkles className="w-8 h-8" />
            AI Video Studio
          </h1>
          <p className="text-muted-foreground mt-2">
            Generiere professionelle Videos mit Sora 2
          </p>
        </div>

        <div className="mb-6">
          <Card className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Dein Guthaben</p>
              <p className="text-2xl font-bold">
                {walletLoading ? '...' : formatPrice(wallet?.balance_euros || 0, currency)}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href="#purchase">
                <CreditCard className="w-4 h-4 mr-2" />
                Credits kaufen
              </a>
            </Button>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="generate">
              <Sparkles className="w-4 h-4 mr-2" />
              Generieren
            </TabsTrigger>
            <TabsTrigger value="purchase" id="purchase">
              <CreditCard className="w-4 h-4 mr-2" />
              Credits kaufen
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="w-4 h-4 mr-2" />
              Verlauf
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-6">
            <Card className="p-6">
              <div className="space-y-6">
                {/* Prompt */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">
                      Video-Beschreibung
                    </label>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowPromptOptimizer(true)}
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      Prompt optimieren
                    </Button>
                  </div>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Beschreibe das Video, das du generieren möchtest..."
                rows={4}
                className="resize-none"
              />
              
              {/* Warnung zu komplexen Prompts */}
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                  <span className="text-blue-500">ℹ️</span>
                  <span>
                    <strong>Hinweis:</strong> Umso komplexer Ihr Prompt ist, desto kürzer kann das generierte Video ausfallen. 
                    Sora 2 ist derzeit in der Beta-Phase und liefert nicht immer die volle angeforderte Dauer. 
                    Für beste Ergebnisse verwenden Sie klare, fokussierte Beschreibungen.
                  </span>
                </p>
              </div>
            </div>

                {/* Reference Image (Image-to-Video) */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Referenzbild (Optional)
                  </label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Lade ein Bild hoch, das als Startpunkt für dein Video dient (Image-to-Video)
                  </p>

                  {!referenceImageUrl ? (
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-all"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add('border-primary', 'bg-accent/50');
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove('border-primary', 'bg-accent/50');
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-primary', 'bg-accent/50');
                        const file = e.dataTransfer.files[0];
                        if (file) {
                          const input = fileInputRef.current;
                          if (input) {
                            const dt = new DataTransfer();
                            dt.items.add(file);
                            input.files = dt.files;
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                          }
                        }
                      }}
                    >
                      {uploadingImage ? (
                        <Loader2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground animate-spin" />
                      ) : (
                        <ImagePlus className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      )}
                      <p className="text-sm text-muted-foreground">
                        {uploadingImage ? 'Wird hochgeladen...' : 'Klicke zum Hochladen oder ziehe ein Bild hierher'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PNG, JPG bis 10MB
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={uploadingImage}
                      />
                    </div>
                  ) : (
                    <div className="relative rounded-lg overflow-hidden border border-border">
                      <img
                        src={referenceImageUrl}
                        alt="Referenzbild"
                        className="w-full max-h-48 object-contain bg-muted"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={handleRemoveImage}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Badge className="absolute bottom-2 left-2 bg-primary/90" variant="default">
                        <ImagePlus className="w-3 h-3 mr-1" />
                        Image-to-Video aktiv
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Model Selection */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Model
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.keys(AI_VIDEO_MODELS) as AIVideoModel[]).map((modelKey) => {
                      const modelInfo = AI_VIDEO_MODELS[modelKey];
                      return (
                        <Card
                          key={modelKey}
                          className={`p-4 cursor-pointer transition-all ${
                            model === modelKey ? 'ring-2 ring-primary' : 'hover:bg-accent'
                          }`}
                          onClick={() => setModel(modelKey)}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold">{modelInfo.name}</h3>
                            <Badge variant={model === modelKey ? 'default' : 'secondary'}>
                              {modelInfo.badge}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {modelInfo.description}
                          </p>
                          <p className="text-xs font-medium">
                            {formatPrice(modelInfo.costPerSecond[currency], currency)}/Sek
                          </p>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Video-Dauer
                  </label>
                  <div className="flex gap-3">
                    {([4, 8, 12] as const).map((seconds) => (
                      <Button
                        key={seconds}
                        variant={duration === seconds ? 'default' : 'outline'}
                        onClick={() => setDuration(seconds)}
                        className="flex-1"
                      >
                        <div className="text-center">
                          <div className="font-semibold">{seconds}s</div>
                          <div className="text-xs opacity-80">
                            {formatPrice(seconds * costPerSecond, currency)}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                  <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      ℹ️ Sora 2 ist in der Beta-Phase und unterstützt aktuell nur Videos von 4, 8 oder 12 Sekunden Länge.
                    </p>
                  </div>
                </div>

                {/* Aspect Ratio */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Seitenverhältnis
                  </label>
                  <div className="flex gap-2">
                    {(['16:9', '9:16', '1:1'] as const).map((ratio) => (
                      <Button
                        key={ratio}
                        variant={aspectRatio === ratio ? 'default' : 'outline'}
                        onClick={() => setAspectRatio(ratio)}
                        size="sm"
                      >
                        {ratio}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Cost Display */}
                <Card className="p-4 bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Kosten</p>
                      <p className="text-xl font-bold">{formatPrice(cost, currency)}</p>
                    </div>
                    <Badge variant={canAfford ? 'default' : 'destructive'}>
                      {canAfford ? 'Ausreichend Credits' : 'Nicht genug Credits'}
                    </Badge>
                  </div>
                </Card>

                {/* Generate Button */}
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleGenerate}
                  disabled={generating || !canAfford || !prompt.trim()}
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Wird generiert...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Video generieren
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="purchase">
            <AIVideoCreditPurchase />
          </TabsContent>

          <TabsContent value="history">
            <VideoGenerationHistory onRetryGeneration={handleRetryGeneration} />
          </TabsContent>
        </Tabs>

        {/* Prompt Optimizer Dialog */}
        <VideoPromptOptimizer
          open={showPromptOptimizer}
          onClose={() => setShowPromptOptimizer(false)}
          onPromptGenerated={(optimizedPrompt) => {
            setPrompt(optimizedPrompt);
            setShowPromptOptimizer(false);
          }}
        />
      </div>
    </>
  );
}
