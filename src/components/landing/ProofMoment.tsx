/**
 * ProofMoment — der Beweis direkt unter dem Hero.
 *
 * Links tippt sich das Briefing, mit dem der gezeigte Clip tatsächlich
 * produziert wurde. Rechts läuft genau dieses Ergebnis — als fertige Datei,
 * es wird nichts live generiert. Bewusst ohne Stoppuhr: ein Zeitversprechen
 * hält die Pipeline nicht in jedem Fall.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { Check, Volume2, VolumeX, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
const PROOF_CLIP = "/videos/proof-clip.mp4";
const PROOF_POSTER = "/videos/proof-clip-poster.jpg";

const COPY = {
  de: {
    eyebrow: "Der Beweis",
    title1: "Ein Briefing.",
    title2: "Ein fertiger Clip.",
    briefLabel: "Dein Briefing",
    brief: "Büroszene, vier Kolleg:innen im Dialog, deutsch gesprochen, 8 Sekunden.",
    resultLabel: "Das Ergebnis",
    steps: ["Skript & Cast", "Stimmen", "Lip-Sync", "Fertiger Clip"],
    meta: "8s · Deutsch · 4 Sprecher · Lip-Sync",
    note: "Skript, Stimme, Kamera, Schnitt, Lip-Sync — sonst ein Team und mehrere Tage.",
    cta: "Mit diesem Briefing starten",
    sound: "Ton",
    honest: "Echter Clip aus diesem Studio — kein Rendering im Browser.",
  },
  en: {
    eyebrow: "The proof",
    title1: "One briefing.",
    title2: "One finished clip.",
    briefLabel: "Your briefing",
    brief: "Office scene, four colleagues in dialogue, spoken German, 8 seconds.",
    resultLabel: "The result",
    steps: ["Script", "Voice", "Lip-sync", "Finished clip"],
    meta: "8s · German · 4 speakers · lip-sync",
    note: "Script, voice, camera, edit, lip-sync — otherwise a team and several days.",
    cta: "Start with this briefing",
    sound: "Sound",
    honest: "A real clip from this studio — nothing is rendered in your browser.",
  },
  es: {
    eyebrow: "La prueba",
    title1: "Un briefing.",
    title2: "Un clip terminado.",
    briefLabel: "Tu briefing",
    brief: "Escena de oficina, cuatro colegas dialogando, en alemán, 8 segundos.",
    resultLabel: "El resultado",
    steps: ["Guion", "Voz", "Lip-sync", "Clip terminado"],
    meta: "8s · alemán · 4 hablantes · lip-sync",
    note: "Guion, voz, cámara, montaje, lip-sync — de otro modo, un equipo y varios días.",
    cta: "Empezar con este briefing",
    sound: "Sonido",
    honest: "Un clip real de este estudio — nada se genera en tu navegador.",
  },
} as const;

export const ProofMoment = () => {
  const { language } = useTranslation();
  const { user } = useAuth();
  const copy = COPY[(language as keyof typeof COPY)] ?? COPY.de;

  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inView = useInView(sectionRef, { once: true, amount: 0.4 });

  const [typed, setTyped] = useState("");
  const [muted, setMuted] = useState(true);

  // Briefing tippt sich, sobald der Block im Blick ist.
  useEffect(() => {
    if (!inView) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(copy.brief.slice(0, i));
      if (i >= copy.brief.length) window.clearInterval(id);
    }, 28);
    return () => window.clearInterval(id);
  }, [inView, copy.brief]);

  // Ein Durchlauf, kein Dauerloop.
  useEffect(() => {
    if (!inView) return;
    videoRef.current?.play().catch(() => undefined);
  }, [inView]);

  const typingDone = typed.length >= copy.brief.length;
  const stepProgress = useMemo(() => {
    if (!inView) return 0;
    const ratio = typed.length / Math.max(1, copy.brief.length);
    return Math.min(copy.steps.length, Math.floor(ratio * copy.steps.length) + (typingDone ? 1 : 0));
  }, [inView, typed.length, copy.brief.length, copy.steps.length, typingDone]);

  const ctaTarget = user
    ? `/autopilot?firstProduction=1&brief=${encodeURIComponent(copy.brief)}`
    : "/auth";

  return (
    <section
      ref={sectionRef}
      id="proof"
      className="relative overflow-hidden px-4 py-20 md:py-28"
      aria-labelledby="proof-title"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/20 to-background" />
      <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />

      <div className="container relative z-10 mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <span className="text-xs uppercase tracking-[0.3em] text-primary/70">{copy.eyebrow}</span>
          <h2 id="proof-title" className="font-display mt-3 text-3xl font-bold md:text-4xl lg:text-5xl">
            <span className="text-foreground">{copy.title1} </span>
            <span className="bg-gradient-to-r from-primary to-gold-dark bg-clip-text text-transparent">
              {copy.title2}
            </span>
          </h2>
        </motion.div>

        <div className="grid items-center gap-8 lg:grid-cols-2">
          {/* Briefing */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur-md md:p-8"
          >
            <div className="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {copy.briefLabel}
            </div>
            <p className="min-h-[5.5rem] font-mono text-base leading-relaxed text-foreground md:text-lg">
              {typed}
              {!typingDone && <span className="ml-0.5 inline-block h-5 w-[2px] animate-pulse bg-primary align-middle" />}
            </p>

            <div className="mt-8 space-y-3">
              {copy.steps.map((step, i) => {
                const done = i < stepProgress;
                return (
                  <div key={step} className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors duration-500 ${
                        done
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border/60 text-muted-foreground/40"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span
                      className={`text-sm transition-colors duration-500 ${
                        done ? "text-foreground" : "text-muted-foreground/50"
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="mt-8 text-sm leading-relaxed text-muted-foreground">{copy.note}</p>

            <Button
              asChild
              size="lg"
              className="mt-6 h-12 border-0 bg-gradient-to-r from-primary to-gold-dark px-8 font-semibold text-primary-foreground shadow-[var(--shadow-glow-gold)] transition-all duration-300 hover:scale-[1.02]"
            >
              <Link to={ctaTarget} className="flex items-center gap-2">
                {copy.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </motion.div>

          {/* Ergebnis */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative"
          >
            <div className="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {copy.resultLabel}
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-black shadow-[var(--shadow-glow-gold)]">
              <video
                ref={videoRef}
                src={PROOF_CLIP}
                poster={PROOF_POSTER}
                className="aspect-video w-full object-cover"
                muted={muted}
                playsInline
                preload="metadata"
                controls={false}
              />
              <button
                type="button"
                onClick={() => {
                  setMuted((m) => !m);
                  videoRef.current?.play().catch(() => undefined);
                }}
                aria-label={copy.sound}
                className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/70 text-foreground backdrop-blur-md transition-colors hover:border-primary/60 hover:text-primary"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{copy.meta}</span>
              <span className="text-muted-foreground/70">{copy.honest}</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
