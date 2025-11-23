import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Sparkles, CreditCard, History, Loader2 } from 'lucide-react';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { AIVideoCreditPurchase } from '@/components/ai-video/AIVideoCreditPurchase';
import { VideoGenerationHistory } from '@/components/ai-video/VideoGenerationHistory';
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
  
  // Generation parameters
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<AIVideoModel>('sora-2-standard');
  const [duration, setDuration] = useState(10);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [resolution, setResolution] = useState<'1080p' | '720p'>('1080p');

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
        }
      });

      if (error) throw error;

      toast.success(`Video wird generiert! Kosten: ${data.cost.toFixed(2)}€`);
      setPrompt('');
      refetchWallet();
    } catch (error: any) {
      console.error('Generation error:', error);
      if (error.message?.includes('needsPurchase') || error.status === 402) {
        toast.error('Nicht genug Credits');
      } else if (error.status === 429) {
        toast.error('Rate Limit überschritten. Bitte warte eine Stunde.');
      } else {
        toast.error('Fehler beim Generieren');
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

        <Tabs defaultValue="generate" className="space-y-6">
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
                  <label className="text-sm font-medium mb-2 block">
                    Video-Beschreibung
                  </label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Beschreibe das Video, das du generieren möchtest..."
                    rows={4}
                    className="resize-none"
                  />
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
                    Dauer: {duration} Sekunden
                  </label>
                  <Slider
                    value={[duration]}
                    onValueChange={([v]) => setDuration(v)}
                    min={AI_VIDEO_PRICING.minDuration}
                    max={AI_VIDEO_PRICING.maxDuration}
                    step={1}
                  />
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
            <VideoGenerationHistory />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
