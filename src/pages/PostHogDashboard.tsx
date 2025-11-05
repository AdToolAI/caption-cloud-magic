import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { usePostHogData } from "@/hooks/usePostHogData";
import { Loader2, BarChart3, Users, TrendingUp, Activity } from "lucide-react";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";

export default function PostHogDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { stats, recentEvents, loading } = usePostHogData();

  useEffect(() => {
    if (user) {
      trackEvent(ANALYTICS_EVENTS.CALENDAR_VIEWED, {
        page: 'posthog_dashboard',
        user_id: user.id
      });
    }
  }, [user]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold">PostHog Analytics</h1>
            <p className="text-muted-foreground mt-2">
              Track user behavior and application events in real-time
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Events</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalEvents}</div>
                    <p className="text-xs text-muted-foreground">Last 7 days</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.activeUsers}</div>
                    <p className="text-xs text-muted-foreground">Last 24 hours</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Top Event</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {stats.topEvents[0]?.name || 'N/A'}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {stats.topEvents[0]?.count || 0} occurrences
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Top Events */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Events</CardTitle>
                  <CardDescription>Most frequently triggered events</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats.topEvents.length > 0 ? (
                    <div className="space-y-2">
                      {stats.topEvents.map((event, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                          <span className="font-medium">{event.name}</span>
                          <span className="text-muted-foreground">{event.count} times</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No events tracked yet</p>
                      <p className="text-sm mt-2">Events will appear here as users interact with your app</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Events Feed */}
              <Card>
                <CardHeader>
                  <CardTitle>Live Event Feed</CardTitle>
                  <CardDescription>Real-time stream of application events</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentEvents.length > 0 ? (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {recentEvents.map((event, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                          <Activity className="h-4 w-4 text-primary mt-1" />
                          <div className="flex-1">
                            <div className="font-medium">{event.event}</div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(event.timestamp).toLocaleString()}
                            </div>
                            {Object.keys(event.properties).length > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {Object.entries(event.properties).slice(0, 3).map(([key, value]) => (
                                  <span key={key} className="mr-2">
                                    {key}: {String(value)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No recent events</p>
                      <p className="text-sm mt-2">Events will stream here in real-time</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Setup Info */}
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle>📊 PostHog Configuration</CardTitle>
                  <CardDescription>
                    For detailed analytics, configure your PostHog project
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm">
                    <p className="font-medium mb-2">To access full analytics:</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Visit your PostHog dashboard at <a href="https://eu.i.posthog.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">eu.i.posthog.com</a></li>
                      <li>Navigate to "Insights" to create custom dashboards</li>
                      <li>Set up "Funnels" and "Cohorts" for advanced analysis</li>
                      <li>Configure "Alerts" for critical metrics</li>
                    </ol>
                  </div>
                  <div className="bg-muted/50 p-3 rounded-lg text-sm">
                    <p className="font-medium mb-1">Tracked Events:</p>
                    <p className="text-muted-foreground">
                      signup_completed, post_generated, campaign_generated, 
                      brand_kit_created, payment_completed, and more
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}