import { useState } from "react";
import { SEO } from "@/components/SEO";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { FeatureGuideDialog } from "@/components/onboarding/FeatureGuideDialog";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";

// James Bond 2028 Landing Components
import { BlackTieHero } from "@/components/landing/BlackTieHero";
import { SocialProofStrip } from "@/components/landing/SocialProofStrip";
import { MissionFeatures } from "@/components/landing/MissionFeatures";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { AIModelsArsenal } from "@/components/landing/AIModelsArsenal";
import { LiveDemoShowcase } from "@/components/landing/LiveDemoShowcase";
import { TestimonialSpotlight } from "@/components/landing/TestimonialSpotlight";

import { PricingSection } from "@/components/landing/PricingSection";
import { TrialPromiseStrip } from "@/components/landing/TrialPromiseStrip";
import { BlackTieFooter } from "@/components/landing/BlackTieFooter";
import { FAQ } from "@/components/FAQ";

const Index = () => {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  const faqItems = [
    { question: t('faq.questions.q1.question'), answer: t('faq.questions.q1.answer') },
    { question: t('faq.questions.q2.question'), answer: t('faq.questions.q2.answer') },
    { question: t('faq.questions.q3.question'), answer: t('faq.questions.q3.answer') },
    { question: t('faq.questions.q4.question'), answer: t('faq.questions.q4.answer') },
  ];

  // JSON-LD Strukturierte Daten für SoftwareApplication + FAQPage
  const structuredData = [
    {
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
      "description": "KI-gestützte Social Media Marketing Platform für Content-Erstellung, Planung und Analytics.",
      "creator": {
        "@type": "Organization",
        "name": "AdTool AI"
      },
      "featureList": [
        "KI-gestützte Content-Generierung",
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
      <div className="min-h-screen flex flex-col bg-background">
        <SEO
          title="AdTool AI - KI Social Media Marketing Platform"
          description="Effektives Marketing. Smarte Kampagnen. Dein KI-gestütztes Marketing-Arsenal für Social Media Erfolg."
          canonical="https://useadtool.ai/"
          lang={language}
          structuredData={structuredData}
          ogImage="/og-home.jpg"
        />
      
        <main className="flex-1">
          {/* Trial Promise Strip — top of page, above hero */}
          <section className="px-4 pt-4 pb-0">
            <div className="container max-w-7xl mx-auto [&>div]:mb-0">
              <TrialPromiseStrip />
            </div>
          </section>

          {/* Hero Section - Black Tie */}
          <BlackTieHero />

          {/* Social Proof Strip */}
          <SocialProofStrip />

          {/* Mission Features - Why This Tool Wins */}
          <MissionFeatures />

          {/* Live Demo Showcase - Before/After */}
          <LiveDemoShowcase />

          {/* AI Models Arsenal - 6 licensed premium models */}
          <AIModelsArsenal />

          {/* Feature Grid */}
          <FeatureGrid />

          {/* Testimonial Spotlight */}
          <TestimonialSpotlight />

          {/* Pricing Section */}
          <PricingSection />

          {/* FAQ Section */}
          <section id="faq" className="py-24 px-4 bg-card/30">
            <FAQ title={t('faq.title')} items={faqItems} />
          </section>
        </main>

        {/* Footer - Black Tie */}
        <BlackTieFooter />

        {/* Feature Guide Dialog */}
        <FeatureGuideDialog 
          featureId={selectedFeature}
          open={selectedFeature !== null}
          onClose={() => setSelectedFeature(null)}
        />
      </div>
    </PageWrapper>
  );
};

export default Index;
