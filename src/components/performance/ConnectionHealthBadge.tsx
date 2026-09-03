import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, HelpCircle, XCircle } from "lucide-react";
import { tx } from "@/lib/i18nText";
import {
  classifyConnectionHealth,
  type ConnectionHealthInput,
  type ConnectionHealthResult,
} from "@/lib/socialConnectionHealth";

interface Props {
  connection: ConnectionHealthInput | null | undefined;
}

export function connectionHealthLabel(result: ConnectionHealthResult): string {
  switch (result.health) {
    case 'healthy':
      return tx({ de: "Verbunden", en: "Connected", es: "Conectado" });
    case 'expired':
      return tx({ de: "Token abgelaufen", en: "Token expired", es: "Token caducado" });
    case 'attention':
      return result.requiresReconnect
        ? tx({ de: "Neu verbinden", en: "Reconnect needed", es: "Reconectar" })
        : tx({ de: "Aufmerksamkeit nötig", en: "Needs attention", es: "Requiere atención" });
    case 'unverified':
      return tx({ de: "Prüfung erforderlich", en: "Verification required", es: "Verificación requerida" });
    default:
      return tx({ de: "Nicht verbunden", en: "Not connected", es: "No conectado" });
  }
}

export const ConnectionHealthBadge = ({ connection }: Props) => {
  const result = classifyConnectionHealth(connection);
  const label = connectionHealthLabel(result);

  if (result.health === 'missing') return null;

  if (result.health === 'expired') {
    return (
      <Badge variant="destructive" className="text-xs gap-1">
        <XCircle className="h-3 w-3" />
        {label}
      </Badge>
    );
  }

  if (result.health === 'attention') {
    return (
      <Badge
        variant="outline"
        className="text-xs gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800/50"
      >
        <AlertCircle className="h-3 w-3" />
        {label}
      </Badge>
    );
  }

  if (result.health === 'unverified') {
    return (
      <Badge
        variant="outline"
        className="text-xs gap-1 bg-muted text-muted-foreground border-border"
      >
        <HelpCircle className="h-3 w-3" />
        {label}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs gap-1 bg-green-50 text-green-700 border-green-200">
      <CheckCircle className="h-3 w-3" />
      {label}
    </Badge>
  );
};
