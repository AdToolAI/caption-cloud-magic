import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Check, Sparkles } from "lucide-react";
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
      <Card key={feature.id} className="group bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <IconComponent className="h-6 w-6 text-primary" />
            </div>
            <div className="flex gap-2">
              {isNew && (
                <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-accent/10 text-accent uppercase tracking-wide">
                  {t("ui.badge.new")}
                </span>
              )}
              {feature.plan === "pro" && (
                <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary uppercase tracking-wide">
                  {t("ui.badge.pro")}
                </span>
              )}
            </div>
          </div>
          <CardTitle className="text-lg font-semibold text-card-foreground">{title}</CardTitle>
          <CardDescription className="text-sm text-muted-foreground line-clamp-2">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {locked ? (
            <Button variant="outline" className="w-full" disabled>
              {t("common.upgradeToPro")}
            </Button>
          ) : (
            <Button asChild variant="default" className="w-full">
              <Link to={feature.route}>{t("common.startNow")}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative bg-background py-16 lg:py-24">
        <div className="container mx-auto px-4 max-w-[1200px]">
          <div className="text-center space-y-6 max-w-3xl mx-auto animate-fadeUp">
            <h1 className="text-[2.5rem] lg:text-5xl font-bold leading-tight text-foreground">
              {t("hero.title")}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t("hero.subtitle")}
            </p>
            <div className="flex flex-wrap gap-4 justify-center pt-4">
              <Button size="lg" className="gap-2">
                {t("hero.cta")} <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="gap-2">
                {t("hero.demo")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Welcome Widget */}
      {user && (
        <section className="container mx-auto px-4 max-w-[1200px] py-10">
          <Card className="border border-border shadow-sm bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium text-card-foreground flex items-center gap-2">
                👋 {t("ui.welcome.greeting", { name: userName })}
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                {t("ui.welcome.weeklyProgress", { count: weeklyPosts, remaining: postsRemaining })} 🚀
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all duration-500" 
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Features Sections */}
      <section className="container mx-auto px-4 max-w-[1200px] py-10 lg:py-16 space-y-16">
        {/* Create */}
        {groupedFeatures.create.length > 0 && (
          <div className="space-y-8">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
                {t("category.create")}
              </h2>
              <p className="text-muted-foreground">
                {t("ui.category.createDesc")}
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedFeatures.create.map(renderFeatureCard)}
            </div>
          </div>
        )}

        {/* Optimize */}
        {groupedFeatures.optimize.length > 0 && (
          <div className="space-y-8">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
                {t("category.optimize")}
              </h2>
              <p className="text-muted-foreground">
                {t("ui.category.optimizeDesc")}
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedFeatures.optimize.map(renderFeatureCard)}
            </div>
          </div>
        )}

        {/* Analyze */}
        {groupedFeatures.analyze.length > 0 && (
          <div className="space-y-8">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
                {t("category.analyze")}
              </h2>
              <p className="text-muted-foreground">
                {t("ui.category.analyzeDesc")}
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedFeatures.analyze.map(renderFeatureCard)}
            </div>
          </div>
        )}

        {/* Design */}
        {groupedFeatures.design.length > 0 && (
          <div className="space-y-8">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
                {t("category.design")}
              </h2>
              <p className="text-muted-foreground">
                {t("ui.category.designDesc")}
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedFeatures.design.map(renderFeatureCard)}
            </div>
          </div>
        )}
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="bg-card border-t border-border py-16 lg:py-20">
        <div className="container mx-auto px-4 max-w-[1200px]">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-3">
              {t("pricing.title")}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t("pricing.subtitle")}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-10">
            <PricingCard
              title={t("pricing.free")}
              price="€0"
              description={t("pricing.freeDesc")}
              features={[
                t("pricing.freeFeature1"),
                t("pricing.freeFeature2"),
                t("pricing.freeFeature3"),
              ]}
              buttonText={t("pricing.tryFree")}
              buttonVariant="outline"
            />
            <PricingCard
              title={t("pricing.proMonthly")}
              price="€9.99"
              period={t("pricing.month")}
              description={t("pricing.cancelAnytime")}
              features={[
                t("pricing.proFeature1"),
                t("pricing.proFeature2"),
                t("pricing.proFeature3"),
                t("pricing.proFeature4"),
              ]}
              buttonText={t("pricing.startNow")}
              popular={true}
            />
            <PricingCard
              title={t("pricing.proYearly")}
              price="€69.99"
              period={t("pricing.year")}
              description={t("pricing.saveFortyTwo")}
              features={[
                t("pricing.proFeature1"),
                t("pricing.proFeature2"),
                t("pricing.proFeature3"),
                t("pricing.proFeature4"),
                t("pricing.cancelAnytime"),
              ]}
              buttonText={t("pricing.startNow")}
            />
          </div>
          {/* Trust Row */}
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              <span>{t("pricing.benefit1")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              <span>{t("pricing.benefit2")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              <span>{t("pricing.benefit3")}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
