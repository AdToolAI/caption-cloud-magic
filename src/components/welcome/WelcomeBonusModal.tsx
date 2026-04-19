import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Zap, Gem, ArrowRight, Film } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { formatPrice } from "@/lib/currency";

interface WelcomeBonusModalProps {
  open: boolean;
  bonusAmount: number;
  bonusCurrency: "EUR" | "USD";
  onDismiss: () => void;
}

const copy = {
  de: {
    headline: "Willkommen — dein Startguthaben wartet",
    subheadline: "Erstelle dein erstes KI-Video in unter 60 Sekunden. Keine Kreditkarte, kein Risiko.",
    badge1: "6 KI-Modelle (Sora, Kling, Hailuo …)",
    badge2: "Erste Vorschau in ~30 Sek",
    badge3: "Guthaben = ~5–10 Clips gratis",
    cta: "Jetzt mein erstes Video erstellen",
    later: "Später",
    chip: "Geschenk für dich",
  },
  en: {
    headline: "Welcome — your starter credits are ready",
    subheadline: "Create your first AI video in under 60 seconds. No credit card, no risk.",
    badge1: "6 AI models (Sora, Kling, Hailuo …)",
    badge2: "First preview in ~30 sec",
    badge3: "Credits = ~5–10 clips free",
    cta: "Create my first video now",
    later: "Later",
    chip: "A gift for you",
  },
  es: {
    headline: "Bienvenido — tu saldo inicial te espera",
    subheadline: "Crea tu primer video con IA en menos de 60 segundos. Sin tarjeta, sin riesgo.",
    badge1: "6 modelos de IA (Sora, Kling, Hailuo …)",
    badge2: "Primera vista en ~30 seg",
    badge3: "Saldo = ~5–10 clips gratis",
    cta: "Crear mi primer video ahora",
    later: "Más tarde",
    chip: "Un regalo para ti",
  },
};

export const WelcomeBonusModal = ({ open, bonusAmount, bonusCurrency, onDismiss }: WelcomeBonusModalProps) => {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const t = copy[language as "de" | "en" | "es"] ?? copy.en;
  const formattedAmount = formatPrice(bonusAmount, bonusCurrency);

  const handleStart = () => {
    onDismiss();
    navigate("/ai-video-studio");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDismiss(); }}>
      <DialogContent
        className="max-w-[720px] p-0 overflow-hidden border-0 bg-transparent shadow-none"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-2xl border border-border bg-card overflow-hidden"
          style={{
            boxShadow:
              "0 30px 80px -20px hsla(43, 90%, 50%, 0.25), 0 0 0 1px hsla(43, 90%, 68%, 0.15)",
          }}
        >
          {/* Background glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 30% 0%, hsla(43,90%,68%,0.18) 0%, transparent 55%), radial-gradient(ellipse at 80% 100%, hsla(187,84%,55%,0.12) 0%, transparent 50%)",
            }}
          />

          {/* Hero strip */}
          <div className="relative h-40 md:h-48 overflow-hidden border-b border-border">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, hsla(43,90%,40%,0.35) 0%, hsla(220,30%,8%,0.9) 50%, hsla(187,84%,30%,0.3) 100%)",
              }}
            />
            {/* Floating sparkle particles */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${(i * 13 + 7) % 100}%`,
                  top: `${(i * 23 + 11) % 100}%`,
                  width: 3 + (i % 3),
                  height: 3 + (i % 3),
                  background: i % 2 === 0 ? "hsla(43,90%,70%,0.7)" : "hsla(187,84%,60%,0.6)",
                }}
                animate={{
                  y: [0, -15, 0, 10, 0],
                  opacity: [0.3, 0.9, 0.4, 0.8, 0.3],
                }}
                transition={{ duration: 5 + i * 0.4, repeat: Infinity, ease: "easeInOut" }}
              />
            ))}

            <div className="relative h-full flex flex-col items-center justify-center px-8 text-center">
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 180 }}
                className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full border border-primary/30 bg-background/40 backdrop-blur-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] uppercase tracking-[0.18em] font-medium text-primary">
                  {t.chip}
                </span>
              </motion.div>
              <div
                className="text-5xl md:text-6xl font-bold font-heading tracking-tight"
                style={{
                  background: "linear-gradient(135deg, hsl(43 90% 68%), hsl(43 90% 85%), hsl(187 84% 65%))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {formattedAmount}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="relative px-6 md:px-10 py-7 md:py-8">
            <h2
              className="text-2xl md:text-[28px] font-bold font-heading tracking-tight text-center mb-2 leading-tight"
              style={{
                background: "linear-gradient(135deg, hsl(var(--foreground)), hsl(43 70% 75%))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {t.headline}
            </h2>
            <p className="text-sm md:text-base text-muted-foreground text-center max-w-md mx-auto mb-6">
              {t.subheadline}
            </p>

            {/* Trust badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7">
              {[
                { icon: Film, text: t.badge1 },
                { icon: Zap, text: t.badge2 },
                { icon: Gem, text: t.badge3 },
              ].map((b, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.08 }}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-background/40 backdrop-blur-sm"
                >
                  <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                    <b.icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-[12px] leading-tight text-foreground/85">{b.text}</span>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex flex-col items-center gap-3">
              <Button
                size="lg"
                onClick={handleStart}
                className="w-full sm:w-auto px-8 h-12 text-base font-semibold gap-2"
                style={{
                  background: "linear-gradient(135deg, hsl(43 90% 60%), hsl(43 90% 70%))",
                  color: "hsl(220 30% 8%)",
                  boxShadow: "0 10px 30px -8px hsla(43,90%,55%,0.5)",
                }}
              >
                {t.cta}
                <ArrowRight className="w-4 h-4" />
              </Button>
              <button
                onClick={onDismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                {t.later}
              </button>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};
