import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Crown, Zap, Sparkles, Lock, ArrowRight } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { pricingPlans, Currency } from "@/config/pricing";
import { getCurrencyForLanguage, formatPrice } from "@/lib/currency";
import { useUrlCoupon } from "@/hooks/useUrlCoupon";
import { CouponBanner } from "@/components/pricing/CouponBanner";
import { CompetitorComparisonCard } from "@/components/landing/CompetitorComparisonCard";
import { AI_VIDEO_CREDIT_PACKS } from "@/config/aiVideoCredits";

const Pricing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const [searchParams] = useSearchParams();
  const isReactivation = searchParams.get("reactivate") === "1";

  const [proLoading, setProLoading] = useState(false);
  const [packLoading, setPackLoading] = useState<string | null>(null);

  const { couponCode, clearCoupon } = useUrlCoupon();

  const currency: Currency = getCurrencyForLanguage(language);
  const currencySymbol = currency === "USD" ? "$" : "€";

  const proFeatures = [
    t("landing.pricing.proFeatures.f1"),
    t("landing.pricing.proFeatures.f2"),
    t("landing.pricing.proFeatures.f3"),
    t("landing.pricing.proFeatures.f4"),
    t("landing.pricing.proFeatures.f5"),
    t("landing.pricing.proFeatures.f6"),
    t("landing.pricing.proFeatures.f7"),
  ];

  const handleProCheckout = async () => {
    if (!user) {
      navigate("/auth?redirect=/pricing");
      return;
    }
    setProLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId: pricingPlans.pro.priceId,
          ...(couponCode ? { promoCode: couponCode } : {}),
        },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err) {
      console.error("Checkout error:", err);
      toast.error(t("pricingDetails.errors.checkoutFailed"));
    } finally {
      setProLoading(false);
    }
  };

  const handlePackPurchase = async (packId: keyof typeof AI_VIDEO_CREDIT_PACKS) => {
    if (!user) {
      navigate("/auth?redirect=/pricing");
      return;
    }
    setPackLoading(packId);
    try {
      const { data, error } = await supabase.functions.invoke("ai-video-purchase-credits", {
        body: { packId, currency },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err) {
      console.error("Top-up error:", err);
      toast.error(t("aiVid.purchaseError"));
    } finally {
      setPackLoading(null);
    }
  };

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "AdTool AI Pro",
    description:
      "All-in-one AI social media platform — captions, images, posting, Director's Cut & AI video credits.",
    brand: { "@type": "Brand", name: "AdTool AI" },
    offers: {
      "@type": "Offer",
      price: pricingPlans.pro.price.EUR.toString(),
      priceCurrency: "EUR",
      availability: "https://schema.org/OnlineOnly",
      url: "https://useadtool.ai/pricing",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: "1200",
    },
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO
        title="Pricing — AdTool AI Pro €19.99/month"
        description="One simple plan. Captions, images, Director's Cut, posting & AI video credits. 14-day free trial. Cancel anytime."
        canonical="https://useadtool.ai/pricing"
        lang={language}
        ogImage="/og-pricing.jpg"
        structuredData={structuredData}
      />

      <main className="flex-1 relative overflow-hidden">
        {/* Ambient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-card/20 to-background pointer-events-none" />
        <div className="absolute top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="container relative z-10 max-w-6xl mx-auto px-4 py-16 md:py-24">
          {/* Reactivation banner */}
          {isReactivation && (
            <div className="max-w-3xl mx-auto mb-10 rounded-2xl border border-primary/40 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 px-6 py-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {t("trial.reactivateHeadline")}
                </h2>
                <p className="text-sm text-muted-foreground">{t("trial.reactivateSub")}</p>
              </div>
            </div>
          )}

          {couponCode && <CouponBanner code={couponCode} onRemove={clearCoupon} />}

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-medium tracking-wider uppercase mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              {t("landing.pricing.launchBadge")}
            </div>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold mb-4">
              <span className="text-foreground">{t("landing.pricing.title1")}</span>
              <span className="bg-gradient-to-r from-primary to-gold-dark bg-clip-text text-transparent">
                {t("landing.pricing.title2")}
              </span>
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              {t("landing.pricing.subtitle")}
            </p>
          </motion.div>

          {/* Main grid: Pro card + sidebar */}
          <div className="grid md:grid-cols-3 gap-6 md:gap-8 mb-20">
            {/* Pro card (main) */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="md:col-span-2 relative group"
            >
              <div className="absolute -top-4 left-8 z-10">
                <div className="bg-gradient-to-r from-primary to-gold-dark text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                  {t("landing.pricing.badge")}
                </div>
              </div>

              <div className="relative h-full bg-card/60 backdrop-blur-xl border border-primary/50 rounded-2xl p-8 md:p-10 shadow-[var(--shadow-glow-gold)] transition-all duration-500 hover:-translate-y-1">
                <div className="grid sm:grid-cols-[auto,1fr] gap-6 sm:gap-8 items-start mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-gold-dark/20 flex items-center justify-center flex-shrink-0">
                    <Crown className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-foreground mb-1">
                      {t("landing.pricing.singlePlanTitle")}
                    </h2>
                    <p className="text-sm text-muted-foreground mb-3 max-w-md">
                      {t("landing.pricing.singlePlanDescription")}
                    </p>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-lg text-muted-foreground/60 line-through tabular-nums">
                        {currencySymbol}29.99
                      </span>
                      <span className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-gold-dark bg-clip-text text-transparent tabular-nums">
                        {currencySymbol}19.99
                      </span>
                      <span className="text-muted-foreground">
                        {t("landing.pricing.perMonth")}
                      </span>
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-primary/80 font-medium">
                      <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                      {t("landing.pricing.launchBadge")}
                    </div>
                  </div>
                </div>

                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mb-8">
                  {proFeatures.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="h-5 w-5 mt-0.5 flex-shrink-0 text-primary" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                  <Button
                    size="lg"
                    onClick={handleProCheckout}
                    disabled={proLoading}
                    className="bg-gradient-to-r from-primary to-gold-dark text-primary-foreground font-semibold shadow-[var(--shadow-glow-gold)] hover:shadow-[0_0_50px_hsla(43,90%,68%,0.5)] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] border-0 h-12 px-8"
                  >
                    {proLoading
                      ? t("pricingDetails.loading")
                      : user
                        ? t("landing.pricing.subscribe")
                        : t("landing.pricing.start")}
                  </Button>
                  <p className="text-xs text-muted-foreground sm:text-right max-w-xs">
                    {user ? t("landing.pricing.subscribeNote") : t("landing.pricing.trialNote")}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Sidebar */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="md:col-span-1 flex flex-col gap-6"
            >
              <CompetitorComparisonCard />

              {/* Top-up jump card */}
              <a
                href="#topups"
                className="relative bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl p-5 hover:border-accent/30 transition-all duration-500 group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/20 to-primary/10 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-4 w-4 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-foreground mb-1">
                      {t("landing.pricing.topupTitle")}
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t("landing.pricing.topupSubtitle")}
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary group-hover:gap-2 transition-all duration-300">
                  {t("landing.pricing.topupCta")}
                  <ArrowRight className="h-3 w-3" />
                </span>
              </a>
            </motion.div>
          </div>

          {/* Top-up Packs Section */}
          <section id="topups" className="scroll-mt-24">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-10"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent/30 bg-accent/5 text-accent text-xs font-medium tracking-wider uppercase mb-4">
                <Zap className="w-3.5 h-3.5" />
                AI Video Credits
              </div>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
                {t("landing.pricing.topupTitle")}
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {t("landing.pricing.topupSubtitle")}
              </p>
            </motion.div>

            {currency === "EUR" && (
              <p className="text-xs text-muted-foreground text-center mb-6">
                Alle Preise inkl. 19% MwSt. (Deutschland). Rechnung wird automatisch per E-Mail
                zugestellt.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {Object.entries(AI_VIDEO_CREDIT_PACKS).map(([key, pack], idx) => {
                const isPopular = pack.popular;
                const isBest = pack.bestValue;
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: idx * 0.05 }}
                  >
                    <Card
                      className={`relative h-full p-6 bg-card/60 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 ${
                        isPopular
                          ? "border-primary/50 shadow-[var(--shadow-glow-gold)]"
                          : isBest
                            ? "border-accent/40"
                            : "border-border/50 hover:border-primary/30"
                      }`}
                    >
                      {pack.badge && !isBest && (
                        <Badge
                          variant="secondary"
                          className="absolute top-4 right-4 text-[10px]"
                        >
                          {pack.badge}
                        </Badge>
                      )}
                      {isBest && (
                        <Badge className="absolute top-4 right-4 bg-gradient-to-r from-accent to-primary text-[10px] border-0">
                          <Sparkles className="w-3 h-3 mr-1" />
                          Best Value
                        </Badge>
                      )}

                      <h3 className="text-lg font-semibold text-foreground">
                        {pack.name[currency]}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 mb-4">
                        {pack.description[currency]}
                      </p>

                      <div className="mb-5">
                        <span
                          className={`text-3xl font-bold tabular-nums ${
                            isPopular
                              ? "bg-gradient-to-r from-primary to-gold-dark bg-clip-text text-transparent"
                              : "text-foreground"
                          }`}
                        >
                          {formatPrice(pack.price[currency], currency)}
                        </span>
                      </div>

                      <ul className="space-y-2 text-sm mb-6">
                        <li className="flex items-center gap-2 text-muted-foreground">
                          <Check className="w-4 h-4 text-primary flex-shrink-0" />
                          <span>
                            {formatPrice(pack.price[currency], currency)} {t("aiVid.total")}
                          </span>
                        </li>
                        {pack.bonusPercent > 0 && (
                          <li className="flex items-center gap-2 text-primary font-medium">
                            <Check className="w-4 h-4 flex-shrink-0" />
                            <span>+{formatPrice(pack.bonus[currency], currency)} Bonus</span>
                          </li>
                        )}
                        <li className="flex items-center gap-2 text-foreground font-semibold">
                          <Check className="w-4 h-4 text-primary flex-shrink-0" />
                          <span>
                            ={" "}
                            {formatPrice(pack.totalCredits[currency], currency)}{" "}
                            {t("aiVid.total")}
                          </span>
                        </li>
                      </ul>

                      <Button
                        className={`w-full ${
                          isPopular
                            ? "bg-gradient-to-r from-primary to-gold-dark text-primary-foreground border-0"
                            : ""
                        }`}
                        variant={isPopular ? "default" : "outline"}
                        onClick={() => handlePackPurchase(key as keyof typeof AI_VIDEO_CREDIT_PACKS)}
                        disabled={packLoading !== null}
                      >
                        {packLoading === key ? t("aiVid.loadingBtn") : t("aiVid.buyNow")}
                      </Button>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* Footer note: custom / enterprise contact */}
          <div className="mt-20 text-center max-w-2xl mx-auto">
            <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-8">
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {t("pricingDetails.custom.title")}
              </h3>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                {t("pricingDetails.custom.description")}
              </p>
              <a
                href="mailto:bestofproducts4u@gmail.com"
                className="inline-flex items-center gap-2 text-primary hover:text-gold-dark font-medium text-sm transition-colors"
              >
                {t("pricingDetails.custom.contact")} <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Pricing;
