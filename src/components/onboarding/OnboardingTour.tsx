import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface TourStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

interface OnboardingTourProps {
  onComplete: () => void;
  onSkip: () => void;
}

export const OnboardingTour = ({ onComplete, onSkip }: OnboardingTourProps) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);

  const tourSteps: TourStep[] = [
    {
      target: "[data-tour='welcome']",
      title: t("onboarding.welcome.title"),
      description: t("onboarding.welcome.description"),
      position: "bottom"
    },
    {
      target: "[data-tour='features']",
      title: t("onboarding.features.title"),
      description: t("onboarding.features.description"),
      position: "top"
    },
    {
      target: "[data-tour='generator']",
      title: t("onboarding.generator.title"),
      description: t("onboarding.generator.description"),
      position: "right"
    },
    {
      target: "[data-tour='performance']",
      title: t("onboarding.performance.title"),
      description: t("onboarding.performance.description"),
      position: "right"
    }
  ];

  useEffect(() => {
    const element = document.querySelector(tourSteps[currentStep].target);
    if (element instanceof HTMLElement) {
      setTargetElement(element);
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.style.position = "relative";
      element.style.zIndex = "1000";
    }
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    if (targetElement) {
      targetElement.style.position = "";
      targetElement.style.zIndex = "";
    }
    onComplete();
  };

  const handleSkipTour = () => {
    if (targetElement) {
      targetElement.style.position = "";
      targetElement.style.zIndex = "";
    }
    onSkip();
  };

  const getPosition = () => {
    if (!targetElement) return { top: "50%", left: "50%" };
    const rect = targetElement.getBoundingClientRect();
    const position = tourSteps[currentStep].position;

    switch (position) {
      case "bottom":
        return { top: rect.bottom + 20, left: rect.left };
      case "top":
        return { top: rect.top - 200, left: rect.left };
      case "left":
        return { top: rect.top, left: rect.left - 350 };
      case "right":
        return { top: rect.top, left: rect.right + 20 };
      default:
        return { top: rect.bottom + 20, left: rect.left };
    }
  };

  const position = getPosition();

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-[999] animate-fadeIn" onClick={handleSkipTour} />
      
      {/* Tour Card */}
      <Card 
        className="fixed z-[1001] w-[350px] shadow-2xl animate-scaleIn"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                {currentStep + 1} / {tourSteps.length}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSkipTour}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <h3 className="text-xl font-bold mb-2">{tourSteps[currentStep].title}</h3>
          <p className="text-muted-foreground mb-6">{tourSteps[currentStep].description}</p>

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("onboarding.back")}
            </Button>

            <Button onClick={handleNext} size="sm">
              {currentStep === tourSteps.length - 1 ? (
                t("onboarding.finish")
              ) : (
                <>
                  {t("onboarding.next")}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Highlight spotlight */}
      {targetElement && (
        <div 
          className="fixed border-4 border-primary rounded-lg z-[1000] pointer-events-none animate-pulse"
          style={{
            top: targetElement.getBoundingClientRect().top - 8,
            left: targetElement.getBoundingClientRect().left - 8,
            width: targetElement.offsetWidth + 16,
            height: targetElement.offsetHeight + 16,
          }}
        />
      )}
    </>
  );
};
