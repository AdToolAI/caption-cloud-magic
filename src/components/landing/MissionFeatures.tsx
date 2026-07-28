import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, BarChart3, Rocket, ArrowRight, Zap, Film, Users, ShieldCheck } from "lucide-react";
import { FeatureGuideDialog } from "@/components/onboarding/FeatureGuideDialog";
import { useTranslation } from "@/hooks/useTranslation";
import { PlanCockpit } from "./cockpits/PlanCockpit";
import { SignalCockpit } from "./cockpits/SignalCockpit";
import { ScaleCockpit } from "./cockpits/ScaleCockpit";

export const MissionFeatures = () => {
  const [selectedMission, setSelectedMission] = useState<string | null>(null);
  const { t } = useTranslation();

  const missions = [
    {
      icon: CalendarDays,
      title: t("landing.mission.planMonth"),
      description: t("landing.mission.planMonthDesc"),
      step: "01",
      featureId: "planMonth",
      Cockpit: PlanCockpit,
    },
    {
      icon: BarChart3,
      title: t("landing.mission.optimizePerformance"),
      description: t("landing.mission.optimizePerformanceDesc"),
      step: "02",
      featureId: "optimizePerformance",
      Cockpit: SignalCockpit,
    },
    {
      icon: Rocket,
      title: t("landing.mission.scaleCampaigns"),
      description: t("landing.mission.scaleCampaignsDesc"),
      step: "03",
      featureId: "scaleCampaigns",
      Cockpit: ScaleCockpit,
    },
  ];

  const proofs = [
    { icon: Zap, label: t("landing.mission.proof.multiProvider") },
    { icon: Film, label: t("landing.mission.proof.lipSync") },
    { icon: Users, label: t("landing.mission.proof.castLock") },
    { icon: ShieldCheck, label: t("landing.mission.proof.priceGuarantee") },
  ];

  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />

      <div className="container relative z-10 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-full text-sm font-medium mb-4">
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            {t("landing.mission.badge")}
          </div>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            <span className="text-foreground">{t("landing.mission.title1")}</span>
            <span className="bg-gradient-to-r from-primary to-gold-dark bg-clip-text text-transparent">
              {t("landing.mission.title2")}
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t("landing.mission.subtitle")}
          </p>
        </motion.div>

        <div className="relative">
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent -translate-y-1/2" />

          <div className="grid md:grid-cols-3 gap-8">
            {missions.map((mission, index) => (
              <motion.div
                key={mission.featureId}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                whileHover={{ y: -4 }}
                className="group relative"
              >
                <div className="relative bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl p-6 h-full hover:border-primary/50 transition-all duration-500 hover:shadow-[var(--shadow-glow-gold)] overflow-hidden">
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-gold-dark transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />

                  <div className="absolute top-4 right-4 text-5xl font-bold text-border/30 font-display pointer-events-none">
                    {mission.step}
                  </div>

                  {/* Live-Metric Cockpit */}
                  <div className="mb-5">
                    <mission.Cockpit />
                  </div>

                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <mission.icon className="h-6 w-6 text-primary" />
                  </div>

                  <h3 className="text-xl font-semibold text-foreground mb-3 group-hover:text-primary transition-colors">
                    {mission.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                    {mission.description}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-accent/90 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      {t("landing.mission.betaPreview")}
                    </div>
                    <button
                      onClick={() => setSelectedMission(mission.featureId)}
                      className="flex items-center gap-1.5 text-primary text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:underline"
                    >
                      <span>{t("landing.mission.learnMore")}</span>
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Qualitative proof strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          {proofs.map((p) => (
            <div
              key={p.label}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card/40 backdrop-blur-md border border-border/40 hover:border-primary/40 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center shrink-0">
                <p.icon className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm text-foreground/90 font-medium">{p.label}</span>
            </div>
          ))}
        </motion.div>
      </div>

      <FeatureGuideDialog
        featureId={selectedMission}
        open={selectedMission !== null}
        onClose={() => setSelectedMission(null)}
      />
    </section>
  );
};
