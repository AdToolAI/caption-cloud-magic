import { Sparkles, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Slim gold banner showing remaining days of the 14-day Enterprise trial.
 * Hidden when trial is converted/expired or user has no trial.
 */
export function TrialBanner() {
  const { status, daysRemaining, loading } = useTrialStatus();
  const { t } = useTranslation();

  if (loading || status !== "active" || daysRemaining <= 0) return null;

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
