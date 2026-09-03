import { useState } from 'react';
import { tx } from '@/lib/i18nText';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Check, Crown } from 'lucide-react';
import { AI_VIDEO_CREDIT_PACKS } from '@/config/aiVideoCredits';
import { Currency } from '@/config/pricing';
import { formatPrice, getCurrencyForLanguage } from '@/lib/currency';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import { useFounderStatus } from '@/hooks/useFounderStatus';
import { toast } from 'sonner';
import { openCheckoutUrl } from '@/lib/openCheckout';

export const AIVideoCreditPurchase = () => {
  const { language, t } = useTranslation();
  const founder = useFounderStatus();
  const [loading, setLoading] = useState<string | null>(null);
  const currency: Currency = getCurrencyForLanguage(language);
  const discountFactor = founder.isActive ? 0.8 : 1;

  const handlePurchase = async (packId: keyof typeof AI_VIDEO_CREDIT_PACKS) => {
    setLoading(packId);
    try {
      const { data, error } = await supabase.functions.invoke('ai-video-purchase-credits', {
        body: { packId, currency, locale: language }
      });
      if (error) throw error;
      if (data.url) openCheckoutUrl(data.url);
    } catch (error) {
      console.error('Purchase error:', error);
      toast.error(t('aiVid.purchaseError'));
    } finally {
      setLoading(null);
    }
  };


  return (
    <div className="space-y-6">
      {founder.isActive && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
          <Crown className="h-4 w-4" />
          <span className="font-medium">{tx({ de: "Gründer-Vorteil aktiv: −20 % auf alle Video-Credits (24 Monate).", en: "Founder benefit active: −20% on all video credits (24 months).", es: "Beneficio de fundador activo: −20% en todos los créditos de video (24 meses)." })}</span>
        </div>
      )}
      {currency === 'EUR' && (
        <p className="text-xs text-muted-foreground text-center">
          {tx({ de: 'Alle Preise inkl. 19% MwSt. (Deutschland). Eine Rechnung wird automatisch nach dem Kauf per E-Mail zugestellt und im Billing-Bereich verfügbar.', en: 'All prices include 19% VAT (Germany). An invoice is emailed automatically after purchase and is available in the billing area.', es: 'Todos los precios incluyen el 19% de IVA (Alemania). La factura se envía por correo automáticamente tras la compra y está disponible en el área de facturación.' })}
        </p>
      )}
      <p className="text-xs text-muted-foreground text-center">
        {tx({
          de: 'Sichere Zahlung über Stripe. Zahlungsarten: Karte · Apple Pay · Google Pay · PayPal · SEPA · Klarna · iDEAL und weitere (automatisch je nach Land).',
          en: 'Secure payment via Stripe. Payment methods: Card · Apple Pay · Google Pay · PayPal · SEPA · Klarna · iDEAL and more (automatic per country).',
          es: 'Pago seguro con Stripe. Métodos de pago: Tarjeta · Apple Pay · Google Pay · PayPal · SEPA · Klarna · iDEAL y más (automático según país).'
        })}

      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Object.entries(AI_VIDEO_CREDIT_PACKS).map(([key, pack]) => (
          <Card key={key} className={`p-6 relative ${pack.popular ? 'border-primary border-2' : ''}`}>
            {pack.badge && (
              <Badge className="absolute top-4 right-4" variant="secondary">{pack.badge}</Badge>
            )}
            {pack.bestValue && (
              <Badge className="absolute top-4 right-4 bg-gradient-to-r from-purple-500 to-pink-500">
                <Sparkles className="w-3 h-3 mr-1" />
                Best Value
              </Badge>
            )}

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{pack.name[currency]}</h3>
                <p className="text-xs text-muted-foreground mt-1">{pack.description[currency]}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  {founder.isActive ? (
                    <>
                      <span className="text-3xl font-bold text-primary">
                        {formatPrice(pack.price[currency] * discountFactor, currency)}
                      </span>
                      <span className="text-sm text-muted-foreground line-through">
                        {formatPrice(pack.price[currency], currency)}
                      </span>
                      <Badge variant="secondary" className="ml-1">−20%</Badge>
                    </>
                  ) : (
                    <span className="text-3xl font-bold">{formatPrice(pack.price[currency], currency)}</span>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  <span>{formatPrice(pack.price[currency], currency)} Credits</span>
                </div>
                {pack.bonusPercent > 0 && (
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span className="text-primary font-medium">+{formatPrice(pack.bonus[currency], currency)} Bonus</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  <span>= {formatPrice(pack.totalCredits[currency], currency)} {t('aiVid.total')}</span>
                </div>
                <div className="pt-2 border-t space-y-1">
                  <p className="text-xs font-medium mb-1">{t('aiVid.examplesWithSora')}</p>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    {[10, 15, 20, 30].map((sec) => (
                      <div key={sec} className="flex justify-between">
                        <span>{t('aiVid.secVideos', { sec: String(sec) })}:</span>
                        <span className="font-medium">{t('aiVid.videos', { count: String(Math.floor(pack.totalCredits[currency] / (sec * 0.25))) })}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground pt-1">{t('aiVid.soraProDouble')}</p>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => handlePurchase(key as any)}
                disabled={loading !== null}
                variant={pack.popular ? 'default' : 'outline'}
              >
                {loading === key ? t('aiVid.loadingBtn') : t('aiVid.buyNow')}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
