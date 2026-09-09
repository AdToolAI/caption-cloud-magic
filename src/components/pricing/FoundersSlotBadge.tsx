import { tx } from "@/lib/i18nText";
import { Sparkles } from "lucide-react";
import { FOUNDERS_MAX_SLOTS } from "@/config/stripe";

interface Props {
  className?: string;
}

/**
 * Founders program badge.
 *
 * ANONYMITY CONTRACT: no remaining-slot count, no position, no ranking and no
 * join date is ever shown publicly. Only the program cap is communicated.
 */
export const FoundersSlotBadge = ({ className = "" }: Props) => {
  return (
    <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/40 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 text-xs font-medium tracking-wide">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-foreground">
          {tx({
            de: "Founders-Programm",
            en: "Founders Program",
            es: "Programa Founders",
          })}{" "}
          ·{" "}
          <span className="text-primary">
            {tx({
              de: `Begrenzt auf ${FOUNDERS_MAX_SLOTS.toLocaleString("de-DE")} Mitglieder`,
              en: `Limited to ${FOUNDERS_MAX_SLOTS.toLocaleString("en-US")} members`,
              es: `Limitado a ${FOUNDERS_MAX_SLOTS.toLocaleString("es-ES")} miembros`,
            })}
          </span>
        </span>
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
