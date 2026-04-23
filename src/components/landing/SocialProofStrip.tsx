import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

const platforms = ["Instagram", "TikTok", "YouTube", "LinkedIn", "X", "Facebook"];

export const SocialProofStrip = () => {
  const { t } = useTranslation();

  return (
    <section className="relative py-10 px-4 border-y border-primary/10 bg-card/20 backdrop-blur-sm">
      <div className="container max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-10"
        >
          {/* Rating */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className="h-4 w-4 fill-primary text-primary"
                  strokeWidth={1}
                />
              ))}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-foreground tabular-nums">4.8</span>
              <span className="text-xs text-muted-foreground">/ 5</span>
            </div>
            <div className="w-px h-5 bg-primary/20" />
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-semibold">
              {t("landing.socialProof.creators")}
            </span>
          </div>

          {/* "Works with" platforms */}
          <div className="flex items-center gap-4 md:gap-6">
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70 font-semibold whitespace-nowrap">
              {t("landing.socialProof.worksWith")}
            </span>
            <div className="flex items-center gap-3 md:gap-5 flex-wrap justify-center">
              {platforms.map((p) => (
                <span
                  key={p}
                  className="text-xs md:text-sm font-semibold text-muted-foreground/60 hover:text-primary transition-colors duration-300 tracking-wide"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
