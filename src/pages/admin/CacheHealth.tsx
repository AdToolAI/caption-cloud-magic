import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, Brain, Zap, RefreshCw, Globe, Server, AlertTriangle } from "lucide-react";

interface CacheStats {
  redis: {
    enabled: boolean;
    totalRequests: number;
    hits: number;
    misses: number;
    hitRate: number;
    avgLatencyMs: number;
  };
  semantic: {
    totalRequests: number;
    hits: number;
    misses: number;
    hitRate: number;
    avgLatencyMs: number;
    cachedEntries: number;
  };
  byEndpoint: Array<{
    endpoint: string;
    cacheType: string;
    hits: number;
    misses: number;
    hitRate: number;
    avgLatencyMs: number;
  }>;
  topAiCacheEntries: Array<{
    endpoint: string;
    hitCount: number;
    promptPreview: string;
    language: string;
  }>;
}

export function CacheHealth() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("cache-stats-aggregator");
      if (error) throw error;
      setStats(data as CacheStats);
    } catch (e: any) {
      setError(e.message ?? "Failed to load cache stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const hitRateColor = (rate: number, target: number) => {
    if (rate >= target) return "text-green-500";
    if (rate >= target * 0.6) return "text-yellow-500";
    return "text-red-500";
  };

  const hitRateBadge = (rate: number, target: number): "default" | "secondary" | "destructive" => {
    if (rate >= target) return "default";
    if (rate >= target * 0.6) return "secondary";
    return "destructive";
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cache Health</h2>
          <p className="text-muted-foreground">
            Last hour — Auto-refresh every 30s
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Top-level KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Redis Hit Rate
            </CardTitle>
            <CardDescription>Target: ≥80%</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${hitRateColor(stats?.redis.hitRate ?? 0, 80)}`}>
              {stats?.redis.hitRate ?? 0}%
            </div>
            <Progress value={stats?.redis.hitRate ?? 0} className="mt-2" />
            <div className="text-xs text-muted-foreground mt-2">
              {stats?.redis.hits ?? 0} hits / {stats?.redis.totalRequests ?? 0} total ·{" "}
              {stats?.redis.avgLatencyMs ?? 0}ms avg
            </div>
            {!stats?.redis.enabled && (
              <Badge variant="destructive" className="mt-2">Redis disabled</Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              AI Semantic Cache
            </CardTitle>
            <CardDescription>Target: ≥40%</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${hitRateColor(stats?.semantic.hitRate ?? 0, 40)}`}>
              {stats?.semantic.hitRate ?? 0}%
            </div>
            <Progress value={stats?.semantic.hitRate ?? 0} className="mt-2" />
            <div className="text-xs text-muted-foreground mt-2">
              {stats?.semantic.hits ?? 0} hits / {stats?.semantic.totalRequests ?? 0} total ·{" "}
              {stats?.semantic.cachedEntries ?? 0} stored
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Estimated Savings
            </CardTitle>
            <CardDescription>AI provider calls avoided</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">
              {stats?.semantic.hits ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              ~{Math.round(((stats?.semantic.hits ?? 0) * 0.002) * 100) / 100}€ saved (last hour)
            </div>
          </CardContent>
        </Card>
      </div>

      {/* By Endpoint */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Cache Performance by Endpoint
          </CardTitle>
          <CardDescription>Hit rates per cache layer</CardDescription>
        </CardHeader>
        <CardContent>
          {(stats?.byEndpoint?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No cache activity in the last hour.</p>
          ) : (
            <div className="space-y-3">
              {stats?.byEndpoint.map((row, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{row.endpoint}</span>
                      <Badge variant="outline" className="text-xs">
                        {row.cacheType}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {row.hits} hits · {row.misses} misses · {row.avgLatencyMs}ms avg
                    </div>
                  </div>
                  <Badge variant={hitRateBadge(row.hitRate, row.cacheType === "redis" ? 80 : 40)}>
                    {row.hitRate}%
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top AI Cache Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Top AI Cache Entries
          </CardTitle>
          <CardDescription>Most frequently reused AI responses</CardDescription>
        </CardHeader>
        <CardContent>
          {(stats?.topAiCacheEntries?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No AI cache entries yet.</p>
          ) : (
            <div className="space-y-2">
              {stats?.topAiCacheEntries.map((entry, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card/50">
                  <Badge variant="secondary" className="shrink-0">
                    {entry.hitCount}× hits
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{entry.endpoint}</span>
                      <Badge variant="outline" className="text-xs">
                        {entry.language}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      "{entry.promptPreview}..."
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CDN & Compute guidance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Manual Setup Required
          </CardTitle>
          <CardDescription>
            Two more capacity boosts need manual configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg border bg-card/50">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-primary" />
              <h4 className="font-semibold">Cloudflare CDN</h4>
              <Badge variant="outline">Optional</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Reduces bandwidth load by ~90% by caching images, videos and static assets globally.
              Free plan is sufficient.
            </p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Create a free account at <a href="https://cloudflare.com" target="_blank" rel="noopener" className="text-primary underline">cloudflare.com</a></li>
              <li>Add your custom domain (e.g. captiongenie.app, useadtool.ai)</li>
              <li>Update your DNS to point to Cloudflare's nameservers</li>
              <li>Enable "Auto Minify" + "Brotli" + "Polish (WebP)" in Speed → Optimization</li>
              <li>Set Cache → Configuration → Browser Cache TTL: 4 hours</li>
            </ol>
          </div>

          <div className="p-4 rounded-lg border bg-card/50">
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4 text-primary" />
              <h4 className="font-semibold">Lovable Cloud Compute Upgrade</h4>
              <Badge variant="outline">Recommended</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              For 2.000+ concurrent users, upgrade your backend instance to handle higher
              database load and traffic.
            </p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Open your project's <strong>Backend</strong> settings</li>
              <li>Click <strong>Advanced settings → Upgrade instance</strong></li>
              <li>Select the next-larger instance class</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
