import { PerformanceMetrics } from "@/components/monitoring/PerformanceMetrics";
import { QueryPerformanceChart } from "@/components/monitoring/QueryPerformanceChart";
import { DatabaseIndexUsage } from "@/components/monitoring/DatabaseIndexUsage";
import { LiveEventFeed } from "@/components/monitoring/LiveEventFeed";
import { Activity, RefreshCw } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function Monitoring() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <Helmet>
        <title>Performance Monitoring - CaptionGenie</title>
        <meta name="description" content="Real-time performance monitoring dashboard with cache metrics, query performance, and system health" />
      </Helmet>
      
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Performance Monitoring</h1>
              <p className="text-muted-foreground">
                Real-time system metrics and performance analytics
              </p>
            </div>
          </div>
          <Button 
            onClick={() => setRefreshKey(k => k + 1)} 
            variant="outline" 
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Key Metrics */}
        <div key={refreshKey}>
          <PerformanceMetrics />
        </div>

        {/* Charts and Details */}
        <div className="grid gap-6 md:grid-cols-2">
          <QueryPerformanceChart />
          <DatabaseIndexUsage />
        </div>

        {/* Live Feed */}
        <LiveEventFeed />
      </div>
    </>
  );
}
