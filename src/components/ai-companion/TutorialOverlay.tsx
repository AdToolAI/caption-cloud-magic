import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface TutorialStep {
  target: string; // CSS selector
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  action?: 'click' | 'input' | 'observe';
}

export interface Tutorial {
  id: string;
  name: string;
  steps: TutorialStep[];
}

export const TUTORIALS: Record<string, Tutorial> = {
  'instagram-connect': {
    id: 'instagram-connect',
    name: 'Instagram verbinden',
    steps: [
      {
        target: '[data-tutorial="settings-nav"]',
        title: 'Schritt 1: Einstellungen öffnen',
        description: 'Klicke auf "Einstellungen" in der Seitenleiste',
        position: 'right',
        action: 'click'
      },
      {
        target: '[data-tutorial="social-media-tab"]',
        title: 'Schritt 2: Social Media',
        description: 'Wähle den Tab "Social Media" aus',
        position: 'bottom',
        action: 'click'
      },
      {
        target: '[data-tutorial="platform-instagram"]',
        title: 'Schritt 3: Instagram verbinden',
        description: 'Klicke auf "Verbinden" bei Instagram. Du wirst zu Meta weitergeleitet.',
        position: 'left',
        action: 'click'
      },
      {
        target: '[data-tutorial="instagram-connected"]',
        title: 'Fertig! 🎉',
        description: 'Instagram ist jetzt verbunden. Der Token ist 60 Tage gültig.',
        position: 'left',
        action: 'observe'
      }
    ]
  },
  'youtube-connect': {
    id: 'youtube-connect',
    name: 'YouTube verbinden',
    steps: [
      {
        target: '[data-tutorial="settings-nav"]',
        title: 'Schritt 1: Einstellungen öffnen',
        description: 'Klicke auf "Einstellungen" in der Seitenleiste',
        position: 'right',
        action: 'click'
      },
      {
        target: '[data-tutorial="platform-youtube"]',
        title: 'Schritt 2: YouTube verbinden',
        description: 'Klicke auf "Verbinden" bei YouTube und melde dich mit deinem Google-Account an.',
        position: 'left',
        action: 'click'
      }
    ]
  },
  'first-post': {
    id: 'first-post',
    name: 'Ersten Post erstellen',
    steps: [
      {
        target: '[data-tutorial="calendar-nav"]',
        title: 'Schritt 1: Kalender öffnen',
        description: 'Öffne den Intelligent Calendar',
        position: 'right',
        action: 'click'
      },
      {
        target: '[data-tutorial="calendar-add-post"]',
        title: 'Schritt 2: Post erstellen',
        description: 'Klicke auf einen Tag, um einen neuen Post zu erstellen',
        position: 'bottom',
        action: 'click'
      }
    ]
  }
};

interface TutorialOverlayProps {
  tutorialId: string | null;
  onClose: () => void;
  onComplete: (tutorialId: string) => void;
}

export function TutorialOverlay({ tutorialId, onClose, onComplete }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const tutorial = tutorialId ? TUTORIALS[tutorialId] : null;
  const step = tutorial?.steps[currentStep];

  const updateTargetPosition = useCallback(() => {
    if (!step?.target) return;
    const element = document.querySelector(step.target);
    if (element) {
      setTargetRect(element.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [step?.target]);

  useEffect(() => {
    updateTargetPosition();
    window.addEventListener('resize', updateTargetPosition);
    window.addEventListener('scroll', updateTargetPosition);
    
    // Poll for element in case it's not immediately available
    const interval = setInterval(updateTargetPosition, 500);
    
    return () => {
      window.removeEventListener('resize', updateTargetPosition);
      window.removeEventListener('scroll', updateTargetPosition);
      clearInterval(interval);
    };
  }, [updateTargetPosition]);

  const handleNext = () => {
    if (!tutorial) return;
    if (currentStep < tutorial.steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete(tutorial.id);
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  if (!tutorial || !step) return null;

  const isLastStep = currentStep === tutorial.steps.length - 1;
  const tooltipPosition = step.position || 'bottom';

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      };
    }

    const padding = 16;
    const tooltipWidth = 320;
    const tooltipHeight = 160;

    switch (tooltipPosition) {
      case 'top':
        return {
          position: 'fixed',
          bottom: window.innerHeight - targetRect.top + padding,
          left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2
        };
      case 'bottom':
        return {
          position: 'fixed',
          top: targetRect.bottom + padding,
          left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2
        };
      case 'left':
        return {
          position: 'fixed',
          top: targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
          right: window.innerWidth - targetRect.left + padding
        };
      case 'right':
        return {
          position: 'fixed',
          top: targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
          left: targetRect.right + padding
        };
      default:
        return {
          position: 'fixed',
          top: targetRect.bottom + padding,
          left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2
        };
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] pointer-events-none"
      >
        {/* Backdrop with spotlight */}
        <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={onClose} />

        {/* Spotlight on target element */}
        {targetRect && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute pointer-events-none"
            style={{
              top: targetRect.top - 8,
              left: targetRect.left - 8,
              width: targetRect.width + 16,
              height: targetRect.height + 16,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
              borderRadius: 12
            }}
          >
            {/* Pulsing ring */}
            <motion.div
              className="absolute inset-0 rounded-xl border-2 border-primary"
              animate={{
                scale: [1, 1.05, 1],
                opacity: [1, 0.7, 1]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
            />
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-xl bg-primary/20 blur-xl -z-10" />
          </motion.div>
        )}

        {/* Tooltip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="pointer-events-auto bg-card/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl w-[320px]"
          style={getTooltipStyle()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                {currentStep + 1}
              </div>
              <span className="text-sm text-muted-foreground">
                von {tutorial.steps.length}
              </span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-4">
            <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
            <p className="text-sm text-muted-foreground">{step.description}</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-white/10">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="h-8"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Zurück
            </Button>
            <Button
              size="sm"
              onClick={handleNext}
              className={cn(
                "h-8",
                isLastStep && "bg-green-600 hover:bg-green-700"
              )}
            >
              {isLastStep ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Fertig
                </>
              ) : (
                <>
                  Weiter
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
