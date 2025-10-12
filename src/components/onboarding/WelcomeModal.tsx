import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/hooks/useTranslation";
import { Sparkles, Zap, Target, TrendingUp } from "lucide-react";

interface WelcomeModalProps {
  open: boolean;
  onStartTour: () => void;
  onSkip: () => void;
}

export const WelcomeModal = ({ open, onStartTour, onSkip }: WelcomeModalProps) => {
  const { t } = useTranslation();

  const features = [
    {
      icon: Sparkles,
      title: t("onboarding.modal.feature1.title"),
      description: t("onboarding.modal.feature1.description")
    },
    {
      icon: Zap,
      title: t("onboarding.modal.feature2.title"),
      description: t("onboarding.modal.feature2.description")
    },
    {
      icon: Target,
      title: t("onboarding.modal.feature3.title"),
      description: t("onboarding.modal.feature3.description")
    },
    {
      icon: TrendingUp,
      title: t("onboarding.modal.feature4.title"),
      description: t("onboarding.modal.feature4.description")
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onSkip}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            {t("onboarding.modal.title")}
          </DialogTitle>
          <DialogDescription className="text-base mt-2">
            {t("onboarding.modal.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 my-6">
          {features.map((feature, index) => (
            <div key={index} className="flex gap-3 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
              <div className="p-2 bg-primary/10 rounded-lg h-fit">
                <feature.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">{feature.title}</h4>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onSkip}>
            {t("onboarding.modal.skip")}
          </Button>
          <Button onClick={onStartTour} className="gradient-primary text-white">
            {t("onboarding.modal.startTour")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
