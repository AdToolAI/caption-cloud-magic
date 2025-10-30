import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { ArrowRight, ExternalLink, CheckCircle2, LucideIcon } from "lucide-react";

interface FeatureGuideDialogProps {
  featureId: string | null;
  open: boolean;
  onClose: () => void;
}

interface SetupStep {
  number: number;
  title: string;
  description: string;
  actionLabel?: string;
  actionLink?: string;
}

export function FeatureGuideDialog({ featureId, open, onClose }: FeatureGuideDialogProps) {
  const { t } = useTranslation();

  if (!featureId) return null;

  const guide = t(`featureGuides.${featureId}`) as any;
  
  // Parse steps from translation
  const steps: SetupStep[] = [];
  for (let i = 1; i <= 6; i++) {
    const step = guide[`step${i}`];
    if (step && typeof step === 'object') {
      steps.push({
        number: i,
        title: step.title || '',
        description: step.description || '',
        actionLabel: step.actionLabel,
        actionLink: step.actionLink
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-heading flex items-center gap-3">
            {guide.icon && <span className="text-3xl">{guide.icon}</span>}
            {guide.title}
          </DialogTitle>
          <DialogDescription className="text-base mt-2">
            {guide.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-6">
          {/* What is this? */}
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
            <h4 className="font-semibold text-sm text-primary mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {guide.whatIsIt || t('featureGuides.common.whatIsIt')}
            </h4>
            <p className="text-sm text-muted-foreground">
              {guide.whatDescription}
            </p>
          </div>

          {/* Setup Steps */}
          <div>
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              <span className="text-primary">📋</span>
              {guide.setupTitle || t('featureGuides.common.setupTitle')}
            </h4>
            
            <div className="space-y-5">
              {steps.map((step) => (
                <div key={step.number} className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                    {step.number}
                  </div>
                  <div className="flex-1 pt-1">
                    <h5 className="font-semibold mb-1">{step.title}</h5>
                    <p className="text-sm text-muted-foreground mb-2">
                      {step.description}
                    </p>
                    {step.actionLink && step.actionLabel && (
                      <Button 
                        variant="link" 
                        asChild 
                        className="h-auto p-0 text-primary"
                        onClick={onClose}
                      >
                        <Link to={step.actionLink} className="flex items-center gap-1">
                          {step.actionLabel} <ArrowRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pro Tip */}
          {guide.proTip && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <h4 className="font-semibold text-sm text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-2">
                💡 {t('featureGuides.common.proTip')}
              </h4>
              <p className="text-sm text-muted-foreground">
                {guide.proTip}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-4 mt-8 pt-6 border-t">
          {guide.docsLink ? (
            <Button variant="outline" asChild>
              <a href={guide.docsLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                {t('featureGuides.common.viewDocs')}
              </a>
            </Button>
          ) : (
            <div />
          )}
          
          <Button 
            asChild
            className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 hover:shadow-glow"
            onClick={onClose}
          >
            <Link to={guide.quickStartLink} className="flex items-center gap-2">
              {guide.quickStartLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
