import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";

interface WelcomeBonusState {
  shouldShow: boolean;
  loading: boolean;
  bonusAmount: number | null;
  bonusCurrency: "EUR" | "USD" | null;
}

/**
 * Determines whether the brand-new user is eligible for the Welcome Bonus popup.
 * Eligibility: account < 7 days old, no purchases, no spend, popup not yet seen.
 * Auto-grants the bonus when the popup is shown for the first time.
 */
export const useWelcomeBonus = () => {
  const { user } = useAuth();
  const [state, setState] = useState<WelcomeBonusState>({
    shouldShow: false,
    loading: true,
    bonusAmount: null,
    bonusCurrency: null,
  });

  useEffect(() => {
    if (!user) {
      setState({ shouldShow: false, loading: false, bonusAmount: null, bonusCurrency: null });
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        // 1) Account age guard (< 7 days)
        const createdAt = user.created_at ? new Date(user.created_at).getTime() : Date.now();
        const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
        if (ageDays > 7) {
          if (!cancelled) setState({ shouldShow: false, loading: false, bonusAmount: null, bonusCurrency: null });
          return;
        }

        // 2) Profile check — already seen / granted?
        const { data: profile } = await supabase
          .from("profiles")
          .select("welcome_bonus_seen_at, welcome_bonus_granted_at")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.welcome_bonus_seen_at) {
          if (!cancelled) setState({ shouldShow: false, loading: false, bonusAmount: null, bonusCurrency: null });
          return;
        }

        // 3) Wallet check — no purchases, no spend
        const { data: wallet } = await supabase
          .from("ai_video_wallets")
          .select("total_purchased_euros, total_spent_euros, balance_euros, currency")
          .eq("user_id", user.id)
          .maybeSingle();

        const hasPurchased = wallet && Number(wallet.total_purchased_euros) > 0;
        const hasSpent = wallet && Number(wallet.total_spent_euros) > 0;
        if (hasPurchased || hasSpent) {
          if (!cancelled) setState({ shouldShow: false, loading: false, bonusAmount: null, bonusCurrency: null });
          return;
        }

        // 4) Grant bonus (idempotent server-side) if not already granted
        let granted = !!profile?.welcome_bonus_granted_at;
        let amount: number | null = wallet ? Number(wallet.balance_euros) : null;
        let currency = (wallet?.currency as "EUR" | "USD" | undefined) ?? "EUR";

        if (!granted) {
          const { data: grantData, error: grantError } = await supabase.functions.invoke(
            "grant-welcome-bonus",
            { body: {} }
          );
          if (grantError) {
            console.error("[useWelcomeBonus] grant error", grantError);
            if (!cancelled) setState({ shouldShow: false, loading: false, bonusAmount: null, bonusCurrency: null });
            return;
          }
          if (grantData?.granted) {
            granted = true;
            amount = grantData.amount;
            currency = grantData.currency;
            trackEvent(ANALYTICS_EVENTS.WELCOME_BONUS_CLAIMED, {
              amount,
              currency,
            });
          } else if (grantData?.reason === "email_not_verified") {
            if (!cancelled) setState({ shouldShow: false, loading: false, bonusAmount: null, bonusCurrency: null });
            return;
          } else {
            // already granted on server but not seen → still show popup
            granted = true;
          }
        }

        if (!cancelled) {
          setState({
            shouldShow: granted,
            loading: false,
            bonusAmount: amount ?? 10,
            bonusCurrency: currency,
          });
        }
      } catch (err) {
        console.error("[useWelcomeBonus] error", err);
        if (!cancelled) setState({ shouldShow: false, loading: false, bonusAmount: null, bonusCurrency: null });
      }
    };

    check();
    return () => { cancelled = true; };
  }, [user?.id]);

  const dismiss = useCallback(async () => {
    if (!user) return;
    setState((s) => ({ ...s, shouldShow: false }));
    await supabase
      .from("profiles")
      .update({ welcome_bonus_seen_at: new Date().toISOString() })
      .eq("id", user.id);
  }, [user?.id]);

  return { ...state, dismiss };
};
