import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Users, Clock, Target } from "lucide-react";

export function StreamAnalytics() {
  const stats = [
    { icon: Users, label: "Ø Zuschauer (7d)", value: "234", trend: "+12%" },
    { icon: TrendingUp, label: "Follower-Wachstum", value: "+48", trend: "+8%" },
    { icon: Clock, label: "Ø Stream-Dauer", value: "3h 12m", trend: "—" },
    { icon: Target, label: "Ø Engagement", value: "4.2%", trend: "+0.3%" },
  ];

  return (
    <div className="space-y-6 mt-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ icon: Icon, label, value, trend }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-purple-400" />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className="text-2xl font-bold">{value}</p>
              <span className="text-xs text-green-400">{trend}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-400" />
            Viewer-Verlauf
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center border border-dashed border-border rounded-lg">
            <p className="text-sm text-muted-foreground">
              Viewer-Charts werden nach den ersten Streams angezeigt.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Best Moments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🔥 Beste Clip-Momente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Die KI analysiert Chat-Aktivität und identifiziert die besten Momente für Clips.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
