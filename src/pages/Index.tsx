import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PricingCard } from "@/components/PricingCard";
import { FAQ } from "@/components/FAQ";
import { SEO } from "@/components/SEO";
import { useTranslation } from "@/hooks/useTranslation";
import { translations } from "@/lib/translations";
import { pricingPlans } from "@/config/pricing";
import { Sparkles, Zap, Target } from "lucide-react";

const Index = () => {
  const { t, language } = useTranslation();

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
        "name": "CaptionGenie"
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
    <div className="min-h-screen flex flex-col">
      <SEO
        title={t('hero.title')}
        description={t('hero.subtitle')}
        canonical="https://captiongenie.app"
        lang={language}
        structuredData={structuredData}
        ogImage="/og-home.jpg"
      />
      <Header />
      
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
              {t('hero.title')}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              {t('hero.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
              <Button asChild size="lg" className="shadow-lg hover:shadow-xl transition-smooth">
                <Link to="/generator">
                  {t('hero.cta')}
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#pricing">{t('nav.pricing')}</a>
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
                price={t('pricingPage.plans.basic.price')}
                period={t('pricingPage.plans.basic.period')}
                description={t('pricingPage.plans.basic.credits')}
                features={translations[language].pricingPage.plans.basic.features}
                buttonText={t('pricingPage.plans.basic.button')}
                onButtonClick={() => window.location.href = '/pricing'}
              />
              <PricingCard
                title={t('pricingPage.plans.pro.name')}
                price={t('pricingPage.plans.pro.price')}
                period={t('pricingDetails.period')}
                features={basicFeatures.slice(0, 4)}
                buttonText={t('pricingDetails.plans.basic.buttonText')}
                popular
                onButtonClick={() => window.location.href = '/auth'}
              />
              <PricingCard
                title={t('pricingDetails.plans.pro.title')}
                price={`${pricingPlans.pro.price} €`}
                period={t('pricingDetails.period')}
                features={proFeatures.slice(0, 5)}
                buttonText={t('pricingDetails.plans.pro.buttonText')}
                onButtonClick={() => window.location.href = '/auth'}
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
  );
};

export default Index;
