import { tx } from '@/lib/i18nText';
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, XCircle } from "lucide-react";

interface TokenStatusBadgeProps {
  lastSyncAt: string | null;
  hasError?: boolean;
}

export const TokenStatusBadge = ({ lastSyncAt, hasError }: TokenStatusBadgeProps) => {
  if (hasError) {
    return (
      <Badge variant="destructive" className="text-xs gap-1">
        <XCircle className="h-3 w-3" />
        {tx({ de: "Token ungültig", en: "Invalid token", es: "Token inválido" })}
      </Badge>
    );
  }

  if (!lastSyncAt) {
    return (
      <Badge variant="outline" className="text-xs gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
        <AlertCircle className="h-3 w-3" />
        {tx({ de: "Noch nicht synchronisiert", en: "Not yet synchronized", es: "Aún no sincronizado" })}
      </Badge>
    );
  }

  const lastSync = new Date(lastSyncAt);
  const now = new Date();
  const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

  if (hoursSinceSync < 24) {
    return (
      <Badge variant="outline" className="text-xs gap-1 bg-green-50 text-green-700 border-green-200">
        <CheckCircle className="h-3 w-3" />
        {tx({ de: "Aktiv", en: "Active", es: "Activo" })}
      </Badge>
    );
  }

  if (hoursSinceSync < 168) { // 7 days
    return (
      <Badge variant="outline" className="text-xs gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
        <AlertCircle className="h-3 w-3" />
        {tx({ de: "Token möglicherweise abgelaufen", en: "Token possibly expired", es: "Token posiblemente caducado" })}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs gap-1 bg-orange-50 text-orange-700 border-orange-200">
      <AlertCircle className="h-3 w-3" />
      {tx({ de: "Lange nicht synchronisiert", en: "Not synchronized for a long time", es: "No sincronizado en mucho tiempo" })}
    </Badge>
  );
};