import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FeatureFlag } from "@/components/FeatureFlag";
import { Loader2, CheckCircle2, XCircle, Zap, Database, BarChart3, Layout } from "lucide-react";
import { Footer } from "@/components/Footer";

const FeatureFlagDemo = () => {
  const aiQueueWorkerV2 = useFeatureFlag("enable_ai_queue_worker_v2");
  const connectionPooling = useFeatureFlag("enable_connection_pooling");
  const advancedAnalytics = useFeatureFlag("enable_advanced_analytics");
  const newPlannerUI = useFeatureFlag("enable_new_planner_ui");

  const flags = [
    {
      name: "enable_ai_queue_worker_v2",
      title: "AI Queue Worker V2",
      description: "Neue Version des AI Queue Workers mit verbesserter Performance",
      rollout: "10%",
      status: aiQueueWorkerV2,
      icon: Zap,
      color: "text-purple-500",
    },
    {
      name: "enable_connection_pooling",
      title: "Connection Pooling",
      description: "Datenbankverbindungen werden wiederverwendet für bessere Performance",
      rollout: "100%",
      status: connectionPooling,
      icon: Database,
      color: "text-blue-500",
    },
    {
      name: "enable_advanced_analytics",
      title: "Advanced Analytics",
      description: "Erweiterte Analytics mit zusätzlichen Metriken und Visualisierungen",
      rollout: "0%",
      status: advancedAnalytics,
      icon: BarChart3,
      color: "text-green-500",
    },
    {
      name: "enable_new_planner_ui",
      title: "New Planner UI",
      description: "Überarbeitete Planner-Oberfläche mit verbesserter UX",
      rollout: "50%",
      status: newPlannerUI,
      icon: Layout,
      color: "text-orange-500",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold">Feature Flags Demo</h1>
            <p className="text-muted-foreground">
              Übersicht aller Feature Flags und deren Status in deinem Account
            </p>
          </div>

          {/* Feature Flags Overview */}
          <div className="grid gap-4 md:grid-cols-2">
            {flags.map((flag) => {
              const Icon = flag.icon;
              return (
                <Card key={flag.name}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-muted ${flag.color}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{flag.title}</CardTitle>
                          <CardDescription className="text-sm">
                            Rollout: {flag.rollout}
                          </CardDescription>
                        </div>
                      </div>
                      {flag.status === undefined ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : flag.status ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      {flag.description}
                    </p>
                    <Badge variant={flag.status ? "default" : "secondary"}>
                      {flag.status === undefined
                        ? "Loading..."
                        : flag.status
                        ? "Aktiv"
                        : "Inaktiv"}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Live Demo Sections */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Live Demos</h2>

            {/* AI Queue Worker V2 Demo */}
            <FeatureFlag flag="enable_ai_queue_worker_v2">
              <Card className="border-purple-500/20 bg-purple-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-purple-500" />
                    AI Queue Worker V2 ist aktiv
                  </CardTitle>
                  <CardDescription>
                    Der neue AI Queue Worker wird verwendet für optimierte AI-Anfragen
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Besuche den Hook Generator um den neuen Worker in Aktion zu sehen.
                  </p>
                </CardContent>
              </Card>
            </FeatureFlag>

            {/* Connection Pooling Demo */}
            <FeatureFlag flag="enable_connection_pooling">
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-500" />
                    Connection Pooling ist aktiv
                  </CardTitle>
                  <CardDescription>
                    Datenbankverbindungen werden effizient wiederverwendet
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Alle Datenbankoperationen profitieren automatisch von verbesserter Performance.
                  </p>
                </CardContent>
              </Card>
            </FeatureFlag>

            {/* Advanced Analytics Demo */}
            <FeatureFlag
              flag="enable_advanced_analytics"
              fallback={
                <Card className="border-muted">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-muted-foreground">
                      <BarChart3 className="h-5 w-5" />
                      Advanced Analytics ist inaktiv
                    </CardTitle>
                    <CardDescription>
                      Dieses Feature ist aktuell nicht für deinen Account aktiviert
                    </CardDescription>
                  </CardHeader>
                </Card>
              }
            >
              <Card className="border-green-500/20 bg-green-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-green-500" />
                    Advanced Analytics ist aktiv
                  </CardTitle>
                  <CardDescription>
                    Erweiterte Analytics-Features sind verfügbar
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Besuche den Calendar um erweiterte Metriken zu sehen.
                  </p>
                </CardContent>
              </Card>
            </FeatureFlag>

            {/* New Planner UI Demo */}
            <FeatureFlag
              flag="enable_new_planner_ui"
              fallback={
                <Card className="border-muted">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-muted-foreground">
                      <Layout className="h-5 w-5" />
                      New Planner UI ist inaktiv
                    </CardTitle>
                    <CardDescription>
                      Du siehst die Standard-Version des Planners
                    </CardDescription>
                  </CardHeader>
                </Card>
              }
            >
              <Card className="border-orange-500/20 bg-orange-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layout className="h-5 w-5 text-orange-500" />
                    New Planner UI ist aktiv
                  </CardTitle>
                  <CardDescription>
                    Die neue Planner-Oberfläche ist für dich verfügbar
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Besuche den Planner um die neue UI zu erleben.
                  </p>
                </CardContent>
              </Card>
            </FeatureFlag>
          </div>

          {/* Info Box */}
          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle>Über Feature Flags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Feature Flags ermöglichen es uns, neue Features schrittweise auszurollen und zu testen.
                Deine Feature Flag Konfiguration wird von PostHog gesteuert und kann sich basierend auf
                verschiedenen Faktoren ändern.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Hinweis:</strong> Ein Feature kann auch inaktiv sein, wenn es noch in Entwicklung
                ist oder nur für bestimmte Benutzergruppen freigeschaltet wurde.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default FeatureFlagDemo;
