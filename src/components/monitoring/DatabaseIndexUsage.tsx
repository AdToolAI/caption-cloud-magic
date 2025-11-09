import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Database, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface IndexInfo {
  name: string;
  table: string;
  usage: number;
  status: 'excellent' | 'good' | 'poor';
}

export function DatabaseIndexUsage() {
  // Mock data based on our Phase 1 indexes
  const indexes: IndexInfo[] = [
    { name: "idx_content_items_tags", table: "content_items", usage: 85, status: "excellent" },
    { name: "idx_content_items_type_created", table: "content_items", usage: 92, status: "excellent" },
    { name: "idx_calendar_events_date_range", table: "calendar_events", usage: 78, status: "good" },
    { name: "idx_rate_limit_state_lookup", table: "rate_limit_state", usage: 95, status: "excellent" },
    { name: "idx_settings_key", table: "settings", usage: 88, status: "excellent" },
    { name: "idx_active_ai_jobs_started", table: "active_ai_jobs", usage: 72, status: "good" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'text-green-500';
      case 'good':
        return 'text-yellow-500';
      case 'poor':
        return 'text-red-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'excellent':
        return <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20">Excellent</Badge>;
      case 'good':
        return <Badge variant="default" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Good</Badge>;
      case 'poor':
        return <Badge variant="destructive">Poor</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const avgUsage = Math.round(indexes.reduce((sum, idx) => sum + idx.usage, 0) / indexes.length);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Index Usage
            </CardTitle>
            <CardDescription>Phase 1 optimization indexes</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{avgUsage}%</div>
            <div className="text-xs text-muted-foreground">Average usage</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {indexes.map((index) => (
            <div key={index.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {index.status === 'excellent' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className={`h-4 w-4 ${getStatusColor(index.status)}`} />
                  )}
                  <div>
                    <div className="font-mono text-sm">{index.name}</div>
                    <div className="text-xs text-muted-foreground">{index.table}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${getStatusColor(index.status)}`}>
                    {index.usage}%
                  </span>
                  {getStatusBadge(index.status)}
                </div>
              </div>
              <Progress value={index.usage} className="h-2" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
