import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Sparkles } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PricingCard } from "@/components/PricingCard";

interface Feature {
  id: string;
  category: string;
  route: string;
  titles_json: Record<string, string>;
  description_json?: Record<string, string>;
  icon: string;
  plan: string;
  enabled: boolean;
  order: number;
}

const Home = () => {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [userPlan, setUserPlan] = useState<string>("free");
  const [weeklyPosts, setWeeklyPosts] = useState<number>(4);
  const weeklyGoal = 6;

  useEffect(() => {
    loadFeatures();
    if (user) {
      loadUserPlan();
    }
  }, [user]);

  const loadFeatures = async () => {
    const { data } = await supabase
      .from("feature_registry")
      .select("*")
      .eq("enabled", true)
      .order("order");
    
    if (data) {
      setFeatures(data as Feature[]);
    }
  };

  const loadUserPlan = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();
    
    if (data?.plan) {
      setUserPlan(data.plan);
    }
  };

  const getIconComponent = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Sparkles;
  };

  const isFeatureLocked = (feature: Feature) => {
    return feature.plan === "pro" && userPlan !== "pro";
  };

  const groupedFeatures = {
    create: features.filter(f => f.category === "create"),
    optimize: features.filter(f => f.category === "optimize"),
    analyze: features.filter(f => f.category === "analyze"),
    design: features.filter(f => f.category === "design"),
  };

  const userName = user?.email?.split("@")[0] || "User";
  const progressPercentage = (weeklyPosts / weeklyGoal) * 100;
  const postsRemaining = Math.max(0, weeklyGoal - weeklyPosts);

  const renderFeatureCard = (feature: Feature) => {
    const IconComponent = getIconComponent(feature.icon);
    const locked = isFeatureLocked(feature);
    const title = feature.titles_json[language] || feature.titles_json.en;
    const description = feature.description_json?.[language] || feature.description_json?.en || "";
    const isNew = ["comment-manager", "reel-script"].includes(feature.id);

    return (
      <Card key={feature.id} className="group">
        <CardHeader>
          <div className="flex items-start justify-between mb-3">
            <IconComponent className="h-8 w-8 text-primary" />
            <div className="flex gap-2">
              {isNew && (
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-muted text-muted-foreground">
                  {t("ui.badge.new")}
                </span>
              )}
              {feature.plan === "pro" && (
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary">
                  {t("ui.badge.pro")}
                </span>
              )}
            </div>
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription className="text-sm line-clamp-2">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {locked ? (
            <Button variant="outline" className="w-full" disabled>
              {t("common.upgradeToPro")}
            </Button>
          ) : (
            <Button asChild variant="outline" className="w-full">
              <Link to={feature.route}>{t("hero.cta")}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <section className="relative bg-slate-50 py-16 lg:py-24 border-b">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center space-y-6 animate-fadeUp max-w-3xl mx-auto">
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">{t("hero.title")}</h1>
            <p className="text-lg text-slate-600">{t("hero.subtitle")}</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button size="lg" className="gap-2">{t("hero.cta")} <ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </section>
      {user && (
        <section className="container mx-auto px-4 max-w-6xl py-8">
          <Card className="bg-card animate-fadeUp">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">{t("ui.welcome.greeting", { name: userName })}</CardTitle>
              <CardDescription>{t("ui.welcome.weeklyProgress", { count: weeklyPosts, remaining: postsRemaining })}</CardDescription>
            </CardHeader>
            <CardContent><Progress value={progressPercentage} className="h-2" /></CardContent>
          </Card>
        </section>
      )}
      <section className="container mx-auto px-4 max-w-6xl py-14 space-y-16">
        {["create", "optimize", "analyze", "design"].map(cat => groupedFeatures[cat as keyof typeof groupedFeatures].length > 0 && (
          <div key={cat} className="space-y-8 animate-fadeUp">
            <div className="text-center max-w-2xl mx-auto"><h2 className="text-3xl font-bold mb-3">{t(`category.${cat}`)}</h2></div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{groupedFeatures[cat as keyof typeof groupedFeatures].map(renderFeatureCard)}</div>
          </div>
        ))}
      </section>
      <section id="pricing" className="bg-slate-50 py-14 lg:py-20 border-t"><div className="container mx-auto px-4 max-w-6xl"><div className="text-center max-w-2xl mx-auto mb-12"><h2 className="text-3xl font-bold mb-3 text-slate-900">{t("pricing.title")}</h2><p className="text-slate-600">{t("pricing.subtitle")}</p></div><div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto"><PricingCard title={t("pricing.free")} price="€0" features={[t("pricing.freeFeature1"), t("pricing.freeFeature2")]} buttonText={t("pricing.freeButton")} buttonVariant="outline"/><PricingCard title={t("pricing.proMonthly")} price="€9.99" period={t("pricing.month")} description={t("pricing.cancelAnytime")} features={[t("pricing.proFeature1"), t("pricing.proFeature2"), t("pricing.proFeature3")]} buttonText={t("pricing.proButton")} popular={true}/><PricingCard title={t("pricing.proYearly")} price="€69.99" period={t("pricing.year")} description={t("pricing.saveFortyTwo")} features={[t("pricing.proFeature1"), t("pricing.proFeature2"), t("pricing.cancelAnytime")]} buttonText={t("pricing.proButton")}/></div></div></section>
    </div>
  );
};

export default Home;
