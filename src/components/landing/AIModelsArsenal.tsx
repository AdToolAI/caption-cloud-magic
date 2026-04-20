import { motion } from "framer-motion";
import { Sparkles, Film, Sun, Clapperboard, Zap, Award, Star } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export const AIModelsArsenal = () => {
  const { t } = useTranslation();

  const models = [
    { key: "kling", icon: Sparkles, recommended: true },
    { key: "wan", icon: Film, recommended: false },
    { key: "luma", icon: Sun, recommended: false },
    { key: "hailuo", icon: Clapperboard, recommended: false },
    { key: "seedance", icon: Zap, recommended: false },
    { key: "veo", icon: Award, recommended: false },
  ] as const;

  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/20 to-background" />

      <div className="container relative z-10 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            {t("landing.aiModels.badge")}
          </div>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            <span className="text-foreground">{t("landing.aiModels.title1")}</span>
            <span className="bg-gradient-to-r from-primary to-gold-dark bg-clip-text text-transparent">
              {t("landing.aiModels.title2")}
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t("landing.aiModels.subtitle")}
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {models.map((model, index) => (
            <motion.div
              key={model.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="group relative"
            >
              <div
                className={`relative h-full bg-card/60 backdrop-blur-xl border rounded-2xl p-5 transition-all duration-500 hover:-translate-y-1 ${
                  model.recommended
                    ? "border-primary/60 shadow-[var(--shadow-glow-gold)]"
                    : "border-border/50 hover:border-primary/40"
                }`}
              >
                {model.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <div className="flex items-center gap-1 bg-gradient-to-r from-primary to-gold-dark text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-lg">
                      <Star className="h-3 w-3 fill-current" />
                      {t("landing.aiModels.recommended")}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${
                      model.recommended
                        ? "bg-gradient-to-br from-primary/30 to-gold-dark/20"
                        : "bg-gradient-to-br from-primary/15 to-accent/10"
                    }`}
                  >
                    <model.icon
                      className={`h-5 w-5 ${
                        model.recommended ? "text-primary" : "text-foreground/80"
                      }`}
                    />
                  </div>
                  <h3 className="font-display text-base md:text-lg font-bold text-foreground">
                    {t(`landing.aiModels.models.${model.key}.name`)}
                  </h3>
                </div>

                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                  {t(`landing.aiModels.models.${model.key}.tagline`)}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
