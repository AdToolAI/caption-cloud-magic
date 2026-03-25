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
import { NicheStep } from "@/components/onboarding/NicheStep";
import { PlatformStep } from "@/components/onboarding/PlatformStep";
import { GoalsStep } from "@/components/onboarding/GoalsStep";
import { StarterPlanPreview } from "@/components/onboarding/StarterPlanPreview";

const STEPS = ["language", "niche", "platforms", "goals", "brand", "plan"] as const;
type Step = typeof STEPS[number];

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState<Step>("language");
  const [selectedLang, setSelectedLang] = useState<string>("en");
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("basic");
  const [brandName, setBrandName] = useState("");
  const [brandColor, setBrandColor] = useState("#6366F1");
  const [loading, setLoading] = useState(false);

  // New onboarding data
  const [businessType, setBusinessType] = useState("creator");
  const [niche, setNiche] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [postingGoal, setPostingGoal] = useState("grow_audience");
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [experienceLevel, setExperienceLevel] = useState("beginner");
  const [starterPlans, setStarterPlans] = useState<any[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const { t, language, setLanguage } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const languages = [
    { code: "en", name: "English", flag: "🇬🇧" },
    { code: "de", name: "Deutsch", flag: "🇩🇪" },
    { code: "es", name: "Español", flag: "🇪🇸" },
  ];

  const stepIndex = STEPS.indexOf(currentStep);

  const handleLanguageNext = () => {
    setLanguage(selectedLang as any);
    localStorage.setItem("cg_lang", selectedLang);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step: 1, step_name: "language", language: selectedLang });
    setCurrentStep("niche");
  };

  const handlePlatformToggle = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  const handleBrandNext = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Save onboarding profile
      const { error: profileError } = await supabase.from("onboarding_profiles").upsert({
        user_id: user.id,
        niche,
        business_type: businessType,
        platforms: selectedPlatforms,
        posting_goal: postingGoal,
        posts_per_week: postsPerWeek,
        experience_level: experienceLevel,
      }, { onConflict: "user_id" });

      if (profileError) throw profileError;

      // Save brand info
      const { error: brandError } = await supabase.from("profiles").update({
        brand_name: brandName || "My Brand",
        brand_color: brandColor,
      }).eq("id", user.id);

      if (brandError) throw brandError;

      setCurrentStep("plan");
      generatePlan();
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Fehler beim Speichern");
    } finally {
      setLoading(false);
    }
  };

  const generatePlan = async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-starter-plan", {
        body: { niche, business_type: businessType, platforms: selectedPlatforms, posting_goal: postingGoal, posts_per_week: postsPerWeek, experience_level: experienceLevel },
      });

      if (error) throw error;
      if (data?.plans) setStarterPlans(data.plans);
      else throw new Error("No plans returned");
    } catch (err: any) {
      console.error("Plan generation error:", err);
      setPlanError("Plan konnte nicht erstellt werden. Bitte versuche es erneut.");
    } finally {
      setPlanLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("profiles").update({
        onboarding_completed: true,
        plan: selectedPlan,
      }).eq("id", user.id);

      if (error) throw error;

      trackEvent(ANALYTICS_EVENTS.ONBOARDING_FINISHED, {
        brand_name: brandName,
        niche,
        business_type: businessType,
        platforms: selectedPlatforms,
        posting_goal: postingGoal,
        posts_per_week: postsPerWeek,
        user_id: user.id,
      });

      toast.success("Willkommen bei AdTool AI! 🚀");
      navigate("/home");
    } catch (err) {
      console.error("Complete error:", err);
      toast.error("Fehler beim Abschließen");
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
          <CardTitle className="text-3xl">
            {currentStep === "plan" ? "Dein Starter-Plan" : "Willkommen!"}
          </CardTitle>
          <CardDescription>
            {currentStep === "plan"
              ? "Dein personalisierter Wochenplan"
              : `Schritt ${stepIndex + 1} von ${STEPS.length}`}
          </CardDescription>

          <div className="flex justify-center gap-1.5 mt-6">
            {STEPS.map((_, idx) => (
              <div
                key={idx}
                className={`h-2 w-12 rounded-full transition-all ${
                  stepIndex >= idx ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step 1: Language */}
          {currentStep === "language" && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-center">Wähle deine Sprache</h3>
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
                      {selectedLang === lang.code && <Check className="h-5 w-5 text-primary mt-2" />}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button onClick={handleLanguageNext} className="w-full" size="lg">Weiter</Button>
            </div>
          )}

          {/* Step 2: Niche */}
          {currentStep === "niche" && (
            <NicheStep
              businessType={businessType}
              niche={niche}
              onBusinessTypeChange={setBusinessType}
              onNicheChange={setNiche}
              onNext={() => {
                trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step: 2, step_name: "niche", niche, business_type: businessType });
                setCurrentStep("platforms");
              }}
              onBack={() => setCurrentStep("language")}
            />
          )}

          {/* Step 3: Platforms */}
          {currentStep === "platforms" && (
            <PlatformStep
              selectedPlatforms={selectedPlatforms}
              onToggle={handlePlatformToggle}
              onNext={() => {
                trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step: 3, step_name: "platforms", platforms: selectedPlatforms });
                setCurrentStep("goals");
              }}
              onBack={() => setCurrentStep("niche")}
            />
          )}

          {/* Step 4: Goals */}
          {currentStep === "goals" && (
            <GoalsStep
              postingGoal={postingGoal}
              postsPerWeek={postsPerWeek}
              experienceLevel={experienceLevel}
              onGoalChange={setPostingGoal}
              onPostsPerWeekChange={setPostsPerWeek}
              onExperienceChange={setExperienceLevel}
              onNext={() => {
                trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step: 4, step_name: "goals", posting_goal: postingGoal, posts_per_week: postsPerWeek });
                setCurrentStep("brand");
              }}
              onBack={() => setCurrentStep("platforms")}
            />
          )}

          {/* Step 5: Brand */}
          {currentStep === "brand" && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-center">Richte deine Marke ein</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="brandName">Markenname</Label>
                  <Input
                    id="brandName"
                    placeholder="Meine Marke"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="brandColor">Markenfarbe</Label>
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
              <div className="flex gap-4">
                <Button onClick={() => setCurrentStep("goals")} variant="outline" size="lg" className="w-full">
                  Zurück
                </Button>
                <Button onClick={handleBrandNext} size="lg" className="w-full" disabled={loading || !brandName}>
                  {loading ? "Speichern..." : "Plan erstellen"}
                </Button>
              </div>
            </div>
          )}

          {/* Step 6: Starter Plan */}
          {currentStep === "plan" && (
            <StarterPlanPreview
              plans={starterPlans}
              loading={planLoading}
              error={planError}
              onComplete={handleComplete}
              onRetry={generatePlan}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
