import { Check, X } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { pricingPlans } from "@/config/pricing";
import { toast } from "sonner";
import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { translations } from "@/lib/translations";

const Pricing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handlePlanClick = async (planType: 'basic' | 'pro' | 'enterprise') => {
    if (!user) {
      navigate('/auth');
      return;
    }

    setCheckoutLoading(planType);
    try {
      const plan = pricingPlans[planType];
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId: plan.priceId }
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(t("pricingDetails.errors.checkoutFailed"));
    } finally {
      setCheckoutLoading(null);
    }
  };

  const plans = [
    {
      title: t("pricingPage.plans.basic.name"),
      price: t("pricingPage.plans.basic.price"),
      period: t("pricingPage.plans.basic.period"),
      description: t("pricingPage.plans.basic.credits"),
      buttonText: t("pricingPage.plans.basic.button"),
      buttonVariant: "default" as const,
      planType: 'basic' as const,
      features: translations[language].pricingPage.plans.basic.features,
    },
    {
      title: t("pricingPage.plans.pro.name"),
      price: t("pricingPage.plans.pro.price"),
      period: t("pricingPage.plans.pro.period"),
      description: t("pricingPage.plans.pro.credits"),
      buttonText: t("pricingPage.plans.pro.button"),
      buttonVariant: "default" as const,
      planType: 'pro' as const,
      popular: true,
      features: translations[language].pricingPage.plans.pro.features,
    },
    {
      title: t("pricingPage.plans.enterprise.name"),
      price: t("pricingPage.plans.enterprise.price"),
      period: t("pricingPage.plans.enterprise.period"),
      description: t("pricingPage.plans.enterprise.credits"),
      buttonText: t("pricingPage.plans.enterprise.button"),
      buttonVariant: "default" as const,
      planType: 'enterprise' as const,
      features: translations[language].pricingPage.plans.enterprise.features,
    },
  ];

  // JSON-LD Strukturierte Daten für Pricing (AggregateOffer für SaaS)
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "name": "AdTool AI",
        "description": "Social Media Caption Generator with AI - Multiple subscription plans available",
        "brand": {
          "@type": "Brand",
          "name": "AdTool AI"
        },
        "category": "Software",
        "image": "https://useadtool.ai/og-pricing.jpg",
        "offers": {
          "@type": "AggregateOffer",
          "lowPrice": "0",
          "highPrice": "99.99",
          "priceCurrency": "EUR",
          "offerCount": "3",
          "offers": [
            {
              "@type": "Offer",
              "name": "Basic Plan",
              "description": pricingPlans.basic.name,
              "price": pricingPlans.basic.price.toString(),
              "priceCurrency": "EUR",
              "availability": "https://schema.org/OnlineOnly",
              "url": "https://useadtool.ai/pricing"
            },
            {
              "@type": "Offer",
              "name": "Pro Plan",
              "description": pricingPlans.pro.name,
              "price": pricingPlans.pro.price.toString(),
              "priceCurrency": "EUR",
              "availability": "https://schema.org/OnlineOnly",
              "url": "https://useadtool.ai/pricing"
            },
            {
              "@type": "Offer",
              "name": "Enterprise Plan",
              "description": pricingPlans.enterprise.name,
              "price": pricingPlans.enterprise.price.toString(),
              "priceCurrency": "EUR",
              "availability": "https://schema.org/OnlineOnly",
              "url": "https://useadtool.ai/pricing"
            }
          ]
        }
      }
    ]
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-muted/30 to-muted/50">
      <SEO
        title={t("pricingDetails.header.title")}
        description={t("pricingDetails.header.subtitle")}
        canonical="/pricing"
        lang={language}
        ogImage="/og-pricing.jpg"
        structuredData={structuredData}
      />
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-20">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
          <div className="inline-block px-5 py-2 bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 text-primary rounded-full text-sm font-bold mb-6 shadow-lg shadow-primary/10">
            ✨ {t("pricingDetails.header.badge")}
          </div>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-foreground tracking-tight leading-tight">
            {t("pricingDetails.header.title")}
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t("pricingDetails.header.subtitle")}
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid lg:grid-cols-3 gap-8 max-w-7xl mx-auto mb-20">
          {plans.map((plan, index) => (
            <div
              key={plan.title}
              className={`relative flex flex-col bg-card rounded-3xl border-2 transition-all duration-500 hover:scale-105 ${
                plan.popular 
                  ? "border-primary shadow-2xl shadow-primary/30 lg:scale-110 lg:z-10" 
                  : "border-border/50 shadow-xl hover:shadow-2xl hover:border-primary/40"
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-20">
                  <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent blur-md opacity-60"></div>
                    <div className="relative bg-gradient-to-r from-primary to-accent text-white px-8 py-2.5 rounded-full text-sm font-extrabold shadow-2xl tracking-wider">
                      ⭐ {plan.popular ? (language === 'de' ? 'BELIEBT' : language === 'es' ? 'POPULAR' : 'POPULAR') : ''}
                    </div>
                  </div>
                </div>
              )}

              <div className="p-8 lg:p-10 flex flex-col flex-1">
                {/* Header */}
                <div className="text-center mb-8 pb-8 border-b-2 border-border/50">
                  <h3 className="text-3xl font-extrabold text-foreground mb-3 tracking-tight">{plan.title}</h3>
                  <p className="text-sm text-muted-foreground mb-8 font-medium">{plan.description}</p>
                  
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-6xl font-extrabold text-foreground tracking-tighter">€{plan.price}</span>
                    <span className="text-lg text-muted-foreground font-medium">/ {plan.period}</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-4 mb-10 flex-1">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3.5">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                        <Check className="h-4 w-4 text-white font-extrabold" strokeWidth={4} />
                      </div>
                      <span className="text-base font-medium leading-relaxed text-foreground">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Button
                  variant={plan.buttonVariant}
                  size="lg"
                  disabled={checkoutLoading === plan.planType}
                  className={`w-full h-14 text-base font-bold transition-all duration-300 ${
                    plan.popular 
                      ? "bg-gradient-to-r from-primary to-accent hover:shadow-2xl hover:shadow-primary/50 hover:scale-105" 
                      : "hover:shadow-xl hover:scale-105"
                  }`}
                  onClick={() => handlePlanClick(plan.planType)}
                >
                  {checkoutLoading === plan.planType ? t("pricingDetails.loading") : plan.buttonText}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="bg-gradient-to-br from-card to-muted/30 border-2 border-border/50 rounded-3xl p-10 shadow-xl">
            <h3 className="text-2xl font-bold text-foreground mb-3">{t("pricingDetails.custom.title")}</h3>
            <p className="text-base text-muted-foreground mb-5 leading-relaxed">
              {t("pricingDetails.custom.description")}
            </p>
            <a
              href="mailto:bestofproducts4u@gmail.com"
              className="inline-flex items-center gap-2 text-primary hover:text-accent font-bold text-lg transition-colors underline underline-offset-4 hover:underline-offset-8"
            >
              {t("pricingDetails.custom.contact")} →
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Pricing;
