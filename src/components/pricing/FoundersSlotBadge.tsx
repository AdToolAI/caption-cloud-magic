import { tx } from "@/lib/i18nText";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FOUNDERS_MAX_SLOTS } from "@/config/stripe";
import { useFounderStatus } from "@/hooks/useFounderStatus";

interface Props {
  className?: string;
}

/**
 * Live counter showing how many of the first 1000 Founders slots are still available.
 * Founders pay the same €14.99 subscription — their benefit is 20% off every AI credit purchase for 24 months.
 *
 * ANONYMITY CONTRACT: hidden for users who already hold a founder slot — the
 * counter combined with their own join time would let them infer their position.
 */
export const FoundersSlotBadge = ({ className = "" }: Props) => {
  const [claimed, setClaimed] = useState<number | null>(null);
  const founder = useFounderStatus();

  const isFounder = !founder.loading && founder.isActive;

  useEffect(() => {
    if (isFounder) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.rpc("count_founders_claimed");
      if (!cancelled && !error && typeof data === "number") {
        setClaimed(data);
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isFounder]);

  if (isFounder) return null;

  const remaining =
    claimed === null ? null : Math.max(0, FOUNDERS_MAX_SLOTS - claimed);
  const soldOut = remaining === 0;


  return (
    <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/40 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 text-xs font-medium tracking-wide"
      >
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        {soldOut ? (
          <span className="text-muted-foreground">
            {tx({ de: "Founders-Plätze ausverkauft", en: "Founders slots sold out", es: "Plazas Founders agotadas" })}
          </span>
        ) : remaining === null ? (
          <span className="text-muted-foreground">{tx({ de: "Founders-Deal verfügbar…", en: "Founders deal available…", es: "Oferta Founders disponible…" })}</span>
        ) : (
          <span className="text-foreground">
            <span className="text-primary font-bold tabular-nums">
              {remaining}
            </span>{" "}
            / {FOUNDERS_MAX_SLOTS} {tx({ de: "Founders-Plätze frei —", en: "founders slots left —", es: "plazas Founders libres —" })}{" "}
            <span className="text-primary">{tx({ de: "20 % auf alle KI-Credits, 24 Monate", en: "20% off all AI credits, 24 months", es: "20 % en todos los créditos de IA, 24 meses" })}</span>
          </span>
        )}
      </div>
      <a
        href="/legal/terms#section-8"
        className="text-[10px] leading-tight text-muted-foreground/60 hover:text-muted-foreground/90 transition-colors text-center max-w-xs"
      >
        {tx({ de: "Begrenztes Einführungsangebot. Änderungen vorbehalten. Gilt nur bei aktivem Betrieb des Dienstes. Details siehe AGB §8.", en: "Limited introductory offer. Subject to change. Valid only while the service is actively operating. See Terms §8 for details.", es: "Oferta de lanzamiento limitada. Sujeta a cambios. Válida solo mientras el servicio esté activo. Detalles en los Términos §8." })}
      </a>
    </div>
  );
};
