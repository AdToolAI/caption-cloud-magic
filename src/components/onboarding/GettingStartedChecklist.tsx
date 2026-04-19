import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Sparkles, Video, Share2, Calendar, Palette, Rocket } from "lucide-react";
import { toast } from "sonner";
import { useGettingStartedProgress, ChecklistStep } from "@/hooks/useGettingStartedProgress";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "adtool-checklist-dismissed";
const COLLAPSED_KEY = "adtool-checklist-collapsed";

const stepIcons: Record<ChecklistStep["key"], any> = {
  onboarding: Sparkles,
  first_video: Video,
  social_connected: Share2,
  post_planned: Calendar,
  brand_kit: Palette,
};

const stepLabels: Record<string, Record<ChecklistStep["key"], string>> = {
  en: {
    onboarding: "Complete onboarding",
    first_video: "Create your first video",
    social_connected: "Connect a social account",
    post_planned: "Plan your first post",
    brand_kit: "Set up brand kit",
  },
  de: {
    onboarding: "Onboarding abschließen",
    first_video: "Erstes Video erstellen",
    social_connected: "Social-Konto verbinden",
    post_planned: "Ersten Post planen",
    brand_kit: "Brand Kit einrichten",
  },
  es: {
    onboarding: "Completar onboarding",
    first_video: "Crear tu primer video",
    social_connected: "Conectar cuenta social",
    post_planned: "Planificar primer post",
    brand_kit: "Configurar Brand Kit",
  },
};

const headlines: Record<string, { title: string; subtitle: string; allDone: string }> = {
  en: {
    title: "Getting Started",
    subtitle: "Complete these steps to unlock your full power",
    allDone: "All steps completed! 🎉",
  },
  de: {
    title: "Erste Schritte",
    subtitle: "Schließe diese Schritte ab, um dein volles Potenzial zu entfalten",
    allDone: "Alle Schritte abgeschlossen! 🎉",
  },
  es: {
    title: "Primeros pasos",
    subtitle: "Completa estos pasos para desbloquear todo tu potencial",
    allDone: "¡Todos los pasos completados! 🎉",
  },
};

export const GettingStartedChecklist = () => {
  const { user } = useAuth();
  const { language } = useTranslation();
  const { data: progress, isLoading } = useGettingStartedProgress();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  });
  const [dismissed, setDismissed] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  // Auto-dismiss when 100% reached
  useEffect(() => {
    if (progress?.isComplete && !dismissed) {
      toast.success(headlines[language].allDone);
      localStorage.setItem(STORAGE_KEY, "1");
      // Delay so user sees the celebratory state once
      const t = setTimeout(() => setDismissed(true), 4000);
      return () => clearTimeout(t);
    }
  }, [progress?.isComplete, dismissed, language]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  if (!user || isLoading || !progress || dismissed) return null;
  if (progress.totalCount === 0) return null;

  const labels = stepLabels[language] || stepLabels.en;
  const head = headlines[language] || headlines.en;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress.percent / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed left-[68px] bottom-6 z-40"
    >
      <AnimatePresence mode="wait">
        {collapsed ? (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={toggleCollapsed}
            className="ml-3 group relative flex h-12 w-12 items-center justify-center rounded-full bg-card border border-primary/30 shadow-[0_0_20px_hsl(var(--primary)/0.25)] hover:shadow-[0_0_30px_hsl(var(--primary)/0.45)] transition-all"
            aria-label={head.title}
          >
            <svg className="absolute inset-0 h-12 w-12 -rotate-90" viewBox="0 0 44 44">
              <circle
                cx="22"
                cy="22"
                r={radius}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="3"
              />
              <circle
                cx="22"
                cy="22"
                r={radius}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <span className="text-[11px] font-bold text-primary">
              {progress.completedCount}/{progress.totalCount}
            </span>
            <ChevronRight className="absolute -right-1 -top-1 h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, x: -10, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 300 }}
            exit={{ opacity: 0, x: -10, width: 0 }}
            transition={{ duration: 0.25 }}
            className="ml-3 w-[300px] rounded-2xl border border-primary/20 bg-card/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.35),0_0_24px_hsl(var(--primary)/0.15)] overflow-hidden"
          >
            {/* Header with progress ring */}
            <div className="relative p-4 border-b border-border bg-gradient-to-br from-primary/10 via-transparent to-accent/5">
              <button
                onClick={toggleCollapsed}
                className="absolute top-2 right-2 h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Collapse"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3">
                {/* Progress ring */}
                <div className="relative h-12 w-12 shrink-0">
                  <svg className="h-12 w-12 -rotate-90" viewBox="0 0 44 44">
                    <circle
                      cx="22"
                      cy="22"
                      r={radius}
                      fill="none"
                      stroke="hsl(var(--muted))"
                      strokeWidth="3"
                    />
                    <circle
                      cx="22"
                      cy="22"
                      r={radius}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      style={{
                        transition: "stroke-dashoffset 0.6s ease",
                        filter: "drop-shadow(0 0 6px hsl(var(--primary) / 0.6))",
                      }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[11px] font-bold text-primary">
                      {progress.completedCount}/{progress.totalCount}
                    </span>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Rocket className="h-3.5 w-3.5 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">{head.title}</h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                    {head.subtitle}
                  </p>
                </div>
              </div>
            </div>

            {/* Steps list */}
            <ul className="p-2 space-y-1 max-h-[360px] overflow-y-auto">
              {progress.steps.map((step) => {
                const Icon = stepIcons[step.key];
                const label = labels[step.key];

                return (
                  <li key={step.key}>
                    <Link
                      to={step.route}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all",
                        step.done
                          ? "bg-primary/5 text-muted-foreground"
                          : "hover:bg-muted/50 text-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "h-6 w-6 shrink-0 rounded-full flex items-center justify-center transition-all",
                          step.done
                            ? "bg-primary text-primary-foreground shadow-[0_0_10px_hsl(var(--primary)/0.5)]"
                            : "border-2 border-border group-hover:border-primary/60"
                        )}
                      >
                        {step.done ? (
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        ) : (
                          <Icon className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                        )}
                      </span>

                      <span
                        className={cn(
                          "text-xs font-medium flex-1 truncate",
                          step.done && "line-through opacity-60"
                        )}
                      >
                        {label}
                      </span>

                      {!step.done && (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
