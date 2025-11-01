import { Link } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PricingCard } from "@/components/PricingCard";
import { FAQ } from "@/components/FAQ";
import { SEO } from "@/components/SEO";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { FeatureGuideDialog } from "@/components/onboarding/FeatureGuideDialog";
import { useTranslation } from "@/hooks/useTranslation";
import { translations } from "@/lib/translations";
import { pricingPlans } from "@/config/pricing";
import { detectUserCurrency, formatPrice } from "@/lib/currency";
import { Sparkles, Zap, Target, Calendar, TrendingUp, Palette, MessageSquare, Share2, Target as GoalIcon, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SocialProof } from "@/components/home/SocialProof";

const Index = () => {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const userCurrency = detectUserCurrency();

  const faqItems = [
    { question: t('faq.questions.q1.question'), answer: t('faq.questions.q1.answer') },
    { question: t('faq.questions.q2.question'), answer: t('faq.questions.q2.answer') },
    { question: t('faq.questions.q3.question'), answer: t('faq.questions.q3.answer') },
    { question: t('faq.questions.q4.question'), answer: t('faq.questions.q4.answer') },
  ];

  // Get features arrays from translations
  const freeFeatures = translations[language].pricingDetails.plans.free.features;
  const basicFeatures = translations[language].pricingDetails.plans.basic.features;
  const proFeatures = translations[language].pricingDetails.plans.pro.features;

  // JSON-LD Strukturierte Daten für SoftwareApplication + FAQPage
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "CaptionGenie",
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
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqItems.map(item => ({
        "@type": "Question",
        "name": item.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": item.answer
        }
      }))
    }
  ];

  return (
    <PageWrapper>
      <div className="min-h-screen flex flex-col">
        <SEO
          title={t('hero.title')}
          description={t('hero.subtitle')}
          canonical="https://useadtool.ai"
          lang={language}
          structuredData={structuredData}
          ogImage="/og-home.jpg"
        />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-20 md:py-32 px-4">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-background to-accent/5 opacity-60"></div>
          <div className="container relative z-10 max-w-4xl mx-auto text-center">
            <div className="glass-card rounded-3xl p-8 md:p-12 shadow-2xl">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
                <Sparkles className="h-4 w-4" />
                Powered by AI
              </div>
              <h1 className="text-4xl md:text-6xl font-heading font-bold mb-6">
                {t('hero.title')}
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                {t('hero.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg" className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 hover:shadow-glow transition-all duration-300 active:scale-[0.98] text-white border-0">
                  <Link to="/generator">
                    {t('hero.cta')}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="hover:bg-muted/50 transition-smooth">
                  <a href="#pricing">{t('nav.pricing')}</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 px-4 bg-muted/30">
          <div className="container max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4">{t('featureCards.sectionTitle')}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">{t('featureCards.sectionSubtitle')}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              <button onClick={() => setSelectedFeature('automation')} className="group text-center p-6 rounded-2xl bg-card shadow-soft hover:shadow-glow hover:-translate-y-1 transition-all duration-300 border border-border/50 hover:border-primary/50 cursor-pointer">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-heading font-semibold mb-2">{t('featureGuides.automation.title')}</h3>
                <p className="text-muted-foreground text-sm mb-3">{t('featureGuides.automation.description')}</p>
                <div className="text-primary text-sm font-medium flex items-center justify-center gap-1">
                  {t('featureGuides.common.setupTitle')} <ChevronRight className="h-4 w-4" />
                </div>
              </button>

              <button onClick={() => setSelectedFeature('analytics')} className="group text-center p-6 rounded-2xl bg-card shadow-soft hover:shadow-glow hover:-translate-y-1 transition-all duration-300 border border-border/50 hover:border-primary/50 cursor-pointer">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <TrendingUp className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-xl font-heading font-semibold mb-2">{t('featureGuides.analytics.title')}</h3>
                <p className="text-muted-foreground text-sm mb-3">{t('featureGuides.analytics.description')}</p>
                <div className="text-primary text-sm font-medium flex items-center justify-center gap-1">
                  {t('featureGuides.common.setupTitle')} <ChevronRight className="h-4 w-4" />
                </div>
              </button>

              <button onClick={() => setSelectedFeature('brandKit')} className="group text-center p-6 rounded-2xl bg-card shadow-soft hover:shadow-glow hover:-translate-y-1 transition-all duration-300 border border-border/50 hover:border-primary/50 cursor-pointer">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Palette className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-heading font-semibold mb-2">{t('featureGuides.brandKit.title')}</h3>
                <p className="text-muted-foreground text-sm mb-3">{t('featureGuides.brandKit.description')}</p>
                <div className="text-primary text-sm font-medium flex items-center justify-center gap-1">
                  {t('featureGuides.common.setupTitle')} <ChevronRight className="h-4 w-4" />
                </div>
              </button>

              <button onClick={() => setSelectedFeature('coach')} className="group text-center p-6 rounded-2xl bg-card shadow-soft hover:shadow-glow hover:-translate-y-1 transition-all duration-300 border border-border/50 hover:border-primary/50 cursor-pointer">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <MessageSquare className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-xl font-heading font-semibold mb-2">{t('featureGuides.coach.title')}</h3>
                <p className="text-muted-foreground text-sm mb-3">{t('featureGuides.coach.description')}</p>
                <div className="text-primary text-sm font-medium flex items-center justify-center gap-1">
                  {t('featureGuides.common.setupTitle')} <ChevronRight className="h-4 w-4" />
                </div>
              </button>

              <button onClick={() => setSelectedFeature('publishing')} className="group text-center p-6 rounded-2xl bg-card shadow-soft hover:shadow-glow hover:-translate-y-1 transition-all duration-300 border border-border/50 hover:border-primary/50 cursor-pointer">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Share2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-heading font-semibold mb-2">{t('featureGuides.publishing.title')}</h3>
                <p className="text-muted-foreground text-sm mb-3">{t('featureGuides.publishing.description')}</p>
                <div className="text-primary text-sm font-medium flex items-center justify-center gap-1">
                  {t('featureGuides.common.setupTitle')} <ChevronRight className="h-4 w-4" />
                </div>
              </button>

              <button onClick={() => setSelectedFeature('goals')} className="group text-center p-6 rounded-2xl bg-card shadow-soft hover:shadow-glow hover:-translate-y-1 transition-all duration-300 border border-border/50 hover:border-primary/50 cursor-pointer">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <GoalIcon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-xl font-heading font-semibold mb-2">{t('featureGuides.goals.title')}</h3>
                <p className="text-muted-foreground text-sm mb-3">{t('featureGuides.goals.description')}</p>
                <div className="text-primary text-sm font-medium flex items-center justify-center gap-1">
                  {t('featureGuides.common.setupTitle')} <ChevronRight className="h-4 w-4" />
                </div>
              </button>
            </div>
          </div>
        </section>

        <FeatureGuideDialog 
          featureId={selectedFeature}
          open={selectedFeature !== null}
          onClose={() => setSelectedFeature(null)}
        />

        {/* Social Proof */}
        {!user && <SocialProof />}

        {/* Pricing Section */}
        <section id="pricing" className="py-20 px-4">
          <div className="container max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4">{t('pricingPage.title')}</h2>
              <p className="text-lg text-muted-foreground">{t('pricingPage.subtitle')}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">
              <PricingCard
                title={t('pricingPage.plans.basic.name')}
                price={formatPrice(pricingPlans.basic.price[userCurrency], userCurrency)}
                period={t('pricingPage.plans.basic.period')}
                description={t('pricingPage.plans.basic.credits')}
                features={translations[language].pricingPage.plans.basic.features}
                buttonText={t('pricingPage.plans.basic.button')}
                onButtonClick={() => window.location.href = '/pricing'}
              />
              <PricingCard
                title={t('pricingPage.plans.pro.name')}
                price={formatPrice(pricingPlans.pro.price[userCurrency], userCurrency)}
                period={t('pricingPage.plans.pro.period')}
                description={t('pricingPage.plans.pro.credits')}
                features={translations[language].pricingPage.plans.pro.features}
                buttonText={t('pricingPage.plans.pro.button')}
                popular
                onButtonClick={() => window.location.href = '/pricing'}
              />
              <PricingCard
                title={t('pricingPage.plans.enterprise.name')}
                price={formatPrice(pricingPlans.enterprise.price[userCurrency], userCurrency)}
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
          <FAQ title={t('faq.title')} items={faqItems} />
        </section>
      </main>

      <Footer />
      </div>
    </PageWrapper>
  );
};

export default Index;
