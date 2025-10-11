import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Lock, Sparkles, Rocket } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

const categoryEmojis: Record<string, string> = {
  create: "🧠",
  optimize: "⚙️",
  analyze: "📊",
  design: "🎨",
};

const Home = () => {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [userPlan, setUserPlan] = useState<string>("free");
  const [userName, setUserName] = useState<string>("");
  const [weeklyPosts, setWeeklyPosts] = useState<number>(0);
  const weeklyGoal = 6;

  useEffect(() => {
    loadFeatures();
    if (user) {
      loadUserPlan();
      loadUserName();
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

  const loadUserName = async () => {
    if (!user) return;
    
    // Extract first name from email as fallback
    if (user.email) {
      const emailName = user.email.split("@")[0];
      setUserName(emailName.charAt(0).toUpperCase() + emailName.slice(1));
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

  const remainingPosts = Math.max(0, weeklyGoal - weeklyPosts);
  const progressPercentage = (weeklyPosts / weeklyGoal) * 100;

  const renderFeatureCard = (feature: Feature) => {
    const IconComponent = getIconComponent(feature.icon);
    const locked = isFeatureLocked(feature);
    const title = feature.titles_json[language] || feature.titles_json.en;
    const description = feature.description_json?.[language] || feature.description_json?.en || "";
    const isNew = ["comment-manager", "reel-script"].includes(feature.id);

    return (
      <Card key={feature.id} className="relative overflow-hidden group animate-fadeUp">
        <CardHeader>
          <div className="flex items-start justify-between mb-2">
            <div className="p-3 bg-primary/10 rounded-xl group-hover:scale-110 transition-transform duration-300">
              <IconComponent className="h-8 w-8 text-primary" />
            </div>
            <div className="flex gap-2">
              {isNew && (
                <Badge variant="destructive" className="animate-pulse-slow">
                  {t("ui.badge.new")}
                </Badge>
              )}
              {feature.plan === "pro" && (
                <Badge variant="secondary" className="bg-gradient-button text-white">
                  {t("ui.badge.pro")}
                </Badge>
              )}
            </div>
          </div>
          <CardTitle className="text-xl flex items-center gap-2">
            {title}
            {locked && <Lock className="h-4 w-4 text-muted-foreground" />}
          </CardTitle>
          <CardDescription className="mt-2 line-clamp-2">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {locked ? (
            <Button variant="outline" className="w-full" disabled>
              {t("common.locked")}
            </Button>
          ) : (
            <Button asChild className="w-full group-hover:shadow-lg">
              <Link to={feature.route}>
                {t("hero.cta")}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative py-24 px-6 overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-10"></div>
        <div className="absolute top-10 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-secondary/20 rounded-full blur-3xl"></div>
        
        <div className="max-w-6xl mx-auto text-center relative z-10">
          <div className="inline-block mb-6 animate-fadeUp">
            <Sparkles className="h-16 w-16 text-primary mx-auto animate-pulse-slow" />
          </div>
          <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-fadeUp" style={{ animationDelay: "0.1s" }}>
            {t("hero.title")}
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto animate-fadeUp" style={{ animationDelay: "0.2s" }}>
            {t("hero.subtitle")}
          </p>
          {!user ? (
            <div className="flex gap-4 justify-center animate-fadeUp" style={{ animationDelay: "0.3s" }}>
              <Button asChild size="lg" className="shadow-glow">
                <Link to="/auth">{t("hero.cta")}</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/auth">{t("hero.login")}</Link>
              </Button>
            </div>
          ) : (
            <div className="animate-fadeUp" style={{ animationDelay: "0.3s" }}>
              <Card className="max-w-2xl mx-auto bg-card/50 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    👋 {t("ui.welcome.greeting", { name: userName || "there" })}
                  </CardTitle>
                  <CardDescription className="text-base">
                    {t("ui.welcome.weeklyProgress", { count: weeklyPosts, remaining: remainingPosts })} 🚀
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Progress value={progressPercentage} className="h-3" />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Create Category */}
          {groupedFeatures.create.length > 0 && (
            <div className="mb-20 gradient-create rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">{categoryEmojis.create}</span>
                <h2 className="text-4xl font-bold">{t("category.create")}</h2>
              </div>
              <p className="text-muted-foreground mb-8 text-lg">{t("ui.category.createDesc")}</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedFeatures.create.map(renderFeatureCard)}
              </div>
            </div>
          )}

          {/* Optimize Category */}
          {groupedFeatures.optimize.length > 0 && (
            <div className="mb-20 gradient-optimize rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">{categoryEmojis.optimize}</span>
                <h2 className="text-4xl font-bold">{t("category.optimize")}</h2>
              </div>
              <p className="text-muted-foreground mb-8 text-lg">{t("ui.category.optimizeDesc")}</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedFeatures.optimize.map(renderFeatureCard)}
              </div>
            </div>
          )}

          {/* Analyze & Goals Category */}
          {groupedFeatures.analyze.length > 0 && (
            <div className="mb-20 gradient-analyze rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">{categoryEmojis.analyze}</span>
                <h2 className="text-4xl font-bold">{t("category.analyze")}</h2>
              </div>
              <p className="text-muted-foreground mb-8 text-lg">{t("ui.category.analyzeDesc")}</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedFeatures.analyze.map(renderFeatureCard)}
              </div>
            </div>
          )}

          {/* Design & Visuals Category */}
          {groupedFeatures.design.length > 0 && (
            <div className="mb-20 gradient-design rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">{categoryEmojis.design}</span>
                <h2 className="text-4xl font-bold">{t("category.design")}</h2>
              </div>
              <p className="text-muted-foreground mb-8 text-lg">{t("ui.category.designDesc")}</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedFeatures.design.map(renderFeatureCard)}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Home;
