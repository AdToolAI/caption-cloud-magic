import { motion, useReducedMotion } from "framer-motion";
import {
  FileText,
  Users,
  ScrollText,
  Image as ImageIcon,
  Film,
  Music,
  Send,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * CommandDeck — Hero-Cockpit for the "Why this tool wins the game" section.
 * Renders the end-to-end production pipeline as an animated gold line
 * with pulsing station nodes + a capability ticker on the right.
 * Capabilities only — never fabricated user/revenue numbers.
 */
export const CommandDeck = () => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();

  const stations = [
    { icon: FileText, key: "briefing" },
    { icon: Users, key: "cast" },
    { icon: ScrollText, key: "script" },
    { icon: ImageIcon, key: "anchor" },
    { icon: Film, key: "motion" },
    { icon: Music, key: "music" },
    { icon: Send, key: "publish" },
  ];

  const capabilities = [
    { value: "32", labelKey: "landing.mission.deck.cap.models" },
    { value: "4", labelKey: "landing.mission.deck.cap.speakers" },
    { value: "3", labelKey: "landing.mission.deck.cap.languages" },
    { value: "∞", labelKey: "landing.mission.deck.cap.characters" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6 }}
      className="relative rounded-3xl border border-primary/20 bg-card/60 backdrop-blur-xl overflow-hidden shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.25)]"
    >
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-72 w-[80%] rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 right-0 h-64 w-1/2 rounded-full bg-accent/5 blur-3xl"
      />

      <div className="relative grid lg:grid-cols-[1.6fr_1fr] gap-8 p-6 md:p-10">
        {/* Pipeline */}
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-accent/90 font-medium mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            {t("landing.mission.deck.pipelineLabel")}
          </div>

          <h3 className="font-display text-2xl md:text-3xl leading-tight mb-2">
            <span className="bg-gradient-to-r from-foreground via-primary to-gold-dark bg-clip-text text-transparent">
              {t("landing.mission.deck.title")}
            </span>
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mb-8">
            {t("landing.mission.deck.subtitle")}
          </p>

          {/* Pipeline rail */}
          <div className="relative">
            {/* Base line */}
            <div className="absolute left-0 right-0 top-5 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            {/* Animated gold line */}
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: reduce ? 0 : 2.2, ease: "easeInOut", delay: 0.3 }}
              style={{ transformOrigin: "left" }}
              className="absolute left-0 right-0 top-5 h-px bg-gradient-to-r from-primary/0 via-primary to-gold-dark"
            />

            <ol className="grid grid-cols-7 gap-1 relative">
              {stations.map((s, i) => (
                <motion.li
                  key={s.key}
                  initial={{ opacity: 0, y: 6 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.35 + i * 0.08 }}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="relative">
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-primary/30 blur-md animate-pulse"
                    />
                    <div className="relative w-10 h-10 rounded-full border border-primary/40 bg-background/80 backdrop-blur flex items-center justify-center">
                      <s.icon className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <span className="text-[9px] md:text-[10px] uppercase tracking-widest text-muted-foreground text-center leading-tight">
                    {t(`landing.mission.deck.stations.${s.key}`)}
                  </span>
                </motion.li>
              ))}
            </ol>
          </div>

          <div className="mt-8 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-primary/80">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {t("landing.mission.deck.oneCanvas")}
          </div>
        </div>

        {/* Capability ticker */}
        <div className="relative border-t lg:border-t-0 lg:border-l border-primary/15 lg:pl-8 pt-6 lg:pt-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-accent/90 font-medium mb-5">
            {t("landing.mission.deck.capLabel")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {capabilities.map((c, i) => (
              <motion.div
                key={c.labelKey}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.4 + i * 0.1 }}
                className="relative rounded-xl border border-primary/20 bg-background/40 backdrop-blur px-4 py-4 overflow-hidden group hover:border-primary/50 transition-colors"
              >
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity"
                />
                <div className="relative font-display text-3xl bg-gradient-to-br from-primary to-gold-dark bg-clip-text text-transparent leading-none">
                  {c.value}
                </div>
                <div className="relative mt-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t(c.labelKey)}
                </div>
              </motion.div>
            ))}
          </div>
          <p className="mt-5 text-[11px] text-muted-foreground/70 leading-relaxed">
            {t("landing.mission.deck.capFootnote")}
          </p>
        </div>
      </div>
    </motion.div>
  );
};
