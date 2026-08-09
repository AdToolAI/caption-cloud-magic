import { tx } from "@/lib/i18nText";
/**
 * FounderStatusCard — personal Founders Circle card for dashboard / welcome page.
 *
 * ANONYMITY CONTRACT: shows only the remaining benefit duration derived from
 * expiresAt. Never renders a slot number, position, rank, or the claim date.
 */
import { motion } from "framer-motion";
import { Crown, Percent, Gauge, Clapperboard } from "lucide-react";
import { useFounderStatus } from "@/hooks/useFounderStatus";
import { useTranslation } from "@/hooks/useTranslation";
import {
  FOUNDERS_CREDIT_DISCOUNT_PERCENT,
  FOUNDERS_DISCOUNT_MONTHS,
} from "@/config/stripe";

const copy = {
  de: {
    eyebrow: "Founders Circle",
    title: "Du gehörst zum Founders Circle.",
    sub: tx({ de: "Ein Kreis, der nur einmal geöffnet wird. Dein Vorteil läuft still im Hintergrund mit.", en: "A circle that only opens once. Your benefit runs silently in the background.", es: "Un círculo que solo se abre una vez. Tu beneficio funciona silenciosamente en segundo plano." }),
    discount: `${FOUNDERS_CREDIT_DISCOUNT_PERCENT} % auf jeden Credit-Kauf`,
    discountSub: "Automatisch im Checkout abgezogen",
    priority: "Priority-Rendering",
    prioritySub: "Dein Slot geht bei Systemlast zuerst",
    studio: "Voller Studio-Zugang",
    studioSub: "Autopilot, Cast & World, Director's Cut",
    remaining: (m: number) => `Noch ${m} ${m === 1 ? "Monat" : "Monate"} Vorteil`,
    remainingFallback: `${FOUNDERS_DISCOUNT_MONTHS} Monate Vorteil`,
    ended: "Vorteilszeitraum beendet",
  },
  en: {
    eyebrow: "Founders Circle",
    title: "You are part of the Founders Circle.",
    sub: "A circle that opens only once. Your benefit runs quietly in the background.",
    discount: `${FOUNDERS_CREDIT_DISCOUNT_PERCENT}% off every credit purchase`,
    discountSub: "Applied automatically at checkout",
    priority: "Priority rendering",
    prioritySub: "Your slot goes first under system load",
    studio: "Full studio access",
    studioSub: "Autopilot, Cast & World, Director's Cut",
    remaining: (m: number) => `${m} ${m === 1 ? "month" : "months"} of benefit left`,
    remainingFallback: `${FOUNDERS_DISCOUNT_MONTHS} months of benefit`,
    ended: "Benefit period ended",
  },
  es: {
    eyebrow: "Founders Circle",
    title: "Formas parte del Founders Circle.",
    sub: "Un círculo que se abre una sola vez. Tu ventaja funciona en segundo plano.",
    discount: `${FOUNDERS_CREDIT_DISCOUNT_PERCENT} % en cada compra de créditos`,
    discountSub: "Se aplica automáticamente en el pago",
    priority: "Renderizado prioritario",
    prioritySub: "Tu turno va primero cuando hay carga",
    studio: "Acceso completo al estudio",
    studioSub: "Autopilot, Cast & World, Director's Cut",
    remaining: (m: number) => `Quedan ${m} ${m === 1 ? "mes" : "meses"} de ventaja`,
    remainingFallback: `${FOUNDERS_DISCOUNT_MONTHS} meses de ventaja`,
    ended: "Periodo de ventaja finalizado",
  },
} as const;

function monthsLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return 0;
  return Math.max(1, Math.round(diff / (30.44 * 86_400_000)));
}

interface Props {
  className?: string;
}

export function FounderStatusCard({ className = "" }: Props) {
  const { isActive, loading, expiresAt } = useFounderStatus();
  const { language } = useTranslation();

  if (loading || !isActive) return null;

  const t = copy[(language as keyof typeof copy)] ?? copy.en;
  const months = monthsLeft(expiresAt);
  const remainingLabel =
    months === null ? t.remainingFallback : months === 0 ? t.ended : t.remaining(months);

  const perks = [
    { icon: Percent, title: t.discount, sub: t.discountSub },
    { icon: Gauge, title: t.priority, sub: t.prioritySub },
    { icon: Clapperboard, title: t.studio, sub: t.studioSub },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      aria-label={t.eyebrow}
      className={`relative overflow-hidden rounded-3xl border border-primary/30 bg-card/70 backdrop-blur-xl p-6 md:p-8 shadow-[0_0_60px_-30px_hsl(var(--primary)/0.8)] ${className}`}
    >
      <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/45 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
          <Crown className="h-3 w-3" />
          {t.eyebrow}
        </span>
        <span className="text-xs font-medium text-primary/80">{remainingLabel}</span>
      </div>

      <h2 className="relative mt-5 font-serif text-2xl md:text-3xl font-bold text-foreground leading-tight">
        {t.title}
      </h2>
      <p className="relative mt-2 max-w-xl text-sm text-muted-foreground leading-relaxed">
        {t.sub}
      </p>

      <div className="relative mt-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {perks.map((perk) => (
          <div
            key={perk.title}
            className="rounded-2xl border border-border/60 bg-background/40 p-4"
          >
            <perk.icon className="h-4 w-4 text-primary" />
            <p className="mt-3 text-sm font-semibold text-foreground">{perk.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{perk.sub}</p>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

export default FounderStatusCard;
