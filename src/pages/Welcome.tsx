import { useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";

const copy = {
  de: {
    eyebrow: "Zahlung bestätigt",
    title: "Willkommen in deinem Studio",
    sub: "Ein Creator. Ein ganzes Studio. Ab jetzt läuft alles auf deinem Konto — Skript, Stimmen, Charaktere, Schnitt und Export.",
    unlocked: "Ab sofort freigeschaltet",
    items: [
      "Autopilot: von der Idee bis zum fertigen Clip",
      "Cast & World: eigene Charaktere mit fester Identität",
      "Lip-Sync in Deutsch, Englisch und Spanisch",
      "Director's Cut: Schnitt, Untertitel, Musik, Export in 1080p",
    ],
    cta: "Ersten Clip bauen",
    secondary: "Abo & Rechnungen ansehen",
    note: "Deine Rechnung liegt in deinem Postfach und jederzeit unter Abrechnung bereit.",
  },
  en: {
    eyebrow: "Payment confirmed",
    title: "Welcome to your studio",
    sub: "One creator. A whole studio. From now on everything runs on your account — script, voices, characters, edit and export.",
    unlocked: "Unlocked from now on",
    items: [
      "Autopilot: from idea to finished clip",
      "Cast & World: your own characters with a locked identity",
      "Lip-sync in German, English and Spanish",
      "Director's Cut: edit, subtitles, music, 1080p export",
    ],
    cta: "Build your first clip",
    secondary: "View subscription & invoices",
    note: "Your invoice is in your inbox and always available under Billing.",
  },
  es: {
    eyebrow: "Pago confirmado",
    title: "Bienvenido a tu estudio",
    sub: "Un creador. Un estudio entero. A partir de ahora todo funciona en tu cuenta: guion, voces, personajes, montaje y exportación.",
    unlocked: "Desbloqueado desde ahora",
    items: [
      "Autopilot: de la idea al clip terminado",
      "Cast & World: tus propios personajes con identidad fija",
      "Lip-sync en alemán, inglés y español",
      "Director's Cut: montaje, subtítulos, música, exportación en 1080p",
    ],
    cta: "Crear tu primer clip",
    secondary: "Ver suscripción y facturas",
    note: "Tu factura está en tu correo y siempre disponible en Facturación.",
  },
} as const;

const Welcome = () => {
  const { language } = useTranslation();
  const { productId, refreshSubscription } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const t = copy[(language as keyof typeof copy)] ?? copy.en;

  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.CHECKOUT_COMPLETED, {
      plan: productId || "unknown",
      source: "welcome_page",
      session_id: searchParams.get("session_id") || undefined,
    });
    refreshSubscription?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO
        title="Willkommen in deinem Studio"
        description="Dein Studio ist freigeschaltet. Starte jetzt deine erste Produktion."
        canonical="/willkommen"
        lang={language}
        noindex
      />

      <main className="flex-1 relative overflow-hidden flex items-center justify-center px-4 py-20">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-card/20 to-background pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 w-full max-w-2xl rounded-3xl border border-primary/25 bg-card/70 backdrop-blur-xl p-8 md:p-12 text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            {t.eyebrow}
          </div>

          <h1 className="mt-6 font-serif text-3xl md:text-5xl font-bold text-foreground leading-tight">
            {t.title}
          </h1>
          <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
            {t.sub}
          </p>

          <div className="mt-10 text-left rounded-2xl border border-border/60 bg-background/40 p-6">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-4">
              {t.unlocked}
            </p>
            <ul className="space-y-3">
              {t.items.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-foreground/90">
                  <Check className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <Button
            size="lg"
            className="mt-10 w-full sm:w-auto px-10 h-14 text-base font-bold"
            onClick={() => navigate("/autopilot?firstProduction=1")}
          >
            {t.cta}
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>

          <div className="mt-6">
            <Link to="/billing" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
              {t.secondary}
            </Link>
          </div>

          <p className="mt-8 text-xs text-muted-foreground/70">{t.note}</p>
        </motion.div>
      </main>
    </div>
  );
};

export default Welcome;
