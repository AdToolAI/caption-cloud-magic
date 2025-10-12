import { Check, X, Lock } from "lucide-react";
import { PricingCard } from "@/components/PricingCard";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useNavigate } from "react-router-dom";

const Pricing = () => {
  const navigate = useNavigate();

  const plans = [
    {
      title: "Free",
      price: "0 €",
      period: "month",
      description: "Get Started",
      buttonText: "Start for Free",
      buttonVariant: "outline" as const,
      onButtonClick: () => navigate("/auth"),
      features: [
        { text: "Generate up to 20 Captions per month", included: true },
        { text: "Hashtag suggestions", included: false },
        { text: "Multi-brand management", included: false },
        { text: "Analytics Dashboard", included: false },
        { text: "Branding visible on exports", included: false, note: true },
      ],
    },
    {
      title: "Basic",
      price: "9,99 €",
      period: "month",
      description: "Recommended",
      buttonText: "Upgrade to Basic",
      buttonVariant: "default" as const,
      onButtonClick: () => navigate("/auth"),
      popular: true,
      features: [
        { text: "Generate up to 200 Captions per month", included: true },
        { text: "Hashtag Generator included", included: true },
        { text: "Manage up to 2 Brands", included: true },
        { text: "Remove branding from exports", included: true },
        { text: "Analytics or team access", included: false },
      ],
    },
    {
      title: "Pro",
      price: "29,99 €",
      period: "month",
      description: "For Agencies & Power Users",
      buttonText: "Go Pro",
      buttonVariant: "default" as const,
      onButtonClick: () => navigate("/auth"),
      features: [
        { text: "Unlimited Captions", included: true },
        { text: "Unlimited Brands", included: true },
        { text: "Team Access & Collaboration", included: true },
        { text: "Analytics Dashboard", included: true },
        { text: "Priority Support", included: true },
      ],
    },
  ];

  const renderFeatureIcon = (feature: { included: boolean; note?: boolean }) => {
    if (feature.note) {
      return <span className="text-muted-foreground text-xs">ℹ️</span>;
    }
    if (feature.included) {
      return <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />;
    }
    return <X className="h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5" />;
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background/95 to-muted/30">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-16">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Simple, Transparent Plans – Grow with CaptionGenie
          </h1>
          <p className="text-lg text-muted-foreground">
            Choose the plan that fits your workflow. Start free, upgrade anytime.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto mb-16">
          {plans.map((plan, index) => (
            <div
              key={plan.title}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <PricingCard
                title={plan.title}
                price={plan.price}
                period={plan.period}
                description={plan.description}
                features={plan.features.map((f) => f.text)}
                buttonText={plan.buttonText}
                buttonVariant={plan.buttonVariant}
                onButtonClick={plan.onButtonClick}
                popular={plan.popular}
              />
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="text-center max-w-2xl mx-auto animate-fade-in">
          <p className="text-muted-foreground">
            Need a custom plan?{" "}
            <a
              href="mailto:support@captiongenie.app"
              className="text-primary hover:underline font-medium"
            >
              Contact us at support@captiongenie.app
            </a>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Pricing;
