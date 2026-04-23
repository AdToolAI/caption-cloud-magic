import { motion } from "framer-motion";
import { CalendarCheck, Gift, ShieldCheck, Clock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export const TrialPromiseStrip = () => {
  const { t } = useTranslation();

  const items = [
    {
      icon: CalendarCheck,
      title: t("landing.pricing.trialPromise.p1Title"),
      desc: t("landing.pricing.trialPromise.p1Desc"),
    },
    {
      icon: Gift,
      title: t("landing.pricing.trialPromise.p2Title"),
      desc: t("landing.pricing.trialPromise.p2Desc"),
    },
    {
      icon: ShieldCheck,
      title: t("landing.pricing.trialPromise.p3Title"),
      desc: t("landing.pricing.trialPromise.p3Desc"),
    },
    {
      icon: Clock,
      title: t("landing.pricing.trialPromise.p4Title"),
      desc: t("landing.pricing.trialPromise.p4Desc"),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="mb-10"
    >
      <div className="relative rounded-2xl border border-primary/20 bg-card/40 backdrop-blur-xl p-6 md:p-8 shadow-[0_8px_30px_-12px_hsla(43,90%,68%,0.15)]">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="flex items-center gap-2 mb-5">
          <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-primary/80 font-semibold">
            {t("landing.pricing.trialPromise.title")}
          </h3>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
                className="flex items-start gap-3"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary/25 to-gold-dark/15 border border-primary/20 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground leading-tight">
                    {item.title}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">
                    {item.desc}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};
