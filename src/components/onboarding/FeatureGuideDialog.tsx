import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ExternalLink, ListChecks, Sparkles, BookOpen } from "lucide-react";

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

const MISSION_INDEX: Record<string, string> = {
  planMonth: "01",
  optimizePerformance: "02",
  scaleCampaigns: "03",
};

export function FeatureGuideDialog({ featureId, open, onClose }: FeatureGuideDialogProps) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();

  if (!featureId) return null;

  const guide = t(`featureGuides.${featureId}`) as any;
  const missionNo = MISSION_INDEX[featureId] ?? "";

  const steps: SetupStep[] = [];
  for (let i = 1; i <= 6; i++) {
    const step = guide[`step${i}`];
    if (step && typeof step === "object") {
      steps.push({
        number: i,
        title: step.title || "",
        description: step.description || "",
        actionLabel: step.actionLabel,
        actionLink: step.actionLink,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto p-0 gap-0 border-primary/20 bg-gradient-to-b from-background via-card/60 to-background backdrop-blur-2xl shadow-[0_20px_80px_-20px_hsl(var(--primary)/0.4)]">
        {/* Ambient gold glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-64 w-[120%] rounded-full bg-primary/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 right-0 h-64 w-1/2 rounded-full bg-accent/10 blur-3xl"
        />

        {/* HERO */}
        <header className="relative px-8 pt-8 pb-6">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-accent/90 font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span>Mission · {missionNo}</span>
          </div>

          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-gold-dark blur-md opacity-60" />
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/90 to-gold-dark flex items-center justify-center text-2xl shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)]">
                {guide.icon ?? "✦"}
              </div>
            </div>
            <div className="flex-1 pt-1">
              <h2 className="font-display text-3xl leading-tight">
                <span className="bg-gradient-to-r from-foreground via-primary to-gold-dark bg-clip-text text-transparent">
                  {guide.title}
                </span>
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {guide.description}
              </p>
            </div>
          </div>

          <div className="mt-6 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        </header>

        {/* BODY */}
        <div className="relative px-8 pb-6 space-y-8">
          {/* Overview */}
          {guide.whatDescription && (
            <section className="relative pl-4">
              <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary to-transparent" />
              <div className="text-[10px] uppercase tracking-[0.25em] text-primary/90 font-medium mb-2">
                {guide.whatIsIt || t("featureGuides.common.whatIsIt")}
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed">
                {guide.whatDescription}
              </p>
            </section>
          )}

          {/* Steps timeline */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <ListChecks className="h-4 w-4 text-primary" />
              <h3 className="font-display text-lg text-foreground">
                {guide.setupTitle || t("featureGuides.common.setupTitle")}
              </h3>
            </div>

            <div className="relative">
              {/* Vertical connector */}
              <div
                aria-hidden
                className="absolute left-5 top-5 bottom-5 w-px bg-gradient-to-b from-primary/60 via-primary/25 to-transparent"
              />

              <ol className="space-y-6">
                {steps.map((step, i) => (
                  <motion.li
                    key={step.number}
                    initial={reduce ? undefined : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.05, ease: "easeOut" }}
                    className="group relative flex gap-4"
                  >
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full border border-primary/40 bg-background/70 backdrop-blur flex items-center justify-center font-display text-primary text-sm transition-all duration-300 group-hover:border-primary group-hover:shadow-[0_0_20px_hsl(var(--primary)/0.5)] group-hover:scale-105">
                        {String(step.number).padStart(2, "0")}
                      </div>
                    </div>
                    <div className="flex-1 pt-1.5 pb-1">
                      <h4 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                        {step.title}
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {step.description}
                      </p>
                      {step.actionLink && step.actionLabel && (
                        <Link
                          to={step.actionLink}
                          onClick={onClose}
                          className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary font-medium relative after:content-[''] after:absolute after:left-0 after:-bottom-0.5 after:w-full after:h-px after:bg-primary after:origin-left after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300"
                        >
                          {step.actionLabel}
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ol>
            </div>
          </section>

          {/* Pro Tip */}
          {guide.proTip && (
            <section className="relative rounded-xl border border-primary/25 bg-card/40 backdrop-blur-md p-4 overflow-hidden">
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none"
              />
              <div className="relative flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-medium mb-1">
                    {t("featureGuides.common.proTip")}
                  </div>
                  <p className="text-sm text-foreground/85 leading-relaxed">{guide.proTip}</p>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* FOOTER */}
        <footer className="relative px-8 py-5 border-t border-primary/15 bg-background/40 backdrop-blur-md">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <div className="flex items-center justify-between gap-4">
            {guide.docsLink ? (
              <Button
                variant="outline"
                asChild
                className="border-primary/30 hover:border-primary/60 hover:bg-primary/5 text-foreground"
              >
                <a
                  href={guide.docsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <BookOpen className="h-4 w-4" />
                  {t("featureGuides.common.viewDocs")}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              </Button>
            ) : (
              <div />
            )}

            <Button
              asChild
              onClick={onClose}
              className="bg-gradient-to-r from-primary to-gold-dark text-background font-semibold hover:shadow-[0_0_30px_hsl(var(--primary)/0.55)] transition-shadow"
            >
              <Link to={guide.quickStartLink} className="flex items-center gap-2">
                {guide.quickStartLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
