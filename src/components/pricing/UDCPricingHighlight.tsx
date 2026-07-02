import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ShieldCheck, Mic, RefreshCw, Scissors, ArrowRight, Sparkles } from "lucide-react";
import { trackUDC } from "@/lib/analytics";

/**
 * UDC-specific pricing positioning card.
 * Positions Universal Directors Cut as the "Consistency-First AI NLE" moat
 * that's included in the Pro plan — the reason competitors (CapCut/Descript)
 * can't match on brand/character consistency.
 */
export const UDCPricingHighlight = () => {
  const pillars = [
    {
      icon: Mic,
      label: "Voice-Lock",
      desc: "One voice, every scene — no drift across renders.",
    },
    {
      icon: RefreshCw,
      label: "Anchor-Refresh",
      desc: "Character identity stays locked after every cut.",
    },
    {
      icon: ShieldCheck,
      label: "CI-Preflight",
      desc: "Brand, aspect & loudness checked before you export.",
    },
    {
      icon: Scissors,
      label: "Auto Cut-Down",
      desc: "One master → 15s & 6s ad variants in a click.",
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6 }}
      className="relative mb-20"
    >
      <div className="relative rounded-3xl border border-primary/40 bg-gradient-to-br from-card/80 via-card/60 to-card/40 backdrop-blur-xl p-8 md:p-12 overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative grid lg:grid-cols-[1.1fr,1fr] gap-10 items-center">
          {/* Left: Positioning */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary text-[11px] font-medium tracking-wider uppercase mb-5">
              <Sparkles className="w-3 h-3" />
              Included in Pro
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground leading-tight mb-4">
              The first{" "}
              <span className="bg-gradient-to-r from-primary to-gold-dark bg-clip-text text-transparent">
                Consistency-First
              </span>{" "}
              AI video editor.
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed mb-6 max-w-xl">
              CapCut and Descript cut clips. Universal Directors Cut keeps your{" "}
              <span className="text-foreground font-medium">character, voice and brand identical</span>{" "}
              across every scene — the one thing generic editors can't do. All four moat features
              are unlocked with your Pro plan. No add-on. No extra credits.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/directors-cut"
                onClick={() => trackUDC('udc_pricing_cta_clicked', { target: 'directors-cut' })}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-gradient-to-r from-primary to-gold-dark text-primary-foreground font-semibold text-sm shadow-[var(--shadow-glow-gold)] hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                Open Directors Cut
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#pricing-top"
                className="inline-flex items-center gap-2 h-11 px-5 rounded-lg border border-border/60 bg-card/40 text-foreground font-medium text-sm hover:border-primary/40 transition-colors"
              >
                See what's included
              </a>
            </div>
          </div>

          {/* Right: 4 Pillars */}
          <div className="grid grid-cols-2 gap-3">
            {pillars.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="group relative rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 hover:border-primary/40 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/25 to-gold-dark/15 flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">{label}</h3>
                <p className="text-[11.5px] text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
};
