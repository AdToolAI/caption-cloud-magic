import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
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

const Home = () => {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [userPlan, setUserPlan] = useState<string>("free");

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
  };

  const renderFeatureCard = (feature: Feature) => {
    const IconComponent = getIconComponent(feature.icon);
    const locked = isFeatureLocked(feature);
    const title = feature.titles_json[language] || feature.titles_json.en;
    const description = feature.description_json?.[language] || feature.description_json?.en || "";

    return (
      <Card key={feature.id} className="relative overflow-hidden hover:shadow-lg transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <IconComponent className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {title}
                  {locked && <Lock className="h-4 w-4 text-muted-foreground" />}
                </CardTitle>
              </div>
            </div>
            {feature.plan === "pro" && (
              <Badge variant="secondary">Pro</Badge>
            )}
          </div>
          <CardDescription className="mt-2">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {locked ? (
            <Button variant="outline" className="w-full" disabled>
              {t("common.locked")}
            </Button>
          ) : (
            <Button asChild className="w-full">
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
      <section className="py-20 px-6 bg-gradient-to-b from-primary/5 to-background">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            {t("hero.title")}
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            {t("hero.subtitle")}
          </p>
          {!user && (
            <div className="flex gap-4 justify-center">
              <Button asChild size="lg">
                <Link to="/auth">{t("hero.cta")}</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/auth">{t("hero.login")}</Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Create Category */}
          {groupedFeatures.create.length > 0 && (
            <div className="mb-16">
              <h2 className="text-3xl font-bold mb-2">{t("category.create")}</h2>
              <p className="text-muted-foreground mb-6">Turn ideas into engaging content</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedFeatures.create.map(renderFeatureCard)}
              </div>
            </div>
          )}

          {/* Optimize Category */}
          {groupedFeatures.optimize.length > 0 && (
            <div className="mb-16">
              <h2 className="text-3xl font-bold mb-2">{t("category.optimize")}</h2>
              <p className="text-muted-foreground mb-6">Refine and schedule your content</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedFeatures.optimize.map(renderFeatureCard)}
              </div>
            </div>
          )}

          {/* Analyze & Goals Category */}
          {groupedFeatures.analyze.length > 0 && (
            <div className="mb-16">
              <h2 className="text-3xl font-bold mb-2">{t("category.analyze")}</h2>
              <p className="text-muted-foreground mb-6">Track performance and achieve your goals</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedFeatures.analyze.map(renderFeatureCard)}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Home;