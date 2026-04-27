import { useEffect, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sparkles, CreditCard, History, Clapperboard, ShieldAlert, Wand2, Lock,
} from 'lucide-react';

import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/integrations/supabase/client';
import { canUseAIVideoGeneration } from '@/lib/entitlements';
import { PlanId, Currency } from '@/config/pricing';
import { formatPrice, getCurrencyForLanguage } from '@/lib/currency';
import { toast } from 'sonner';

import { ToolkitGenerator } from '@/components/ai-video/ToolkitGenerator';
import { AIVideoCreditPurchase } from '@/components/ai-video/AIVideoCreditPurchase';
import { VideoGenerationHistory } from '@/components/ai-video/VideoGenerationHistory';
import { AIVideoDisclaimer } from '@/components/ai-video/AIVideoDisclaimer';
import { FirstVideoGuide } from '@/components/ai-video/FirstVideoGuide';

const particles = [
  { x: '10%', y: '20%', size: 4, delay: 0,    dur: 6 },
  { x: '85%', y: '15%', size: 3, delay: 1.2,  dur: 7 },
  { x: '70%', y: '75%', size: 5, delay: 0.5,  dur: 8 },
  { x: '25%', y: '80%', size: 3, delay: 2,    dur: 6.5 },
  { x: '50%', y: '10%', size: 4, delay: 0.8,  dur: 7.5 },
  { x: '90%', y: '50%', size: 3, delay: 1.5,  dur: 6 },
];

