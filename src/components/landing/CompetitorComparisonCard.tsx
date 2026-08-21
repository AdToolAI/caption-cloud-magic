import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { getCurrencyForLanguage, getCurrencySymbol } from "@/lib/currency";

export const CompetitorComparisonCard = () => {
  const { t, language } = useTranslation();
  const sym = getCurrencySymbol(getCurrencyForLanguage(language));
  const fmt = (v: string) => (sym === "$" ? `$${v.replace(",", ".")}` : `${v.replace(".", ",")} €`);

  const rows = [
    { label: t("landing.pricing.competitorBuffer"), price: fmt("25"), included: false },
    { label: t("landing.pricing.competitorHootsuite"), price: fmt("99"), included: false },
    { label: t("landing.pricing.competitorLater"), price: fmt("25"), included: false },
    { label: t("landing.pricing.competitorOurLabel"), price: fmt("14.99"), included: true, highlight: true },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="relative bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl p-5 hover:border-accent/30 transition-all duration-500"
    >
      <h4 className="text-sm font-semibold text-foreground mb-1">
        {t("landing.pricing.competitorTitle")}
      </h4>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        {t("landing.pricing.competitorSubtitle")}
      </p>

      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li
            key={row.label}
            className={`flex items-center justify-between gap-3 text-sm ${
              row.highlight
                ? "text-foreground font-semibold"
                : "text-muted-foreground"
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              {row.included ? (
                <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              ) : (
                <X className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
              )}
              <span className="truncate">{row.label}</span>
            </span>
            <span
              className={`tabular-nums ${
                row.highlight
                  ? "bg-gradient-to-r from-primary to-gold-dark bg-clip-text text-transparent"
                  : ""
              }`}
            >
              {row.price}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
};
