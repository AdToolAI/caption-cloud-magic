/**
 * WalletBadge — always-visible AI-video balance in the app header.
 *
 * Tester feedback: users could only see their balance inside the AI Video
 * Toolkit, so they never knew what a generation would leave them with. The
 * badge is rendered next to the profile icon on every page and updates in
 * realtime (`useAIVideoWallet` subscribes to `ai_video_wallets`).
 */

import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAIVideoWallet } from "@/hooks/useAIVideoWallet";
import { tx } from "@/lib/i18nText";
import { cn } from "@/lib/utils";

const CURRENCY_SIGN: Record<string, string> = { EUR: "€", USD: "$" };

export function WalletBadge({ className }: { className?: string }) {
  const { user } = useAuth();
  const { wallet, loading } = useAIVideoWallet();

  if (!user) return null;

  const label = tx({
    de: "Guthaben für KI-Videos",
    en: "AI video balance",
    es: "Saldo de vídeos con IA",
  });

  if (loading && !wallet) {
    return (
      <span
        aria-hidden
        className={cn(
          "hidden sm:inline-flex h-7 w-20 rounded-full bg-muted animate-pulse",
          className,
        )}
      />
    );
  }

  const balance = wallet?.balance_euros ?? 0;
  const sign = CURRENCY_SIGN[wallet?.currency ?? "EUR"] ?? "€";
  const isLow = balance < 5;

  return (
    <Link
      to="/billing"
      aria-label={`${label}: ${sign}${balance.toFixed(2)}`}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium transition-all",
        isLow
          ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
          : "bg-primary/10 text-primary hover:bg-primary/20",
        className,
      )}
    >
      <Wallet className="h-4 w-4 shrink-0" />
      <span className="tabular-nums">
        {sign}
        {balance.toFixed(2)}
      </span>
    </Link>
  );
}
