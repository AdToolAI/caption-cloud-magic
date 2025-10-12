import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { getProductInfo } from "@/config/pricing";
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
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";

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
  const { user, subscribed, productId } = useAuth();
  const { showWelcome, showTour, startTour, skipOnboarding, completeOnboarding } = useOnboarding();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [weeklyPosts, setWeeklyPosts] = useState<number>(4);
  const weeklyGoal = 6;
  
  const isPro = subscribed && productId === 'prod_TDoYdYP1nOOWsN';

  useEffect(() => {
    loadFeatures();
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

  const getIconComponent = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Sparkles;
  };

  const isFeatureLocked = (feature: Feature) => {
    return feature.plan === "pro" && !isPro;
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
            <AnalyticsDashboard />
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
        <section className="bg-gradient-to-br from-muted/30 to-muted/60 rounded-3xl p-8 md:p-12 mt-16 shadow-xl">
          <div className="text-center mb-12">
            <div className="inline-block px-4 py-1.5 bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 text-primary rounded-full text-xs font-bold mb-4 shadow-lg shadow-primary/10">
              ✨ {language === "de" ? "Einfache & Transparente Preise" : language === "es" ? "Precios Simples y Transparentes" : "Simple & Transparent Pricing"}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3 tracking-tight">
              {language === "de" ? "Wachse mit CaptionGenie" : language === "es" ? "Crece con CaptionGenie" : "Grow with CaptionGenie"}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {language === "de" 
                ? "Wähle den Plan, der zu deinem Workflow passt. Kostenlos starten, jederzeit upgraden." 
                : language === "es"
                ? "Elige el plan que se adapte a tu flujo de trabajo. Comienza gratis, actualiza en cualquier momento."
                : "Choose the plan that fits your workflow. Start free, upgrade anytime."}
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* Free Plan */}
            <div className="relative flex flex-col bg-card rounded-2xl border-2 border-border/50 shadow-xl hover:shadow-2xl hover:scale-105 hover:border-primary/40 transition-all duration-500 p-6">
              <div className="text-center mb-6 pb-6 border-b border-border/50">
                <h3 className="text-2xl font-bold text-foreground mb-2 tracking-tight">
                  {language === "de" ? "Kostenlos" : language === "es" ? "Gratis" : "Free"}
                </h3>
                <p className="text-xs text-muted-foreground mb-6 font-medium">
                  {language === "de" 
                    ? "Perfekt zum Ausprobieren von CaptionGenie" 
                    : language === "es"
                    ? "Perfecto para probar CaptionGenie"
                    : "Perfect for trying out CaptionGenie"}
                </p>
                
                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="text-4xl font-bold text-foreground tracking-tighter">€0</span>
                  <span className="text-sm text-muted-foreground font-medium">
                    / {language === "de" ? "Monat" : language === "es" ? "mes" : "month"}
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                    <Check className="h-3 w-3 text-white font-extrabold" strokeWidth={4} />
                  </div>
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "20 KI-Captions pro Monat" : language === "es" ? "20 captions de IA por mes" : "20 AI captions per month"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                    <Check className="h-3 w-3 text-white font-extrabold" strokeWidth={4} />
                  </div>
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Basis-Templates" : language === "es" ? "Plantillas básicas" : "Basic templates"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                    <Check className="h-3 w-3 text-white font-extrabold" strokeWidth={4} />
                  </div>
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Community-Support" : language === "es" ? "Soporte comunitario" : "Community support"}
                  </span>
                </li>
              </ul>

              <Button variant="outline" size="lg" asChild className="w-full h-11 text-sm font-bold border-2 border-primary text-primary hover:bg-primary hover:text-white hover:scale-105 shadow-lg transition-all duration-300">
                <Link to="/auth">
                  {language === "de" ? "Kostenlos starten" : language === "es" ? "Comenzar gratis" : "Start for Free"}
                </Link>
              </Button>
            </div>

            {/* Basic Plan - Popular */}
            <div className="relative flex flex-col bg-card rounded-2xl border-2 border-primary shadow-2xl shadow-primary/30 lg:scale-105 lg:z-10 hover:scale-105 lg:hover:scale-110 transition-all duration-500 p-6">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent blur-md opacity-60"></div>
                  <div className="relative bg-gradient-to-r from-primary to-accent text-white px-6 py-1.5 rounded-full text-xs font-extrabold shadow-2xl tracking-wider">
                    ⭐ {language === "de" ? "BELIEBT" : language === "es" ? "POPULAR" : "POPULAR"}
                  </div>
                </div>
              </div>

              <div className="text-center mb-6 pb-6 border-b border-border/50">
                <h3 className="text-2xl font-bold text-foreground mb-2 tracking-tight">Basic</h3>
                <p className="text-xs text-muted-foreground mb-6 font-medium">
                  {language === "de" 
                    ? "Am besten für Content-Creator & kleine Unternehmen" 
                    : language === "es"
                    ? "Mejor para creadores de contenido y pequeñas empresas"
                    : "Best for content creators & small businesses"}
                </p>
                
                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="text-4xl font-bold text-foreground tracking-tighter">€9.99</span>
                  <span className="text-sm text-muted-foreground font-medium">
                    / {language === "de" ? "Monat" : language === "es" ? "mes" : "month"}
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                    <Check className="h-3 w-3 text-white font-extrabold" strokeWidth={4} />
                  </div>
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "200 KI-Captions pro Monat" : language === "es" ? "200 captions de IA por mes" : "200 AI captions per month"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                    <Check className="h-3 w-3 text-white font-extrabold" strokeWidth={4} />
                  </div>
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Alle Premium-Templates" : language === "es" ? "Todas las plantillas premium" : "All premium templates"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                    <Check className="h-3 w-3 text-white font-extrabold" strokeWidth={4} />
                  </div>
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Hashtag-Generator" : language === "es" ? "Generador de hashtags" : "Hashtag Generator"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                    <Check className="h-3 w-3 text-white font-extrabold" strokeWidth={4} />
                  </div>
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Bis zu 2 Marken verwalten" : language === "es" ? "Gestionar hasta 2 marcas" : "Manage up to 2 brands"}
                  </span>
                </li>
              </ul>

              <Button size="lg" asChild className="w-full h-11 text-sm font-bold bg-gradient-to-r from-primary to-accent hover:shadow-2xl hover:shadow-primary/50 hover:scale-105 transition-all duration-300">
                <Link to="/auth">
                  {language === "de" ? "Zu Basic upgraden" : language === "es" ? "Actualizar a Basic" : "Upgrade to Basic"}
                </Link>
              </Button>
            </div>

            {/* Pro Plan */}
            <div className="relative flex flex-col bg-card rounded-2xl border-2 border-border/50 shadow-xl hover:shadow-2xl hover:scale-105 hover:border-primary/40 transition-all duration-500 p-6">
              <div className="text-center mb-6 pb-6 border-b border-border/50">
                <h3 className="text-2xl font-bold text-foreground mb-2 tracking-tight">Pro</h3>
                <p className="text-xs text-muted-foreground mb-6 font-medium">
                  {language === "de" 
                    ? "Perfekt für Agenturen & Teams" 
                    : language === "es"
                    ? "Perfecto para agencias y equipos"
                    : "Perfect for agencies & teams"}
                </p>
                
                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="text-4xl font-bold text-foreground tracking-tighter">€29.99</span>
                  <span className="text-sm text-muted-foreground font-medium">
                    / {language === "de" ? "Monat" : language === "es" ? "mes" : "month"}
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                    <Check className="h-3 w-3 text-white font-extrabold" strokeWidth={4} />
                  </div>
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Unbegrenzte KI-Captions" : language === "es" ? "Captions de IA ilimitados" : "Unlimited AI captions"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                    <Check className="h-3 w-3 text-white font-extrabold" strokeWidth={4} />
                  </div>
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Unbegrenzte Marken" : language === "es" ? "Marcas ilimitadas" : "Unlimited brands"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                    <Check className="h-3 w-3 text-white font-extrabold" strokeWidth={4} />
                  </div>
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Erweiterte KI-Modelle" : language === "es" ? "Modelos de IA avanzados" : "Advanced AI models"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                    <Check className="h-3 w-3 text-white font-extrabold" strokeWidth={4} />
                  </div>
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Team-Zusammenarbeit" : language === "es" ? "Colaboración en equipo" : "Team collaboration"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mt-0.5 shadow-md">
                    <Check className="h-3 w-3 text-white font-extrabold" strokeWidth={4} />
                  </div>
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Prioritäts-Support" : language === "es" ? "Soporte prioritario" : "Priority support"}
                  </span>
                </li>
              </ul>

              <Button size="lg" asChild className="w-full h-11 text-sm font-bold hover:shadow-xl hover:scale-105 transition-all duration-300">
                <Link to="/auth">
                  {language === "de" ? "Pro werden" : language === "es" ? "Ir a Pro" : "Go Pro"}
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Home;
