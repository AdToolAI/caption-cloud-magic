import { Check, X } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Pricing = () => {
  const navigate = useNavigate();

  const plans = [
    {
      title: "Free",
      subtitle: "Get Started",
      price: "0",
      period: "month",
      description: "Perfect for trying out CaptionGenie",
      buttonText: "Start for Free",
      buttonVariant: "outline" as const,
      onButtonClick: () => navigate("/auth"),
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
      onButtonClick: () => navigate("/auth"),
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
      onButtonClick: () => navigate("/auth"),
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
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-20">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-block px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold mb-4">
            Simple & Transparent Pricing
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-foreground tracking-tight">
            Grow with CaptionGenie
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your workflow. Start free, upgrade anytime.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid lg:grid-cols-3 gap-8 max-w-7xl mx-auto mb-16">
          {plans.map((plan, index) => (
            <div
              key={plan.title}
              className={`relative flex flex-col bg-card rounded-3xl border-2 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 ${
                plan.popular 
                  ? "border-primary shadow-xl shadow-primary/20 scale-105" 
                  : "border-border hover:border-primary/50"
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                  <div className="bg-gradient-to-r from-primary to-accent text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                    POPULAR
                  </div>
                </div>
              )}

              <div className="p-8 flex flex-col flex-1">
                {/* Header */}
                <div className="text-center mb-8 pb-8 border-b border-border">
                  <h3 className="text-2xl font-bold text-foreground mb-2">{plan.title}</h3>
                  <p className="text-sm text-muted-foreground mb-6">{plan.description}</p>
                  
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-5xl font-bold text-foreground">€{plan.price}</span>
                    <span className="text-muted-foreground">/ {plan.period}</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-4 mb-8 flex-1">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      {feature.included ? (
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                          <Check className="h-3 w-3 text-primary font-bold" strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center mt-0.5">
                          <X className="h-3 w-3 text-muted-foreground" strokeWidth={2} />
                        </div>
                      )}
                      <span className={`text-sm ${feature.included ? "text-foreground" : "text-muted-foreground"}`}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Button
                  variant={plan.buttonVariant}
                  size="lg"
                  className={`w-full h-12 text-base font-semibold ${
                    plan.popular ? "shadow-lg shadow-primary/30" : ""
                  }`}
                  onClick={plan.onButtonClick}
                >
                  {plan.buttonText}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="bg-card border border-border rounded-2xl p-8">
            <h3 className="text-xl font-semibold text-foreground mb-2">Need a custom plan?</h3>
            <p className="text-muted-foreground mb-4">
              We offer tailored solutions for enterprises and large teams.
            </p>
            <a
              href="mailto:support@captiongenie.app"
              className="inline-flex items-center gap-2 text-primary hover:underline font-semibold"
            >
              Contact us at support@captiongenie.app
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Pricing;
