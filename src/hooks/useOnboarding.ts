import { useState, useEffect } from "react";

const ONBOARDING_KEY = "adtool-ai-onboarding-completed";

export const useOnboarding = () => {
  const [showWelcome, setShowWelcome] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(true);

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      setIsOnboardingComplete(false);
      // Delay showing welcome modal slightly for better UX
      setTimeout(() => setShowWelcome(true), 500);
    }
  }, []);

  const startTour = () => {
    setShowWelcome(false);
    setShowTour(true);
  };

  const skipOnboarding = () => {
    setShowWelcome(false);
    setShowTour(false);
    completeOnboarding();
  };

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setIsOnboardingComplete(true);
    setShowTour(false);
  };

  const resetOnboarding = () => {
    localStorage.removeItem(ONBOARDING_KEY);
    setIsOnboardingComplete(false);
    setShowWelcome(true);
  };

  return {
    showWelcome,
    showTour,
    isOnboardingComplete,
    startTour,
    skipOnboarding,
    completeOnboarding,
    resetOnboarding,
  };
};
