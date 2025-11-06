import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Link2, Palette, Target, Calendar, Zap, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { FEATURE_FLAGS } from '@/config/pricing';
import { trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';

interface OnboardingStep {
  id: string;
  label: string;
  icon: any;
  route?: string;
  action?: () => void | Promise<void>;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  { 
    id: 'accounts', 
    label: 'Konten verbinden', 
    icon: Link2, 
    route: '/instagram-publishing' 
  },
  { 
    id: 'brandkit', 
    label: 'Brand-Kit einrichten', 
    icon: Palette, 
    route: '/brand-kit' 
  },
  { 
    id: 'goal', 
    label: 'Ziel festlegen', 
    icon: Target, 
    route: '/goals-dashboard' 
  },
  { 
    id: 'plan', 
    label: '1-Wochen-Plan generieren', 
    icon: Calendar, 
    route: '/calendar' 
  },
  { 
    id: 'automation', 
    label: 'Auto-Posting aktivieren', 
    icon: Zap, 
    route: '/calendar' 
  }
];

export const OnboardingStepper = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Check if onboarding should be shown
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!user) return;

      // Check localStorage first (fast)
      const localDismissed = localStorage.getItem('onboarding_dismissed');
      if (localDismissed === 'true') {
        setDismissed(true);
        return;
      }

      // Check feature flag
      const ffEnabled = FEATURE_FLAGS.ff_onboarding_v1;

      if (!ffEnabled) {
        setDismissed(true);
        return;
      }

      // Check completed steps from localStorage
      const savedSteps = localStorage.getItem('onboarding_completed_steps');
      if (savedSteps) {
        const steps = JSON.parse(savedSteps);
        setCompletedSteps(steps);
        
        // If all steps completed, dismiss
        if (steps.length === ONBOARDING_STEPS.length) {
          setDismissed(true);
          localStorage.setItem('onboarding_dismissed', 'true');
          return;
        }
        
        setCurrentStep(steps.length);
      } else {
        // First time - track onboarding started
        localStorage.setItem('onboarding_start_time', Date.now().toString());
      }

      setIsVisible(true);
    };

    checkOnboardingStatus();
  }, [user]);

  const handleStepComplete = async (stepId: string) => {
    const newCompleted = [...completedSteps, stepId];
    setCompletedSteps(newCompleted);
    localStorage.setItem('onboarding_completed_steps', JSON.stringify(newCompleted));

    // Track onboarding step with PostHog
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
      step: stepId,
      step_number: currentStep + 1,
      step_name: ONBOARDING_STEPS[currentStep]?.label,
      total_steps: ONBOARDING_STEPS.length
    });

    // Move to next step
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // All steps completed - track onboarding finished
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_FINISHED, {
        completed_steps: newCompleted.length,
        duration_seconds: Math.floor((Date.now() - (parseInt(localStorage.getItem('onboarding_start_time') || '0'))) / 1000)
      });
      
      setDismissed(true);
      localStorage.setItem('onboarding_dismissed', 'true');
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('onboarding_dismissed', 'true');
  };

  const handleStepClick = (step: OnboardingStep, index: number) => {
    if (step.route) {
      navigate(step.route);
    }
    if (step.action) {
      step.action();
    }
    
    // Mark as complete if not already
    if (!completedSteps.includes(step.id)) {
      handleStepComplete(step.id);
    }
  };

  if (dismissed || !isVisible) return null;

  const progress = (completedSteps.length / ONBOARDING_STEPS.length) * 100;
  const currentStepData = ONBOARDING_STEPS[currentStep];

  return (
    <div className="sticky top-0 z-50 bg-gradient-to-r from-primary/10 to-accent/10 border-b border-border backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-4">
          {/* Progress */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">
                Willkommen! Richte dein Konto ein ({completedSteps.length}/{ONBOARDING_STEPS.length})
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <Progress value={progress} className="h-2 mb-3" />

            {/* Steps */}
            <div className="flex gap-2 flex-wrap">
              {ONBOARDING_STEPS.map((step, index) => {
                const Icon = step.icon;
                const isCompleted = completedSteps.includes(step.id);
                const isCurrent = index === currentStep;

                return (
                  <Button
                    key={step.id}
                    variant={isCurrent ? 'default' : isCompleted ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => handleStepClick(step, index)}
                    className="gap-2"
                    disabled={index > currentStep && !isCompleted}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">{step.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
