import { motion } from "framer-motion";
import { Gift, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAIVideoWallet } from "@/hooks/useAIVideoWallet";
import { formatPrice } from "@/lib/currency";

const copy = {
  de: {
    title: "Du hast Startguthaben — perfekt für dein erstes Video",
    body: "Klick einfach auf eine Inspiration unten oder wähle ein Modell. Wir empfehlen Hailuo 2.3 für die schnellste & zuverlässigste erste Erfahrung.",
    suggestionsTitle: "Inspiration zum Starten",
    suggestions: [
      "Cinematische Drohnenaufnahme über einer modernen Skyline bei Sonnenuntergang",
      "Eleganter Produkt-Shot eines Parfüm-Flakons mit weichem Goldlicht",
      "Eine entspannte Person auf einer Couch, die in die Kamera lächelt",
    ],
    recommended: "Empfohlen",
    tryWith: "Mit Hailuo 2.3 testen",
  },
  en: {
    title: "You have starter credits — perfect for your first video",
    body: "Just click an inspiration below or pick a model. We recommend Hailuo 2.3 for the fastest, most reliable first experience.",
    suggestionsTitle: "Inspiration to start",
    suggestions: [
      "Cinematic drone shot over a modern skyline at sunset",
      "Elegant product shot of a perfume bottle with soft gold light",
      "A relaxed person on a couch smiling at the camera",
    ],
    recommended: "Recommended",
    tryWith: "Try with Hailuo 2.3",
  },
  es: {
    title: "Tienes saldo inicial — perfecto para tu primer video",
    body: "Haz clic en una inspiración o elige un modelo. Recomendamos Hailuo 2.3 para la experiencia más rápida y fiable.",
    suggestionsTitle: "Inspiración para empezar",
    suggestions: [
      "Toma cinematográfica con dron sobre una ciudad moderna al atardecer",
      "Toma elegante de un frasco de perfume con luz dorada suave",
      "Persona relajada en un sofá sonriendo a la cámara",
    ],
    recommended: "Recomendado",
    tryWith: "Probar con Hailuo 2.3",
  },
};

/**
 * Banner shown to users who have a wallet balance but have never spent / purchased.
 * Disappears after the first generation.
 */
export const FirstVideoGuide = () => {
  const { user } = useAuth();
  const { language } = useTranslation();
  const { wallet, loading } = useAIVideoWallet();
  const [hasGenerations, setHasGenerations] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("ai_video_generations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (!cancelled) setHasGenerations((count ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (loading || hasGenerations === null) return null;
  if (hasGenerations) return null;
  if (!wallet || wallet.balance_euros <= 0) return null;
  if (wallet.total_purchased_euros > 0 || wallet.total_spent_euros > 0) return null;

  const t = copy[language as "de" | "en" | "es"] ?? copy.en;
  const balanceFormatted = formatPrice(wallet.balance_euros, wallet.currency);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative mb-6 rounded-2xl border border-primary/30 bg-card overflow-hidden"
      style={{
        boxShadow: "0 10px 40px -12px hsla(43,90%,50%,0.25)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 0% 0%, hsla(43,90%,68%,0.12) 0%, transparent 55%)",
        }}
      />
      <div className="relative p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start gap-5">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 shrink-0">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="text-base md:text-lg font-bold font-heading">
                  {t.title}
                </h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                  {balanceFormatted}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{t.body}</p>
            </div>
          </div>
          <Link
            to="/hailuo-video-studio"
            className="shrink-0 inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, hsl(43 90% 60%), hsl(43 90% 70%))",
              color: "hsl(220 30% 8%)",
              boxShadow: "0 8px 24px -6px hsla(43,90%,55%,0.45)",
            }}
          >
            <Sparkles className="w-4 h-4" />
            {t.tryWith}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Suggestion chips */}
        <div className="mt-5 pt-5 border-t border-border/50">
          <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-3 font-medium">
            {t.suggestionsTitle}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {t.suggestions.map((s, i) => (
              <Link
                key={i}
                to={`/hailuo-video-studio?prompt=${encodeURIComponent(s)}`}
                className="group p-3 rounded-xl border border-border bg-background/40 hover:border-primary/40 hover:bg-background/70 transition-all text-left"
              >
                <p className="text-xs leading-snug text-foreground/85 group-hover:text-foreground line-clamp-3">
                  {s}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
