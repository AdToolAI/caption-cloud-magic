import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FOUNDERS_MAX_SLOTS } from "@/config/stripe";

interface Props {
  className?: string;
}

/**
 * Live counter showing how many of the first 1000 Founders slots are still available.
 * Founders get the €14.99 price locked for 24 months instead of 3.
 */
export const FoundersSlotBadge = ({ className = "" }: Props) => {
  const [claimed, setClaimed] = useState<number | null>(null);

  useEffect(() => {
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
  }, []);

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
            Founders-Deal ausverkauft — Launch-Promo (3 Monate) aktiv
          </span>
        ) : remaining === null ? (
          <span className="text-muted-foreground">Founders-Deal verfügbar…</span>
        ) : (
          <span className="text-foreground">
            <span className="text-primary font-bold tabular-nums">
              {remaining}
            </span>{" "}
            / {FOUNDERS_MAX_SLOTS} Founders-Plätze frei —{" "}
            <span className="text-primary">€14,99 für 24 Monate</span>
          </span>
        )}
      </div>
      <a
        href="/legal/terms"
        className="text-[10px] leading-tight text-muted-foreground/60 hover:text-muted-foreground/90 transition-colors text-center max-w-xs"
      >
        Begrenztes Einführungsangebot. Änderungen vorbehalten. Gilt nur bei aktivem Betrieb des Dienstes. Details siehe AGB §8.
      </a>
    </div>
  );
};
