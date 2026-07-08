import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
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
          {/* Beta badge — replaces invented rating & user count */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 border border-primary/40 bg-primary/10 text-primary text-[11px] uppercase tracking-[0.22em] font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
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
