import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { NicheStep } from "./NicheStep";
import { PlatformStep } from "./PlatformStep";
import { GoalsStep } from "./GoalsStep";
import { StarterPlanPreview } from "./StarterPlanPreview";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles } from "lucide-react";

interface NicheTutorialModalProps {
  onComplete: () => void;
}

interface PlanItem {
  id?: string;
  day_of_week: number;
  suggested_date: string;
  suggested_time: string;
  platform: string;
  content_idea: string;
  tips: string;
}

export function NicheTutorialModal({ onComplete }: NicheTutorialModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Niche state
  const [businessType, setBusinessType] = useState("");
  const [niche, setNiche] = useState("");

  // Platform state
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  // Goals state
  const [postingGoal, setPostingGoal] = useState("");
  const [postsPerWeek, setPostsPerWeek] = useState(5);
  const [experienceLevel, setExperienceLevel] = useState("");

  // Plan state
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const generatePlan = async () => {
    if (!user) return;
    setPlanLoading(true);
    setPlanError(null);
    setStep(3);

    try {
      // Save onboarding profile
      await supabase.from("onboarding_profiles").upsert({
        user_id: user.id,
        niche,
        business_type: businessType,
        platforms: selectedPlatforms,
        posting_goal: postingGoal,
        posts_per_week: postsPerWeek,
        experience_level: experienceLevel,
      }, { onConflict: "user_id" });

      // Call starter-plan + first-video-prompts in parallel.
      // first-video-prompts is fire-and-forget — failures fall back to defaults in the hook.
      const [{ data, error }] = await Promise.all([
        supabase.functions.invoke("generate-starter-plan", {
          body: {
            niche,
            business_type: businessType,
            platforms: selectedPlatforms,
            posting_goal: postingGoal,
            posts_per_week: postsPerWeek,
            experience_level: experienceLevel,
          },
        }),
        supabase.functions
          .invoke("generate-first-video-prompts", {
            body: {
              language: typeof navigator !== "undefined" ? (navigator.language?.slice(0, 2) || "en") : "en",
            },
          })
          .catch((e) => {
            console.warn("first-video-prompts generation failed:", e);
            return null;
          }),
      ]);

      if (error) throw error;
      setPlans(data?.plans || []);
    } catch (err: any) {
      console.error("Plan generation error:", err);
      setPlanError("Fehler beim Erstellen des Plans. Bitte versuche es erneut.");
    } finally {
      setPlanLoading(false);
    }
  };

  const steps = [
    <NicheStep
      key="niche"
      businessType={businessType}
      niche={niche}
      onBusinessTypeChange={setBusinessType}
      onNicheChange={setNiche}
      onNext={() => setStep(1)}
      onBack={() => {}}
    />,
    <PlatformStep
      key="platform"
      selectedPlatforms={selectedPlatforms}
      onToggle={togglePlatform}
      onNext={() => setStep(2)}
      onBack={() => setStep(0)}
    />,
    <GoalsStep
      key="goals"
      postingGoal={postingGoal}
      postsPerWeek={postsPerWeek}
      experienceLevel={experienceLevel}
      onGoalChange={setPostingGoal}
      onPostsPerWeekChange={setPostsPerWeek}
      onExperienceChange={setExperienceLevel}
      onNext={generatePlan}
      onBack={() => setStep(1)}
    />,
    <StarterPlanPreview
      key="plan"
      plans={plans}
      loading={planLoading}
      error={planError}
      onComplete={onComplete}
      onRetry={generatePlan}
    />,
  ];

  return (
    <Dialog open modal>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <VisuallyHidden>
          <DialogTitle>Personalisiere dein Dashboard</DialogTitle>
          <DialogDescription>
            Drei kurze Schritte, um deinen personalisierten Wochenplan zu erstellen.
          </DialogDescription>
        </VisuallyHidden>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Personalisiere dein Dashboard</h2>
          </div>

          {step < 3 && (
            <div className="flex gap-1 justify-center">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i <= step ? "w-8 bg-primary" : "w-8 bg-muted"
                  }`}
                />
              ))}
            </div>
          )}

          {steps[step]}
        </div>
      </DialogContent>
    </Dialog>
  );
}
