import { Sparkles, Clock, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Banner showing trial state. Three visual modes:
 *  - Normal (>3 days left): gold, Sparkles
 *  - Urgent (<=3 days left): destructive, Clock
 *  - Grace (trial expired, in grace period): pulsing destructive, AlertTriangle
 */
export function TrialBanner() {
  const { status, daysRemaining, inGracePeriod, graceDaysRemaining, loading } = useTrialStatus();
  const { t } = useTranslation();

  if (loading) return null;

  // Grace period takes precedence
  if (inGracePeriod || status === "grace") {
    return (
      <div className="relative w-full border-b bg-gradient-to-r from-destructive/25 via-destructive/20 to-destructive/25 border-destructive/50 animate-pulse">
        <div className="container flex items-center justify-between gap-3 py-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            <span className="truncate">
              <strong className="text-destructive">⚠ {t("trial.graceTitle")}</strong>{" "}
              {t("trial.graceBanner", { days: graceDaysRemaining })}
            </span>
          </div>
          <Link
            to="/pricing"
            className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 transition-colors"
          >
            {t("trial.graceCta")}
          </Link>
        </div>
      </div>
    );
  }

  if (status !== "active" || daysRemaining <= 0) return null;

  const isUrgent = daysRemaining <= 3;

  return (
    <div
      className={`relative w-full border-b ${
        isUrgent
          ? "bg-gradient-to-r from-destructive/15 via-destructive/10 to-destructive/15 border-destructive/30"
          : "bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border-primary/20"
      }`}
    >
      <div className="container flex items-center justify-between gap-3 py-2 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          {isUrgent ? (
            <Clock className="h-4 w-4 text-destructive flex-shrink-0" />
          ) : (
            <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
          )}
          <span className="truncate">
            <strong className={isUrgent ? "text-destructive" : "text-primary"}>
              {daysRemaining}{" "}
              {daysRemaining === 1
                ? t("trial.day")
                : t("trial.days")}
            </strong>{" "}
            {t("trial.bannerSuffix")}
          </span>
        </div>
        <Link
          to="/pricing"
          className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          {t("trial.upgradeCta")}
        </Link>
      </div>
    </div>
  );
}
