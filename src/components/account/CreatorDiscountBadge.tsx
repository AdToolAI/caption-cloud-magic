import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAccountType } from "@/hooks/useAccountType";
import { tx } from "@/lib/i18nText";

/**
 * Small badge shown next to prices/balances for Creator accounts.
 * Renders nothing for standard accounts.
 */
export const CreatorDiscountBadge = ({ className }: { className?: string }) => {
  const { isCreator, discountPercent } = useAccountType();
  if (!isCreator || discountPercent <= 0) return null;

  return (
    <Badge
      variant="outline"
      className={`gap-1 border-primary/40 bg-primary/10 text-primary ${className ?? ""}`}
      title={tx({
        de: `Creator-Konto: ${discountPercent} % Rabatt auf alle AI-Kosten`,
        en: `Creator account: ${discountPercent}% off all AI costs`,
        es: `Cuenta Creator: ${discountPercent} % de descuento en todos los costes de IA`,
      })}
    >
      <Sparkles className="h-3 w-3" />
      {tx({
        de: `Creator −${discountPercent} %`,
        en: `Creator −${discountPercent}%`,
        es: `Creator −${discountPercent} %`,
      })}
    </Badge>
  );
};
