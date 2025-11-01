import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check, Plus, Calendar as CalendarIcon, FileText, TrendingUp, Instagram, Music, Lightbulb, Clock, Eye, Send, RefreshCw, ImageIcon } from "lucide-react";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { Section } from "@/components/ui/Section";
import { MetricCard } from "@/components/ui/MetricCard";
import { BestTimeHeatmap } from "@/components/dashboard/BestTimeHeatmap";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { CreditBalance } from "@/components/credits/CreditBalance";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { toast } from "sonner";
import { FeatureGrid } from "@/components/home/FeatureGrid";
import { HeroBanner } from "@/components/home/HeroBanner";
import { RecoCard } from "@/features/recommendations/RecoCard";
import { PRICING_V21 } from "@/config/pricing";
import { usePostingTimes } from "@/hooks/usePostingTimes";
import { transformPostingSlotsToHeatmap } from "@/lib/postingTimesTransform";

interface Post {
  id: string;
  caption: string;
  platform: 'instagram' | 'tiktok' | 'linkedin' | 'facebook' | 'x';
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduledTime: string;
  mediaUrl?: string;
}

const Home = () => {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [todayPosts, setTodayPosts] = useState<Post[]>([]);
  const [weekDays, setWeekDays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch posting times for all platforms
  const { data: postingTimesData, isLoading: postingTimesLoading } = usePostingTimes({
    platform: "all",
    days: 7,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    enabled: !!user
  });

  // Transform API data to heatmap format
  const heatmapData = transformPostingSlotsToHeatmap(postingTimesData, 7);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    setLoading(true);
    // Fetch today's posts (mock data for now)
    setTodayPosts([
      {
        id: "1",
        caption: "Neue Produktvorstellung 🚀",
        platform: "instagram",
        status: "scheduled",
        scheduledTime: "18:00",
        mediaUrl: undefined
      }
    ]);

    // Generate week calendar (next 7 days)
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      days.push({
        date: date.toISOString(),
        name: date.toLocaleDateString(language, { weekday: 'short' }),
        day: date.getDate(),
        isToday: i === 0,
        posts: i === 0 ? [{ platform: 'instagram' }] : []
      });
    }
    setWeekDays(days);
    setLoading(false);
  };

  const publishNow = async (postId: string) => {
    toast.success("Post wird veröffentlicht...");
  };

  const retry = async (postId: string) => {
    toast.success("Post wird erneut versucht...");
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      instagram: 'bg-pink-500',
      tiktok: 'bg-black dark:bg-white',
      linkedin: 'bg-blue-700',
      facebook: 'bg-blue-600',
      x: 'bg-black dark:bg-white'
    };
    return colors[platform] || 'bg-gray-400';
  };

  const quickActions = [
    { label: t("dashboard.quickActions.quickSchedule"), icon: Plus, to: "/calendar?quickAdd=true", variant: 'default' as const },
    { label: t("dashboard.quickActions.openCalendar"), icon: CalendarIcon, to: "/calendar" },
    { label: t("dashboard.quickActions.postFromTemplate"), icon: FileText, to: "/generator" },
    { label: t("dashboard.quickActions.openPerformance"), icon: TrendingUp, to: "/analytics" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={language === "de" ? "KI Social Media Manager" : language === "es" ? "Gestor de Redes Sociales con IA" : "AI Social Media Manager"}
        description={language === "de" 
          ? "Erstelle & analysiere Social Media Content mit KI. Über 10.000 Creator vertrauen AdTool AI."
          : language === "es"
          ? "Crea y analiza contenido de redes sociales con IA. Más de 10,000 creadores confían en AdTool AI."
          : "Create & analyze social media content with AI. Over 10,000 creators trust AdTool AI."}
        canonical="https://useadtool.ai/home"
        ogImage="og-home.jpg"
        lang={language}
      />
      
      {/* Hero Status Bar */}
      {user && (
        <div className="bg-card border-b border-border py-3 px-4">
          <div className="container max-w-7xl mx-auto flex items-center justify-between gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Lightbulb className="h-4 w-4 text-primary" />
              <span className="font-medium">{t("dashboard.statusBar.tipOfTheDay")}:</span>
              <span>{t("dashboard.statusBar.tipContent")}</span>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-xs"><CreditBalance /></div>
              <div className="flex items-center gap-2">
                <Instagram className="h-4 w-4 text-primary" />
                <Music className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">3 {t("dashboard.statusBar.connectedAccounts")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                <span>{t("dashboard.statusBar.nextPost")}: {language === "de" ? "Heute 18:00" : "Today 6:00 PM"}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Hero */}
      {!user && (
        <section className="text-center bg-card pt-20 pb-16 border-b border-border">
          <div className="container mx-auto px-4 max-w-5xl">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
              {t("heroBanner.title")}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mt-4 max-w-2xl mx-auto leading-relaxed">
              {language === "de" ? "Starte kostenlos. Upgrade jederzeit." : "Start free. Upgrade anytime."}
            </p>
            <div className="flex justify-center gap-4 mt-8">
              <Link to="/auth">
                <Button size="lg" className="gradient-primary text-white font-medium rounded-xl px-8 py-6 shadow-soft hover:shadow-glow hover:scale-[1.03] transition-all">
                  {language === "de" ? "Jetzt planen" : "Start Planning"}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="rounded-xl px-8 py-6">
                {language === "de" ? "Demo ansehen" : "Watch Demo"}
              </Button>
            </div>
          </div>
        </section>
      )}

      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
        {/* Hero Banner */}
        {user && (
          <HeroBanner />
        )}

        {/* Quick Actions - Sticky */}
        {user && (
          <div className="sticky top-14 z-30 bg-gradient-to-b from-background via-background/95 to-transparent backdrop-blur-md py-3 -mx-4 px-4 md:mx-0 md:px-0">
            <QuickActions actions={quickActions} />
          </div>
        )}

        {/* Today Section */}
        {user && (
          <Section title={t("dashboard.sections.today")} description={t("dashboard.sections.todayDescription")} bg="muted">
            <Card className="rounded-2xl shadow-soft">
              <CardContent className="p-6">
                {todayPosts.length === 0 ? (
                  <div className="text-center py-12">
                    <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{t("dashboard.emptyState.noPosts")}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{t("dashboard.emptyState.createNow")}</p>
                    <Button asChild>
                      <Link to="/calendar">
                        <Plus className="h-4 w-4 mr-2" />
                        {language === "de" ? "Neuen Post planen" : "Schedule New Post"}
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todayPosts.map(post => (
                      <div key={post.id} className="flex items-center justify-between p-4 bg-background rounded-xl border border-border hover:border-primary/50 transition-smooth">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted">
                            {post.mediaUrl ? (
                              <img src={post.mediaUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <StatusPill status={post.status} />
                              <PlatformBadge platform={post.platform} />
                            </div>
                            <p className="text-sm font-medium line-clamp-1">{post.caption}</p>
                            <p className="text-xs text-muted-foreground">{post.scheduledTime}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline">
                            <Eye className="h-4 w-4 mr-2" />
                            {t("dashboard.postActions.open")}
                          </Button>
                          {post.status === 'scheduled' && (
                            <Button size="sm" onClick={() => publishNow(post.id)}>
                              <Send className="h-4 w-4 mr-2" />
                              {t("dashboard.postActions.publishNow")}
                            </Button>
                          )}
                          {post.status === 'failed' && (
                            <Button size="sm" variant="destructive" onClick={() => retry(post.id)}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              {t("dashboard.postActions.retry")}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </Section>
        )}

        {/* Week Calendar */}
        {user && (
          <Section 
            title={t("dashboard.sections.thisWeek")}
            description={t("dashboard.sections.thisWeekDescription")}
            action={
              <Button asChild variant="link">
                <Link to="/calendar">
                  {language === "de" ? "Im Kalender planen" : "Plan in Calendar"} →
                </Link>
              </Button>
            }
          >
            <Card className="rounded-2xl shadow-soft">
              <CardContent className="p-6">
                <div className="grid grid-cols-7 gap-4">
                  {weekDays.map(day => (
                    <div key={day.date} className="flex flex-col items-center">
                      <span className="text-xs text-muted-foreground uppercase mb-2">{day.name}</span>
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold ${day.isToday ? 'bg-primary text-white' : 'bg-muted text-foreground'}`}>
                        {day.day}
                      </div>
                      <div className="mt-2 flex flex-col gap-1">
                        {day.posts.map((post: any, i: number) => (
                          <div key={i} className={`w-8 h-1 rounded-full ${getPlatformColor(post.platform)}`} />
                        ))}
                      </div>
                      {day.posts.length === 0 && (
                        <span className="text-xs text-muted-foreground mt-2">–</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Section>
        )}

        {/* Feature Cards Grid */}
        {user && (
          <FeatureGrid />
        )}

        {/* Performance KPIs */}
        {user && (
          <Section title={t("dashboard.sections.performance")} description={t("dashboard.sections.performanceDescription")} bg="muted">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <MetricCard
                label={t("dashboard.metrics.reach7d")}
                value="45.2K"
                subtitle={`+12% ${t("dashboard.metrics.vsLastWeek")}`}
                icon={<TrendingUp className="h-5 w-5" />}
              />
              <MetricCard
                label={t("dashboard.metrics.engagementRate")}
                value="5.8%"
                subtitle={t("dashboard.metrics.avgAllPosts")}
                icon={<TrendingUp className="h-5 w-5" />}
              />
              <MetricCard
                label={t("dashboard.metrics.publishedPosts")}
                value="18"
                subtitle={t("dashboard.metrics.thisMonth")}
                icon={<Send className="h-5 w-5" />}
              />
            </div>
          </Section>
        )}

        {/* KI-Empfehlungen */}
        {user && (
          <Section title={t("reco.title")}>
            <RecoCard />
          </Section>
        )}

        {/* Heatmap */}
        {user && (
          <Section 
            title={t("dashboard.sections.bestTimes")}
            description={t("dashboard.sections.bestTimesDescription")}
          >
            <BestTimeHeatmap 
              heatmap={heatmapData} 
              loading={postingTimesLoading}
              onViewDetails={() => navigate('/posting-times')}
            />
          </Section>
        )}

        {/* Recent Activity */}
        {user && (
          <Section title={t("dashboard.sections.recentActivity")} description={t("dashboard.sections.recentActivityDescription")} bg="muted">
            <RecentActivityFeed />
          </Section>
        )}

        {/* Pricing Section */}
        <section className="bg-gradient-to-br from-muted/30 to-muted/60 rounded-3xl p-8 md:p-12 mt-16 shadow-xl">
          <div className="text-center mb-12">
            <div className="inline-block px-4 py-1.5 bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 text-primary rounded-full text-xs font-bold mb-4 shadow-lg shadow-primary/10">
              ✨ {language === "de" ? "Einfache & Transparente Preise" : language === "es" ? "Precios Simples y Transparentes" : "Simple & Transparent Pricing"}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3 tracking-tight">
              {language === "de" ? "Wachse mit AdTool AI" : language === "es" ? "Crece con AdTool AI" : "Grow with AdTool AI"}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {language === "de" 
                ? "Wähle den Plan, der zu deinem Workflow passt. Kostenlos starten, jederzeit upgraden." 
                : language === "es"
                ? "Elige el plan que se adapte a tu flujo de trabajo. Comienza gratis, actualiza en cualquier momento."
                : "Choose the plan that fits your workflow. Start free, upgrade anytime."}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* Basic Plan */}
            <div className="relative flex flex-col bg-card rounded-2xl border-2 border-border/50 shadow-xl hover:shadow-2xl hover:scale-105 hover:border-primary/40 transition-all duration-500 p-6">
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
                  <span className="text-4xl font-bold text-foreground tracking-tighter">€{PRICING_V21.basic.price.EUR}</span>
                  <span className="text-sm text-muted-foreground font-medium">
                    / {language === "de" ? "Monat" : language === "es" ? "mes" : "month"}
                  </span>
                </div>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "200 KI-Captions pro Monat" : "200 AI captions per month"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Alle Premium-Templates" : "All premium templates"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Hashtag-Generator" : "Hashtag Generator"}
                  </span>
                </li>
              </ul>
              <Button size="lg" asChild className="w-full">
                <Link to={user ? "/pricing" : "/auth"}>
                  {language === "de" ? "Zu Basic upgraden" : "Upgrade to Basic"}
                </Link>
              </Button>
            </div>

            {/* Pro Plan */}
            <div className="relative flex flex-col bg-card rounded-2xl border-2 border-primary shadow-2xl shadow-primary/30 lg:scale-105 lg:z-10 hover:scale-105 lg:hover:scale-110 transition-all duration-500 p-6">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
                <div className="bg-gradient-to-r from-primary to-accent text-white px-6 py-1.5 rounded-full text-xs font-extrabold shadow-2xl tracking-wider">
                  ⭐ {language === "de" ? "BELIEBT" : "POPULAR"}
                </div>
              </div>
              <div className="text-center mb-6 pb-6 border-b border-border/50">
                <h3 className="text-2xl font-bold text-foreground mb-2 tracking-tight">Pro</h3>
                <p className="text-xs text-muted-foreground mb-6 font-medium">
                  {language === "de" ? "Perfekt für Agenturen & Teams" : "Perfect for agencies & teams"}
                </p>
                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="text-4xl font-bold text-foreground tracking-tighter">€34.95</span>
                  <span className="text-sm text-muted-foreground font-medium">
                    / {language === "de" ? "Monat" : "month"}
                  </span>
                </div>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Unbegrenzte KI-Captions" : "Unlimited AI captions"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Team-Zusammenarbeit" : "Team collaboration"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Prioritäts-Support" : "Priority support"}
                  </span>
                </li>
              </ul>
              <Button size="lg" asChild className="w-full">
                <Link to={user ? "/pricing" : "/auth"}>
                  {language === "de" ? "Pro werden" : "Go Pro"}
                </Link>
              </Button>
            </div>

            {/* Enterprise Plan */}
            <div className="relative flex flex-col bg-card rounded-2xl border-2 border-border/50 shadow-xl hover:shadow-2xl hover:scale-105 hover:border-primary/40 transition-all duration-500 p-6">
              <div className="text-center mb-6 pb-6 border-b border-border/50">
                <h3 className="text-2xl font-bold text-foreground mb-2 tracking-tight">Enterprise</h3>
                <p className="text-xs text-muted-foreground mb-6 font-medium">
                  {language === "de" ? "Für große Teams und Agenturen" : "For large teams and agencies"}
                </p>
                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="text-4xl font-bold text-foreground tracking-tighter">€{PRICING_V21.enterprise.price.EUR}</span>
                  <span className="text-sm text-muted-foreground font-medium">
                    / {language === "de" ? "Monat" : "month"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  + Seats zu €49,99
                </p>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Alles aus Pro" : "Everything in Pro"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "API- und Integrationszugang" : "API and integration access"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Dedizierter Account-Manager" : "Dedicated account manager"}
                  </span>
                </li>
              </ul>
              <Button size="lg" asChild className="w-full">
                <Link to={user ? "/pricing" : "/auth"}>
                  {language === "de" ? "Auf Enterprise upgraden" : "Upgrade to Enterprise"}
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
