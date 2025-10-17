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
        Token ungültig
      </Badge>
    );
  }

  if (!lastSyncAt) {
    return (
      <Badge variant="outline" className="text-xs gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
        <AlertCircle className="h-3 w-3" />
        Noch nicht synchronisiert
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
        Aktiv
      </Badge>
    );
  }

  if (hoursSinceSync < 168) { // 7 days
    return (
      <Badge variant="outline" className="text-xs gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
        <AlertCircle className="h-3 w-3" />
        Token möglicherweise abgelaufen
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs gap-1 bg-orange-50 text-orange-700 border-orange-200">
      <AlertCircle className="h-3 w-3" />
      Lange nicht synchronisiert
    </Badge>
  );
};