export default function AIVideoToolkit() {
  const { user } = useAuth();
  const { language, t } = useTranslation();
  const { wallet, loading: walletLoading, refetch: refetchWallet } = useAIVideoWallet();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('generate');
  const currency: Currency = getCurrencyForLanguage(language);

  /* Plan gate */
  const { data: userWallet } = useQuery({
    queryKey: ['user-wallet', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('wallets').select('plan_code').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  /* Stripe purchase confirmation */
  useEffect(() => {
    const payment = searchParams.get('payment');
    const sessionId = searchParams.get('session_id');
    if (payment === 'success' && sessionId) {
      supabase.functions.invoke('ai-video-verify-purchase', { body: { sessionId } }).then(({ error }) => {
        if (error) toast.error(t('aiVid.verifyError'));
        else { toast.success(t('aiVid.creditsAdded')); refetchWallet(); }
      });
    } else if (payment === 'canceled') {
      toast.info(t('aiVid.purchaseCanceled'));
    }
  }, [searchParams, refetchWallet, t]);

  const handleAfterGenerate = useCallback(() => setActiveTab('history'), []);

  if (!canUseAIVideoGeneration(userWallet?.plan_code as PlanId)) {
    return (
      <>
        <Helmet><title>AI Video Toolkit | {t('aiVid.upgradeRequired')}</title></Helmet>
        <div className="container mx-auto p-8">
          <Card className="p-12 text-center">
            <Sparkles className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">AI Video Toolkit</h2>
            <p className="text-muted-foreground mb-6">{t('aiVid.upgradeMessage')}</p>
            <Link to="/settings/plan"><Button>{t('aiVid.upgradeNow')}</Button></Link>
          </Card>
        </div>
      </>
    );
  }

  const subtitle = language === 'de'
    ? 'Ein Prompt. Alle Top-Modelle. Wechsle Anbieter ohne Kontextwechsel.'
    : language === 'es'
    ? 'Un prompt. Todos los modelos top. Cambia de proveedor sin perder el contexto.'
    : 'One prompt. All top models. Switch providers without losing context.';

  return (
    <>
      <Helmet>
        <title>AI Video Toolkit | Unified AI Video Generation</title>
        <meta name="description" content={t('aiVid.metaDesc')} />
      </Helmet>

      <div className="relative p-6 md:p-10 max-w-5xl mx-auto overflow-hidden">
        <style>{`
          @keyframes pulse-bg { 0%,100%{opacity:.4;transform:scale(1)} 50%{opacity:.7;transform:scale(1.05)} }
          @keyframes glow-ring {
            0%,100% { box-shadow: 0 0 20px hsla(43,90%,68%,0.3), 0 0 40px hsla(187,84%,55%,0.15); }
            50%     { box-shadow: 0 0 30px hsla(43,90%,68%,0.5), 0 0 60px hsla(187,84%,55%,0.25); }
          }
        `}</style>

        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none -z-10">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 30% 20%, hsla(43,90%,68%,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, hsla(187,84%,55%,0.05) 0%, transparent 50%)',
              animation: 'pulse-bg 6s ease-in-out infinite',
            }}
          />
        </div>

        {/* Floating particles */}
        {particles.map((p, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full pointer-events-none -z-10"
            style={{
              left: p.x, top: p.y, width: p.size, height: p.size,
              background: i % 2 === 0 ? 'hsla(43,90%,68%,0.5)' : 'hsla(187,84%,55%,0.5)',
            }}
            animate={{ y: [0, -20, 0, 15, 0], x: [0, 10, -10, 5, 0], opacity: [0.3, 0.7, 0.4, 0.8, 0.3] }}
            transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}

        {/* Hero header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-8">
          <div className="flex items-center gap-5 mb-4">
            <div
              className="p-4 rounded-2xl bg-card border border-border"
              style={{ animation: 'glow-ring 3s ease-in-out infinite' }}
            >
              <Clapperboard className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1
                className="text-3xl md:text-4xl font-bold font-heading tracking-tight"
                style={{
                  background: 'linear-gradient(135deg, hsl(43 90% 68%), hsl(187 84% 55%))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                AI Video Toolkit
              </h1>
              <p className="text-muted-foreground mt-1 text-sm md:text-base">{subtitle}</p>
            </div>
            <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-xl bg-card/60 backdrop-blur-sm border border-border">
              <CreditCard className="w-4 h-4 text-primary" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('aiVid.yourBalance')}</p>
                <p className="text-sm font-bold">
                  {walletLoading ? '...' : formatPrice(wallet?.balance_euros || 0, currency)}
                </p>
              </div>
            </div>
          </div>

          <div className="h-px w-full overflow-hidden">
            <motion.div
              className="h-full"
              style={{
                background: 'linear-gradient(90deg, hsla(43,90%,68%,0.6), hsla(187,84%,55%,0.6), transparent)',
                transformOrigin: 'left',
              }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
            />
          </div>
        </motion.div>

        {/* Main tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-card/60 backdrop-blur-sm border border-border">
            <TabsTrigger value="generate">
              <Wand2 className="w-4 h-4 mr-2" />
              {language === 'de' ? 'Generieren' : 'Generate'}
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

          <TabsContent value="generate" className="space-y-6">
            <FirstVideoGuide />
            <Link
              to="/brand-characters"
              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent hover:border-primary/40 transition group"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                  <Lock className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {language === 'de' ? 'Brand Character Lock' : 'Brand Character Lock'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {language === 'de'
                      ? 'Speichere Charaktere einmal — nutze sie konsistent in jedem Video.'
                      : 'Save a character once — reuse it consistently in every video.'}
                  </p>
                </div>
              </div>
              <span className="text-xs text-primary group-hover:underline">
                {language === 'de' ? 'Verwalten →' : 'Manage →'}
              </span>
            </Link>
            <ToolkitGenerator onAfterGenerate={handleAfterGenerate} />
            <details className="rounded-lg border border-border/40 bg-card/40 p-4 group">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                {language === 'de' ? 'Rechtliche Hinweise & EU AI Act' : 'Legal & EU AI Act'}
              </summary>
              <div className="mt-4">
                <AIVideoDisclaimer />
              </div>
            </details>
          </TabsContent>

          <TabsContent value="history">
            <VideoGenerationHistory />
          </TabsContent>

          <TabsContent value="purchase">
            <AIVideoCreditPurchase />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
