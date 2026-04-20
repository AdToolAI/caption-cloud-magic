import { ReactNode } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { useTranslation } from "@/hooks/useTranslation";

const ALLOWED_PATHS = [
  "/pricing",
  "/auth",
  "/account",
  "/billing",
  "/legal",
  "/privacy",
  "/terms",
  "/imprint",
  "/support",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

interface Props {
  children: ReactNode;
}

/**
 * Wraps protected app routes. If the user's account is paused
 * (trial expired and no active subscription), they only have access
 * to the pricing/account/legal pages until they subscribe.
 */
export function AccountPausedGate({ children }: Props) {
  const { accountPaused, loading } = useTrialStatus();
  const { t } = useTranslation();
  const location = useLocation();

  if (loading) return <>{children}</>;
  if (!accountPaused) return <>{children}</>;

  const isAllowed = ALLOWED_PATHS.some((p) => location.pathname.startsWith(p));
  if (isAllowed) return <>{children}</>;

  // Force redirect to reactivation pricing
  if (location.pathname !== "/pricing") {
    return <Navigate to="/pricing?reactivate=1" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-6">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-3">{t("trial.pausedTitle")}</h1>
        <p className="text-muted-foreground mb-8">{t("trial.pausedDescription")}</p>
        <Link
          to="/pricing?reactivate=1"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/30"
        >
          <Sparkles className="h-4 w-4" />
          {t("trial.pausedCta")}
        </Link>
      </div>
    </div>
  );
}
