import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/hooks/useTranslation";
import { STORYLINE_CHROME } from "./storylines/storylineContent";
import { OUTCOMES, type OutcomeKey } from "./storylines/outcomeContent";

const AUTOPLAY_MS = 4800;

type Props = {
  outcome: OutcomeKey | null;
  onOpenChange: (open: boolean) => void;
  title?: string;
};

export const OutcomeStorylineDialog = ({ outcome, onOpenChange, title }: Props) => {
  const { language } = useTranslation();
  const chrome = STORYLINE_CHROME[language];
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const meta = outcome ? OUTCOMES[outcome] : null;
  const slides = useMemo(() => meta?.slides ?? [], [meta]);
  const open = outcome !== null;

  useEffect(() => {
    if (open) {
      setIndex(0);
      setPaused(false);
    }
  }, [open, outcome]);

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % Math.max(slides.length, 1));
  }, [slides.length]);
  const back = useCallback(() => {
    setIndex((i) => (i - 1 + slides.length) % Math.max(slides.length, 1));
  }, [slides.length]);

  const currentDuration = slides[index]?.durationMs ?? AUTOPLAY_MS;

  useEffect(() => {
    if (!open || reduce || paused || hovered) return;
    const t = setTimeout(advance, currentDuration);
    return () => clearTimeout(t);
  }, [open, reduce, paused, hovered, index, advance, currentDuration]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") advance();
      else if (e.key === "ArrowLeft") back();
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, advance, back]);

  if (!meta) return null;
  const slide = slides[index];
  const copy = slide.copy[language];
  const autoplayActive = !reduce && !paused && !hovered;
  const Visual = slide.UIComponent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl w-[92vw] p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur-xl border-primary/30 shadow-[0_0_60px_hsl(var(--primary)/0.25)]"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <DialogTitle className="sr-only">{title ?? outcome ?? ""}</DialogTitle>

        <div className="relative h-0.5 bg-primary/10">
          <motion.div
            key={`${outcome}-${index}-${autoplayActive ? "run" : "hold"}`}
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-gold-dark"
            initial={{ width: "0%" }}
            animate={{ width: autoplayActive ? "100%" : "0%" }}
            transition={{ duration: autoplayActive ? currentDuration / 1000 : 0, ease: "linear" }}
          />
        </div>

        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-3 right-3 z-30 w-9 h-9 rounded-full bg-background/70 border border-primary/25 flex items-center justify-center hover:border-primary/60 hover:bg-background transition"
          aria-label={chrome.close}
        >
          <X className="h-4 w-4 text-primary" />
        </button>

        <div className="relative aspect-[16/9] bg-black overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${outcome}-${index}`}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 p-6"
            >
              <Visual />
            </motion.div>
          </AnimatePresence>

          <button
            onClick={back}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/70 border border-primary/25 flex items-center justify-center hover:border-primary/60 hover:bg-background transition"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-5 w-5 text-primary" />
          </button>
          <button
            onClick={advance}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/70 border border-primary/25 flex items-center justify-center hover:border-primary/60 hover:bg-background transition"
            aria-label="Next slide"
          >
            <ChevronRight className="h-5 w-5 text-primary" />
          </button>
        </div>

        <div className="relative px-6 md:px-8 py-6 md:py-7 border-t border-primary/15">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${outcome}-${index}-copy`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35 }}
            >
              <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.28em] text-primary/80 mb-3">
                <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                {copy.kicker}
              </div>
              <h3 className="font-display text-2xl md:text-3xl leading-tight text-foreground mb-2">
                {copy.title}
              </h3>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-2xl">
                {copy.body}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPaused((p) => !p)}
                className="w-9 h-9 rounded-full border border-primary/30 bg-background/60 flex items-center justify-center hover:border-primary/60 transition"
                aria-label={paused ? chrome.play : chrome.pause}
              >
                {paused || reduce ? (
                  <Play className="h-4 w-4 text-primary" />
                ) : (
                  <Pause className="h-4 w-4 text-primary" />
                )}
              </button>
              <div className="flex items-center gap-1.5">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? "w-6 bg-primary" : "w-1.5 bg-primary/25 hover:bg-primary/50"
                    }`}
                    aria-label={`${chrome.slide} ${i + 1}`}
                  />
                ))}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-primary/60 tabular-nums">
                {index + 1} / {slides.length}
              </div>
            </div>

            <Link
              to={meta.href}
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-gold-dark text-background font-medium text-sm px-4 py-2 hover:shadow-[0_0_24px_hsl(var(--primary)/0.5)] transition-shadow"
            >
              {meta.ctaLabel[language]}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
