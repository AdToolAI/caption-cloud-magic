import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { PricingCard } from "@/components/PricingCard";
import { FAQ } from "@/components/FAQ";
import { SEO } from "@/components/SEO";
import { useTranslation } from "@/hooks/useTranslation";
import { translations } from "@/lib/translations";
import { Sparkles, Zap, Target } from "lucide-react";

const Index = () => {
  const { t, language } = useTranslation();

  const faqItems = [
    { question: t('faq_q1'), answer: t('faq_a1') },
    { question: t('faq_q2'), answer: t('faq_a2') },
    { question: t('faq_q3'), answer: t('faq_a3') },
    { question: t('faq_q4'), answer: t('faq_a4') },
  ];

  // JSON-LD Strukturierte Daten für SoftwareApplication
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "AdTool AI",
    "applicationCategory": "BusinessApplication",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "EUR"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "1200"
    },
    "operatingSystem": "Web Browser",
    "description": "KI-gestützte Social Media Caption Generator für Instagram, TikTok, LinkedIn und mehr. Erstelle perfekte Bildunterschriften in Sekunden.",
    "creator": {
      "@type": "Organization",
      "name": "AdTool AI"
    },
    "featureList": [
      "KI-gestützte Caption-Generierung",
      "Plattform-optimierte Inhalte",
      "Hashtag-Vorschläge",
      "Multi-Sprach-Support",
      "Brand Voice Anpassung"
    ]
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title={t('hero_title')}
        description={t('hero_subtitle')}
        canonical="https://useadtool.ai/home"
        lang={language}
        structuredData={structuredData}
      />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-20 md:py-32 px-4">
          <div className="absolute inset-0 gradient-hero opacity-10"></div>
          <div className="container relative z-10 max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <Sparkles className="h-4 w-4" />
              Powered by AI
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
              {t('hero_title')}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              {t('hero_subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
              <Button asChild size="lg" className="shadow-lg hover:shadow-xl transition-smooth">
                <Link to="/generator">
                  {t('cta_try')}
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#pricing">{t('nav_pricing')}</a>
              </Button>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 px-4 bg-muted/50">
          <div className="container max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center p-6 rounded-lg bg-card transition-smooth hover:shadow-lg">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Lightning Fast</h3>
                <p className="text-muted-foreground">Generate perfect captions in seconds, not hours</p>
              </div>
              <div className="text-center p-6 rounded-lg bg-card transition-smooth hover:shadow-lg">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Target className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Platform Optimized</h3>
                <p className="text-muted-foreground">Tailored for Instagram, TikTok, LinkedIn & more</p>
              </div>
              <div className="text-center p-6 rounded-lg bg-card transition-smooth hover:shadow-lg">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">AI-Powered</h3>
                <p className="text-muted-foreground">Smart hashtags and engaging copy every time</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-20 px-4">
          <div className="container max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('pricingPage.title')}</h2>
              <p className="text-lg text-muted-foreground">{t('pricingPage.subtitle')}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">
              <PricingCard
                title={t('pricingPage.plans.basic.name')}
                price={`€${t('pricingPage.plans.basic.price')}`}
                period={t('pricingPage.plans.basic.period')}
                description={t('pricingPage.plans.basic.credits')}
                features={translations[language].pricingPage.plans.basic.features}
                buttonText={t('pricingPage.plans.basic.button')}
                onButtonClick={() => window.location.href = '/pricing'}
              />
              <PricingCard
                title={t('pricingPage.plans.pro.name')}
                price={`€${t('pricingPage.plans.pro.price')}`}
                period={t('pricingPage.plans.pro.period')}
                description={t('pricingPage.plans.pro.credits')}
                features={translations[language].pricingPage.plans.pro.features}
                buttonText={t('pricingPage.plans.pro.button')}
                popular
                onButtonClick={() => window.location.href = '/pricing'}
              />
              <PricingCard
                title={t('pricingPage.plans.enterprise.name')}
                price={`€${t('pricingPage.plans.enterprise.price')}`}
                period={t('pricingPage.plans.enterprise.period')}
                description={t('pricingPage.plans.enterprise.credits')}
                features={translations[language].pricingPage.plans.enterprise.features}
                buttonText={t('pricingPage.plans.enterprise.button')}
                onButtonClick={() => window.location.href = '/pricing'}
              />
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="bg-muted/50">
          <FAQ title={t('faq_title')} items={faqItems} />
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
