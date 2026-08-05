import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Gift, Loader2, Sparkles, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { getStripePriceId } from "@/config/stripe";

type Redemption = {
  id: string;
  code: string;
  status: string;
  created_at: string;
  applied_at: string | null;
};

const REASON_KEYS: Record<string, string> = {
  invalid: "account.promo.error.invalid",
  expired: "account.promo.error.expired",
  exhausted: "account.promo.error.exhausted",
  already_redeemed: "account.promo.error.alreadyRedeemed",
  has_subscription: "account.promo.error.hasSubscription",
  unauthorized: "account.promo.error.internal",
  internal: "account.promo.error.internal",
};

export const PromoCodeSection = () => {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const { toast } = useToast();

  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [activating, setActivating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [benefit, setBenefit] = useState<string | null>(null);

  const loadRedemptions = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("promo_redemptions")
      .select("id, code, status, created_at, applied_at")
      .order("created_at", { ascending: false });
    setRedemptions((data as Redemption[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadRedemptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const reserved = redemptions.find((r) => r.status === "reserved");
  const applied = redemptions.find((r) => r.status === "applied");

  const handleRedeem = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-promo-code", {
        body: { code: normalized, lang: language },
      });
      if (error) throw error;
      if (!data?.ok) {
        const key = REASON_KEYS[data?.reason as string] ?? REASON_KEYS.invalid;
        toast({ title: t("account.promo.error.title"), description: t(key), variant: "destructive" });
        return;
      }
      setBenefit(data.benefit ?? null);
      setCode("");
      toast({ title: t("account.promo.success.title"), description: data.benefit });
      await loadRedemptions();
    } catch (e) {
      toast({
        title: t("account.promo.error.title"),
        description: t("account.promo.error.internal"),
        variant: "destructive",
      });
    } finally {
      setRedeeming(false);
    }
  };

  const handleActivate = async () => {
    setActivating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: getStripePriceId("basic", "EUR") },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (e) {
      toast({
        title: t("account.promo.error.title"),
        description: t("account.promo.error.internal"),
        variant: "destructive",
      });
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-card/60 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            {t("account.promo.title")}
          </CardTitle>
          <CardDescription>{t("account.promo.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!reserved && !applied && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t("account.promo.placeholder")}
                className="uppercase tracking-widest"
                maxLength={40}
                onKeyDown={(e) => e.key === "Enter" && handleRedeem()}
              />
              <Button onClick={handleRedeem} disabled={redeeming || !code.trim()}>
                {redeeming ? <Loader2 className="h-4 w-4 animate-spin" /> : t("account.promo.redeem")}
              </Button>
            </div>
          )}

          {reserved && (
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-5 space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <Gift className="h-5 w-5" />
                <span className="font-semibold tracking-wide">{reserved.code}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {benefit ?? t("account.promo.reservedHint")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleActivate} disabled={activating || releasing} className="gap-2">
                  {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {t("account.promo.activate")}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleRelease}
                  disabled={releasing || activating}
                  className="gap-2 text-muted-foreground"
                >
                  {releasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  {t("account.promo.release")}
                </Button>
              </div>
            </div>
          )}

          {applied && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
              <div className="flex items-center gap-2 text-primary">
                <Gift className="h-5 w-5" />
                <span className="font-semibold tracking-wide">{applied.code}</span>
                <Badge variant="secondary">{t("account.promo.statusApplied")}</Badge>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">{t("account.promo.creditsHint")}</p>
          <p className="text-xs text-muted-foreground">{t("account.promo.foundersHint")}</p>
        </CardContent>
      </Card>

      <Card className="bg-card/60 backdrop-blur-xl border-white/10">
        <CardHeader>
          <CardTitle className="text-base">{t("account.promo.historyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : redemptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("account.promo.historyEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {redemptions.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium tracking-wide">{r.code}</span>
                  <span className="text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()} ·{" "}
                    {r.status === "applied"
                      ? t("account.promo.statusApplied")
                      : t("account.promo.statusReserved")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
