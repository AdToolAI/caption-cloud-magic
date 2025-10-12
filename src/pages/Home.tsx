import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Check } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PricingCard } from "@/components/PricingCard";
import { TodayActivityWidget } from "@/components/dashboard/TodayActivityWidget";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { useOnboarding } from "@/hooks/useOnboarding";

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
  const { showWelcome, showTour, startTour, skipOnboarding, completeOnboarding } = useOnboarding();
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
      <Card 
        key={feature.id} 
        className="group hover:shadow-[var(--shadow-md)] hover:-translate-y-1 transition-all duration-300"
        data-tour={feature.id === "generator" ? "generator" : feature.id === "performance" ? "performance" : undefined}
      >
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between mb-3">
            <div className="p-3 bg-primary/10 rounded-xl group-hover:bg-primary/15 transition-colors">
              <IconComponent className="h-6 w-6 text-primary" />
            </div>
            <div className="flex gap-2">
              {isNew && (
                <span className="px-3 py-1 text-xs font-medium bg-primary/10 text-primary rounded-md">
                  {t("ui.badge.new")}
                </span>
              )}
              {feature.plan === "pro" && (
                <span className="px-3 py-1 text-xs font-medium bg-accent/10 text-accent rounded-md">
                  {t("ui.badge.pro")}
                </span>
              )}
            </div>
          </div>
          <CardTitle className="text-xl font-semibold group-hover:text-primary transition-colors">{title}</CardTitle>
          <CardDescription className="leading-relaxed">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {locked ? (
            <Button variant="outline" className="w-full rounded-xl py-5 font-medium border-2 hover:border-primary hover:text-primary" disabled>
              {t("common.upgradeToPro")}
            </Button>
          ) : (
            <Button asChild className="w-full gradient-primary text-white rounded-xl py-5 font-medium shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:scale-[1.02] transition-all">
              <Link to={feature.route}>
                {t("common.startNow")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Onboarding Components */}
      {user && showWelcome && (
        <WelcomeModal 
          open={showWelcome} 
          onStartTour={startTour}
          onSkip={skipOnboarding}
        />
      )}
      
      {user && showTour && (
        <OnboardingTour 
          onComplete={completeOnboarding}
          onSkip={skipOnboarding}
        />
      )}

      {/* Hero Section - Conversion Optimized */}
      <section className="text-center bg-card pt-20 pb-16 border-b border-border" data-tour="welcome">
        <div className="container mx-auto px-4 max-w-5xl">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
            {t("hero.title")}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mt-4 max-w-2xl mx-auto leading-relaxed">
            {t("hero.subtitle")}
          </p>
          <div className="flex justify-center mt-8">
            <Link to="/auth">
              <Button size="lg" className="gradient-primary text-white font-medium rounded-xl px-8 py-6 shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)] hover:scale-[1.03] transition-all">
                {t("hero.cta")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
          <div className="flex justify-center items-center mt-8 gap-6 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />{t("ui.trust.cancelAnytime")}</span>
            <span>🔒 {t("ui.trust.securePayment")}</span>
            <span>🚀 {t("ui.trust.readyInSeconds")}</span>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Welcome Widget with Gradient Progress */}
        {user && (
          <Card className="mb-12 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all animate-fadeIn">
            <CardContent className="p-6">
              <p className="text-lg font-medium text-foreground">
                👋 {t("ui.welcome.greeting").replace("{name}", userName)}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("ui.welcome.weeklyProgress").replace("{count}", weeklyPosts.toString()).replace("{remaining}", postsRemaining.toString())} 🚀
              </p>
              <div className="relative mt-4 h-2 bg-muted rounded-full overflow-hidden">
                <div className="absolute left-0 top-0 h-full gradient-primary transition-all duration-700" style={{ width: `${progressPercentage}%` }} />
              </div>
              <div className="mt-5 flex items-start gap-3 text-sm text-muted-foreground border-t border-border pt-4">
                <span className="text-2xl">💡</span>
                <p><strong className="text-foreground">{t("ui.welcome.tipOfTheDay")}:</strong> {language === "de" ? "Poste heute zwischen 18 – 20 Uhr – dort ist dein Publikum am aktivsten." : "Post today between 6 PM – 8 PM – that's when your audience is most active."}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dashboard Widgets - Activity Overview */}
        {user && (
          <div className="mb-12 space-y-6 animate-fadeIn">
            <TodayActivityWidget />
            <RecentActivityFeed />
          </div>
        )}

        {/* Feature Categories */}
        {Object.entries(groupedFeatures).map(([categoryKey, categoryFeatures]) => {
          if (categoryFeatures.length === 0) return null;
          return (
            <section 
              key={categoryKey} 
              className="mb-12 animate-fadeIn"
              data-tour={categoryKey === "create" ? "features" : undefined}
            >
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-foreground mb-2">{t(`category.${categoryKey}`)}</h2>
                <p className="text-muted-foreground">{t(`ui.category.${categoryKey}Desc`)}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categoryFeatures.map(renderFeatureCard)}
              </div>
            </section>
          );
        })}

        {/* Pricing Section */}
        <section className="bg-muted/50 rounded-3xl p-8 md:p-12 mt-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">{t("pricing.title")}</h2>
            <p className="text-lg text-muted-foreground">{t("pricing.subtitle")}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <PricingCard title={t("pricing.free")} price="€0" description={t("pricing.freeDesc")} features={[t("pricing.freeFeature1"), t("pricing.freeFeature2"), t("pricing.freeFeature3")]} buttonText={t("pricing.tryFree")} buttonVariant="outline" />
            <PricingCard title={t("pricing.proMonthly")} price="€9.99" period={t("pricing.month")} description={t("pricing.cancelAnytime")} features={[t("pricing.proFeature1"), t("pricing.proFeature2"), t("pricing.proFeature3"), t("pricing.proFeature4")]} buttonText={t("pricing.startNow")} popular />
            <PricingCard title={t("pricing.proYearly")} price="€69.99" period={t("pricing.year")} description={t("pricing.saveFortyTwo")} features={[t("pricing.proFeature1"), t("pricing.proFeature2"), t("pricing.proFeature3"), t("pricing.proFeature4"), t("pricing.proFeature5")]} buttonText={t("pricing.startNow")} />
          </div>
        </section>
      </div>
    </div>
  );
};

export default Home;
