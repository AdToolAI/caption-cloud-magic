import { Check, X } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { pricingPlans } from "@/config/pricing";
import { toast } from "sonner";
import { useState } from "react";

const Pricing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handlePlanClick = async (planType: 'free' | 'basic' | 'pro') => {
    if (planType === 'free') {
      navigate('/auth');
      return;
    }

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
      toast.error('Checkout konnte nicht gestartet werden');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const plans = [
    {
      title: "Free",
      subtitle: "Get Started",
      price: "0",
      period: "month",
      description: "Perfect for trying out CaptionGenie",
      buttonText: "Start for Free",
      buttonVariant: "outline" as const,
      planType: 'free' as const,
      features: [
        { text: "20 AI captions per month", included: true },
        { text: "Basic templates", included: true },
        { text: "Community support", included: true },
        { text: "Hashtag suggestions", included: false },
        { text: "Brand management", included: false },
        { text: "Analytics", included: false },
        { text: "Watermark on exports", included: false },
      ],
    },
    {
      title: "Basic",
      subtitle: "Most Popular",
      price: "9.99",
      period: "month",
      description: "Best for content creators & small businesses",
      buttonText: "Upgrade to Basic",
      buttonVariant: "default" as const,
      planType: 'basic' as const,
      popular: true,
      features: [
        { text: "200 AI captions per month", included: true },
        { text: "All premium templates", included: true },
        { text: "Hashtag Generator", included: true },
        { text: "Manage up to 2 brands", included: true },
        { text: "Remove watermark", included: true },
        { text: "Priority email support", included: true },
        { text: "Analytics dashboard", included: false },
        { text: "Team collaboration", included: false },
      ],
    },
    {
      title: "Pro",
      subtitle: "For Power Users",
      price: "29.99",
      period: "month",
      description: "Perfect for agencies & teams",
      buttonText: "Go Pro",
      buttonVariant: "default" as const,
      planType: 'pro' as const,
      features: [
        { text: "Unlimited AI captions", included: true },
        { text: "Unlimited brands", included: true },
        { text: "Advanced AI models", included: true },
        { text: "Team collaboration tools", included: true },
        { text: "Analytics dashboard", included: true },
        { text: "White-label exports", included: true },
        { text: "Priority support & onboarding", included: true },
        { text: "Custom integrations", included: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-muted/30 to-muted/50">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-20">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
          <div className="inline-block px-5 py-2 bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 text-primary rounded-full text-sm font-bold mb-6 shadow-lg shadow-primary/10">
            ✨ Simple & Transparent Pricing
          </div>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-foreground tracking-tight leading-tight">
            Grow with CaptionGenie
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Choose the plan that fits your workflow. Start free, upgrade anytime.
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
                      ⭐ POPULAR
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
                      {feature.included ? (
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                          <Check className="h-4 w-4 text-white font-extrabold" strokeWidth={4} />
                        </div>
                      ) : (
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted/70 flex items-center justify-center mt-0.5">
                          <X className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={2.5} />
                        </div>
                      )}
                      <span className={`text-base font-medium leading-relaxed ${feature.included ? "text-foreground" : "text-muted-foreground/70"}`}>
                        {feature.text}
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
                      : plan.buttonVariant === "outline"
                      ? "border-2 border-primary text-primary hover:bg-primary hover:text-white hover:scale-105 shadow-lg"
                      : "hover:shadow-xl hover:scale-105"
                  }`}
                  onClick={() => handlePlanClick(plan.planType)}
                >
                  {checkoutLoading === plan.planType ? "Wird geladen..." : plan.buttonText}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="bg-gradient-to-br from-card to-muted/30 border-2 border-border/50 rounded-3xl p-10 shadow-xl">
            <h3 className="text-2xl font-bold text-foreground mb-3">Need a custom plan?</h3>
            <p className="text-base text-muted-foreground mb-5 leading-relaxed">
              We offer tailored solutions for enterprises and large teams.
            </p>
            <a
              href="mailto:support@captiongenie.app"
              className="inline-flex items-center gap-2 text-primary hover:text-accent font-bold text-lg transition-colors underline underline-offset-4 hover:underline-offset-8"
            >
              Contact us at support@captiongenie.app →
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Pricing;
