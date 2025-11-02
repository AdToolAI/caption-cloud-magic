import { AlertCircle, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConflictRule } from "@/lib/plannerValidation";

interface ConflictWarningProps {
  conflicts: ConflictRule[];
  className?: string;
}

export function ConflictWarning({ conflicts, className }: ConflictWarningProps) {
  if (conflicts.length === 0) return null;

  const errors = conflicts.filter((c) => c.severity === "error");
  const warnings = conflicts.filter((c) => c.severity === "warning");

  return (
    <div className={`space-y-2 ${className}`}>
      {errors.map((conflict, idx) => (
        <Alert key={`error-${idx}`} variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            {conflict.message}
          </AlertDescription>
        </Alert>
      ))}

      {warnings.map((warning, idx) => (
        <Alert key={`warning-${idx}`} className="py-2 border-amber-500/50 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm text-amber-700 dark:text-amber-400">
            {warning.message}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

export function ConflictBadge({ conflictCount, type }: { conflictCount: number; type: "error" | "warning" }) {
  if (conflictCount === 0) return null;

  return (
    <Badge
      variant={type === "error" ? "destructive" : "secondary"}
      className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
    >
      {conflictCount}
    </Badge>
  );
}