import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Sparkles } from "lucide-react";
import { pricingPlans, type PlanType } from "@/config/pricing";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";

const STEPS = ["language", "plan", "brand"] as const;
type Step = typeof STEPS[number];

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState<Step>("language");
  const [selectedLang, setSelectedLang] = useState<string>("en");
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("basic");
  const [brandName, setBrandName] = useState("");
  const [brandColor, setBrandColor] = useState("#6366F1");
  const [loading, setLoading] = useState(false);

  const { t, language, setLanguage} = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const languages = [
    { code: "en", name: "English", flag: "🇬🇧" },
    { code: "de", name: "Deutsch", flag: "🇩🇪" },
    { code: "es", name: "Español", flag: "🇪🇸" },
  ];

  const handleLanguageNext = () => {
    setLanguage(selectedLang as any);
    localStorage.setItem("cg_lang", selectedLang);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { 
      step: 1, 
      step_name: 'language',
      language: selectedLang
    });
    setCurrentStep("plan");
  };

  const handlePlanNext = async () => {
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { 
      step: 2, 
      step_name: 'plan', 
      selected_plan: selectedPlan 
    });
    
    // Always redirect to Stripe checkout
    {
      // Redirect to Stripe checkout
      const plan = pricingPlans[selectedPlan];
      if (plan.checkoutUrl) {
        window.open(plan.checkoutUrl, "_blank");
      } else if (plan.priceId) {
        // Use server checkout
        try {
          const { data, error } = await supabase.functions.invoke('create-checkout', {
            body: { priceId: plan.priceId }
          });
          if (error) throw error;
          if (data?.url) window.open(data.url, '_blank');
        } catch (error) {
          console.error('Checkout error:', error);
          toast.error('Failed to start checkout');
        }
      }
      setCurrentStep("brand");
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          brand_name: brandName,
          brand_color: brandColor,
          onboarding_completed: true,
          plan: selectedPlan,
        })
        .eq("id", user.id);

      if (error) throw error;

      trackEvent(ANALYTICS_EVENTS.ONBOARDING_FINISHED, {
        brand_name: brandName,
        selected_plan: selectedPlan,
        language: selectedLang,
        user_id: user.id
      });
      
      toast.success("Onboarding complete!");
      navigate("/home");
    } catch (error) {
      console.error("Onboarding error:", error);
      toast.error("Failed to complete onboarding");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">AdTool AI</span>
          </div>
          <CardTitle className="text-3xl">Welcome!</CardTitle>
          <CardDescription>Let's set up your account in 3 easy steps</CardDescription>
          
          {/* Progress indicators */}
          <div className="flex justify-center gap-2 mt-6">
            {STEPS.map((step, idx) => (
              <div
                key={step}
                className={`h-2 w-20 rounded-full transition-all ${
                  STEPS.indexOf(currentStep) >= idx ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step 1: Language */}
          {currentStep === "language" && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-center">Choose your language</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {languages.map((lang) => (
                  <Card
                    key={lang.code}
                    className={`cursor-pointer transition-all hover:shadow-lg ${
                      selectedLang === lang.code ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => setSelectedLang(lang.code)}
                  >
                    <CardContent className="flex flex-col items-center justify-center p-6">
                      <span className="text-4xl mb-2">{lang.flag}</span>
                      <span className="font-medium">{lang.name}</span>
                      {selectedLang === lang.code && (
                        <Check className="h-5 w-5 text-primary mt-2" />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button onClick={handleLanguageNext} className="w-full" size="lg">
                Continue
              </Button>
            </div>
          )}

          {/* Step 2: Plan */}
          {currentStep === "plan" && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-center">Choose your plan</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(Object.keys(pricingPlans) as PlanType[]).map((planKey) => {
                  const plan = pricingPlans[planKey];
                  return (
                    <Card
                      key={planKey}
                      className={`cursor-pointer transition-all hover:shadow-lg ${
                        selectedPlan === planKey ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() => setSelectedPlan(planKey)}
                    >
                      <CardHeader>
                        <CardTitle className="text-center">{plan.name}</CardTitle>
                        <div className="text-center">
                          <span className="text-3xl font-bold">
                            {`${plan.currency}${plan.price}`}
                          </span>
                          <span className="text-muted-foreground">/mo</span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-sm space-y-1">
                          <p>✓ {plan.features.captionsPerMonth === Infinity ? "Unlimited" : plan.features.captionsPerMonth} captions/mo</p>
                          <p>✓ {plan.features.brandsLimit === Infinity ? "Unlimited" : plan.features.brandsLimit} brand{plan.features.brandsLimit !== 1 ? "s" : ""}</p>
                          {plan.features.hashtagGenerator && <p>✓ Hashtag generator</p>}
                          {plan.features.analytics && <p>✓ Analytics</p>}
                          {plan.features.team && <p>✓ Team features</p>}
                        </div>
                        {selectedPlan === planKey && (
                          <Check className="h-5 w-5 text-primary mx-auto mt-2" />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <Button onClick={handlePlanNext} className="w-full" size="lg">
                Continue
              </Button>
            </div>
          )}

          {/* Step 3: Brand */}
          {currentStep === "brand" && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-center">Set up your brand</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="brandName">Brand Name</Label>
                  <Input
                    id="brandName"
                    placeholder="My Awesome Brand"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="brandColor">Brand Color</Label>
                  <div className="flex gap-4 items-center">
                    <Input
                      id="brandColor"
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-12 w-24"
                    />
                    <Input
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      placeholder="#6366F1"
                    />
                  </div>
                </div>
              </div>
              <Button
                onClick={handleComplete}
                className="w-full"
                size="lg"
                disabled={loading || !brandName}
              >
                {loading ? "Completing..." : "Complete Setup"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
