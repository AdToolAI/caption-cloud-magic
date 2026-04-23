import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Zap, ArrowRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export const AIVideoTopupHintCard = () => {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="relative bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl p-5 hover:border-accent/30 transition-all duration-500 group"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/20 to-primary/10 flex items-center justify-center flex-shrink-0">
          <Zap className="h-4 w-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground mb-1">
            {t("landing.pricing.topupTitle")}
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("landing.pricing.topupSubtitle")}
          </p>
        </div>
      </div>

      <Link
        to="/pricing#topups"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-gold-dark transition-colors group-hover:gap-2 duration-300"
      >
        {t("landing.pricing.topupCta")}
        <ArrowRight className="h-3 w-3" />
      </Link>
    </motion.div>
  );
};
