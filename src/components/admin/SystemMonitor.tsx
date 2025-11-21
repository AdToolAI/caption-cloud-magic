import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertCircle, XCircle, Activity, Database, Zap } from 'lucide-react';
import { templateCache } from '@/lib/template-cache';
import { templateLogger } from '@/lib/template-logger';
import { performanceMonitor } from '@/utils/performance';

export const SystemMonitor = () => {
  const [systemStats, setSystemStats] = useState({
    cacheStats: templateCache.getStats(),
    cacheSize: templateCache.size(),
    errorCount: 0,
    warningCount: 0,
    performance: {} as any,
  });

  useEffect(() => {
    const updateStats = () => {
      const logs = templateLogger.getRecentLogs(1000);
      const errorCount = logs.filter(l => l.level === 'error').length;
      const warningCount = logs.filter(l => l.level === 'warn').length;

      setSystemStats({
        cacheStats: templateCache.getStats(),
        cacheSize: templateCache.size(),
        errorCount,
        warningCount,
        performance: performanceMonitor.getAllMetrics(),
      });
    };

    updateStats();
    const interval = setInterval(updateStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const getHealthStatus = () => {
    const hitRate = systemStats.cacheStats.hitRate;
    const errors = systemStats.errorCount;

    if (errors > 10) return { status: 'critical', icon: XCircle, color: 'text-red-500' };
    if (errors > 5 || hitRate < 0.5) return { status: 'warning', icon: AlertCircle, color: 'text-yellow-500' };
    return { status: 'healthy', icon: CheckCircle2, color: 'text-green-500' };
  };

  const health = getHealthStatus();
  const hitRatePercent = Math.round(systemStats.cacheStats.hitRate * 100);

  return (
    <div className="space-y-6">
      {/* System Health */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-1">System Status</h2>
            <p className="text-sm text-muted-foreground">
              Überwache die Gesundheit des Template-Systems
            </p>
          </div>
          <div className="flex items-center gap-3">
            <health.icon className={`h-8 w-8 ${health.color}`} />
            <div>
              <Badge
                variant={
                  health.status === 'healthy'
                    ? 'default'
                    : health.status === 'warning'
                    ? 'secondary'
                    : 'destructive'
                }
                className="capitalize"
              >
                {health.status}
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Cache Health */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Database className="h-5 w-5 text-blue-500" />
              <h3 className="font-semibold">Cache</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Hit Rate</span>
                  <span className="font-semibold">{hitRatePercent}%</span>
                </div>
                <Progress value={hitRatePercent} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 bg-muted rounded">
                  <div className="text-xs text-muted-foreground">Hits</div>
                  <div className="font-semibold text-green-600">
                    {systemStats.cacheStats.hits}
                  </div>
                </div>
                <div className="p-2 bg-muted rounded">
                  <div className="text-xs text-muted-foreground">Misses</div>
                  <div className="font-semibold text-red-600">
                    {systemStats.cacheStats.misses}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {systemStats.cacheSize} / 100 Einträge
              </div>
            </div>
          </div>

          {/* Error Tracking */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <h3 className="font-semibold">Fehler & Warnungen</h3>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-red-500/10 rounded border border-red-500/20">
                <div className="text-sm text-muted-foreground mb-1">Fehler (letzte 1000 Logs)</div>
                <div className="text-3xl font-bold text-red-600">
                  {systemStats.errorCount}
                </div>
              </div>
              <div className="p-3 bg-yellow-500/10 rounded border border-yellow-500/20">
                <div className="text-sm text-muted-foreground mb-1">Warnungen</div>
                <div className="text-3xl font-bold text-yellow-600">
                  {systemStats.warningCount}
                </div>
              </div>
            </div>
          </div>

          {/* Performance */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-5 w-5 text-purple-500" />
              <h3 className="font-semibold">Performance</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(systemStats.performance).slice(0, 3).map(([key, metrics]: [string, any]) => (
                metrics && (
                  <div key={key} className="p-2 bg-muted rounded">
                    <div className="text-xs text-muted-foreground truncate">{key}</div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs">Avg:</span>
                      <span className="text-sm font-semibold">
                        {metrics.avg.toFixed(1)}ms
                      </span>
                    </div>
                  </div>
                )
              ))}
              {Object.keys(systemStats.performance).length === 0 && (
                <p className="text-sm text-muted-foreground">Keine Performance-Daten</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* System Metrics */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5" />
          <h3 className="text-lg font-semibold">System-Metriken</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Cache Operations</div>
            <div className="text-2xl font-bold">{systemStats.cacheStats.sets}</div>
            <div className="text-xs text-muted-foreground mt-1">Sets insgesamt</div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Invalidierungen</div>
            <div className="text-2xl font-bold">{systemStats.cacheStats.invalidations}</div>
            <div className="text-xs text-muted-foreground mt-1">Cache-Leerungen</div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Performance Samples</div>
            <div className="text-2xl font-bold">
              {Object.values(systemStats.performance).reduce(
                (sum: number, m: any) => sum + (m?.count || 0),
                0
              ) as number}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Messungen</div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Uptime</div>
            <div className="text-2xl font-bold">
              {Math.floor(performance.now() / 1000 / 60)}m
            </div>
            <div className="text-xs text-muted-foreground mt-1">Seit Seitenaufruf</div>
          </div>
        </div>
      </Card>

      {/* Recommendations */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Empfehlungen</h3>
        <div className="space-y-3">
          {hitRatePercent < 70 && (
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 rounded border border-yellow-500/20">
              <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Niedrige Cache-Hit-Rate</div>
                <div className="text-sm text-muted-foreground">
                  Die Hit-Rate liegt bei {hitRatePercent}%. Erwäge TTL-Anpassungen oder mehr Prefetching.
                </div>
              </div>
            </div>
          )}

          {systemStats.errorCount > 5 && (
            <div className="flex items-start gap-3 p-3 bg-red-500/10 rounded border border-red-500/20">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Hohe Fehlerrate</div>
                <div className="text-sm text-muted-foreground">
                  {systemStats.errorCount} Fehler erkannt. Überprüfe die Logs für Details.
                </div>
              </div>
            </div>
          )}

          {systemStats.cacheSize > 80 && (
            <div className="flex items-start gap-3 p-3 bg-blue-500/10 rounded border border-blue-500/20">
              <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Cache fast voll</div>
                <div className="text-sm text-muted-foreground">
                  Der Cache ist zu {Math.round((systemStats.cacheSize / 100) * 100)}% gefüllt. 
                  Älteste Einträge werden automatisch entfernt.
                </div>
              </div>
            </div>
          )}

          {hitRatePercent >= 70 && systemStats.errorCount <= 5 && systemStats.cacheSize <= 80 && (
            <div className="flex items-start gap-3 p-3 bg-green-500/10 rounded border border-green-500/20">
              <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">System läuft optimal</div>
                <div className="text-sm text-muted-foreground">
                  Alle Metriken sind im grünen Bereich. Keine Aktion erforderlich.
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
