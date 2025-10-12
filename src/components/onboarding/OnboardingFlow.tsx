import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Sparkles } from "lucide-react";
import { pricingPlans } from "@/config/pricing";
import { toast } from "sonner";

export const OnboardingFlow = () => {
  const [step, setStep] = useState(1);
  const [selectedLang, setSelectedLang] = useState<'en' | 'de' | 'es'>('en');
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'basic' | 'pro'>('free');
  const [brandName, setBrandName] = useState("");
  const [brandColor, setBrandColor] = useState("#6366F1");
  const [loading, setLoading] = useState(false);
  
  const { setLanguage, t } = useTranslation();
  const navigate = useNavigate();

  const handleLanguageSelect = (lang: 'en' | 'de' | 'es') => {
    setSelectedLang(lang);
    setLanguage(lang);
    localStorage.setItem('cg_lang', lang);
  };

  const handlePlanSelect = async (plan: 'free' | 'basic' | 'pro') => {
    setSelectedPlan(plan);
    if (plan !== 'free') {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: { priceId: pricingPlans[plan].priceId }
        });

        if (error) throw error;
        if (data?.url) {
          window.open(data.url, '_blank');
        }
      } catch (error) {
        console.error('Checkout error:', error);
        toast.error('Failed to start checkout process');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({
          brand_name: brandName || 'My Brand',
          brand_color: brandColor,
          onboarding_completed: true,
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Welcome to CaptionGenie!');
      navigate('/home');
    } catch (error) {
      console.error('Onboarding completion error:', error);
      toast.error('Failed to complete onboarding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <Card className="w-full max-w-2xl p-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">CaptionGenie</h1>
          </div>
          <p className="text-muted-foreground">
            {step === 1 && "Choose your language"}
            {step === 2 && "Select your plan"}
            {step === 3 && "Set up your brand"}
          </p>
          <div className="flex gap-2 justify-center mt-4">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 w-16 rounded-full transition-all ${
                  s <= step ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step 1: Language Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4">
              {[
                { code: 'en', name: 'English', flag: '🇬🇧' },
                { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
                { code: 'es', name: 'Español', flag: '🇪🇸' },
              ].map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageSelect(lang.code as any)}
                  className={`p-4 rounded-lg border-2 transition-all flex items-center gap-4 hover:border-primary ${
                    selectedLang === lang.code ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <span className="text-3xl">{lang.flag}</span>
                  <span className="font-semibold text-lg">{lang.name}</span>
                  {selectedLang === lang.code && (
                    <Check className="h-5 w-5 text-primary ml-auto" />
                  )}
                </button>
              ))}
            </div>
            <Button 
              onClick={() => setStep(2)} 
              className="w-full" 
              size="lg"
              disabled={!selectedLang}
            >
              Continue
            </Button>
          </div>
        )}

        {/* Step 2: Plan Selection */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid gap-4">
              {Object.entries(pricingPlans).map(([key, plan]) => (
                <button
                  key={key}
                  onClick={() => handlePlanSelect(key as any)}
                  disabled={loading}
                  className={`p-6 rounded-lg border-2 transition-all text-left hover:border-primary ${
                    selectedPlan === key ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-xl mb-1">{plan.name}</h3>
                      <p className="text-3xl font-bold text-primary mb-3">
                        {plan.price === 0 ? 'Free' : `${plan.currency}${plan.price}`}
                        {plan.price > 0 && <span className="text-sm text-muted-foreground">/mo</span>}
                      </p>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        <li>✓ {plan.features.captionsPerMonth === Infinity ? 'Unlimited' : plan.features.captionsPerMonth} captions/month</li>
                        <li>✓ {plan.features.brandsLimit === Infinity ? 'Unlimited' : plan.features.brandsLimit} brand{plan.features.brandsLimit > 1 ? 's' : ''}</li>
                        {plan.features.analytics && <li>✓ Advanced analytics</li>}
                        {plan.features.team && <li>✓ Team collaboration</li>}
                      </ul>
                    </div>
                    {selectedPlan === key && (
                      <Check className="h-6 w-6 text-primary" />
                    )}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              <Button onClick={() => setStep(1)} variant="outline" size="lg" className="w-full">
                Back
              </Button>
              <Button 
                onClick={() => setStep(3)} 
                size="lg" 
                className="w-full"
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Continue'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Brand Setup */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brandName">Brand Name</Label>
                <Input
                  id="brandName"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Enter your brand name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brandColor">Brand Accent Color</Label>
                <div className="flex gap-4 items-center">
                  <input
                    type="color"
                    id="brandColor"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-12 w-20 rounded border cursor-pointer"
                  />
                  <Input
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    placeholder="#6366F1"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <Button onClick={() => setStep(2)} variant="outline" size="lg" className="w-full">
                Back
              </Button>
              <Button 
                onClick={handleFinish} 
                size="lg" 
                className="w-full"
                disabled={loading || !brandName}
              >
                {loading ? 'Setting up...' : 'Get Started'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
