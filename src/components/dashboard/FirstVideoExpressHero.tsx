import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Gift } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { useAIVideoWallet } from "@/hooks/useAIVideoWallet";
import { useFirstVideoPrompts } from "@/hooks/useFirstVideoPrompts";
import { formatPrice } from "@/lib/currency";

const copy = {
  de: {
    badge: "Express-Start",
    title: "Erstelle dein erstes KI-Video in 90 Sekunden",
    body: "Wähle eine personalisierte Idee — Hailuo 2.3 generiert dein erstes Video in unter einer Minute. Du kannst den Prompt vor dem Start beliebig anpassen.",
    cta: "Mit Hailuo 2.3 starten",
    chipsTitle: "Personalisierte Ideen",
    chipsTitleFallback: "Beliebte Ideen",
  },
  en: {
    badge: "Express start",
    title: "Create your first AI video in 90 seconds",
    body: "Pick a personalized idea — Hailuo 2.3 generates your first video in under a minute. You can edit the prompt freely before launching.",
    cta: "Start with Hailuo 2.3",
    chipsTitle: "Personalized ideas",
    chipsTitleFallback: "Popular ideas",
  },
  es: {
    badge: "Inicio rápido",
    title: "Crea tu primer video con IA en 90 segundos",
    body: "Elige una idea personalizada — Hailuo 2.3 genera tu primer video en menos de un minuto. Puedes editar el prompt libremente antes de empezar.",
    cta: "Empezar con Hailuo 2.3",
    chipsTitle: "Ideas personalizadas",
    chipsTitleFallback: "Ideas populares",
  },
};

/**
 * Persistent dashboard hero for users with starter credits but 0 generations.
 * Shows 3 personalized first-video prompts and a direct CTA to Hailuo 2.3.
 * Disappears after the first generation.
 */
export const FirstVideoExpressHero = () => {
  const { user } = useAuth();
  const { language } = useTranslation();
  const { wallet, loading: walletLoading } = useAIVideoWallet();
  const { prompts, personalized } = useFirstVideoPrompts();
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

  if (walletLoading || hasGenerations === null) return null;
  if (hasGenerations) return null;
  if (!wallet || wallet.balance_euros <= 0) return null;

  const t = copy[language as "de" | "en" | "es"] ?? copy.en;
  const balanceFormatted = formatPrice(wallet.balance_euros, wallet.currency);

  const buildLink = (idx: number) => {
    const p = prompts[idx];
    if (!p) return "/hailuo-video-studio";
    return `/hailuo-video-studio?prompt=${encodeURIComponent(p.prompt)}&prompt_en=${encodeURIComponent(p.prompt_en)}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative mb-6 rounded-2xl border border-primary/30 bg-card overflow-hidden"
      style={{
        boxShadow: "0 20px 50px -20px hsla(43,90%,50%,0.25)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 0% 0%, hsla(43,90%,68%,0.16) 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, hsla(187,84%,55%,0.10) 0%, transparent 50%)",
        }}
      />
      <div className="relative p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start gap-5">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 shrink-0">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                  {t.badge}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {balanceFormatted}
                </span>
              </div>
              <h3 className="text-base md:text-lg font-bold font-heading leading-tight mb-1">
                {t.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{t.body}</p>
            </div>
          </div>
          <Link
            to={buildLink(0)}
            className="shrink-0 inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, hsl(43 90% 60%), hsl(43 90% 70%))",
              color: "hsl(220 30% 8%)",
              boxShadow: "0 8px 24px -6px hsla(43,90%,55%,0.45)",
            }}
          >
            <Sparkles className="w-4 h-4" />
            {t.cta}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="mt-5 pt-5 border-t border-border/50">
          <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-3 font-medium">
            {personalized ? t.chipsTitle : t.chipsTitleFallback}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {prompts.map((p, i) => (
              <Link
                key={i}
                to={buildLink(i)}
                className="group p-3 rounded-xl border border-border bg-background/40 hover:border-primary/40 hover:bg-background/70 transition-all text-left"
              >
                <p className="text-xs leading-snug text-foreground/85 group-hover:text-foreground line-clamp-3">
                  {p.prompt}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
