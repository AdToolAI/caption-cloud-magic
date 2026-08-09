import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertCircle, XCircle, Activity, Database, Zap } from 'lucide-react';
import { templateCache } from '@/lib/template-cache';
import { templateLogger } from '@/lib/template-logger';
import { performanceMonitor } from '@/utils/performance';
import { tx } from '@/lib/i18nText';

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
              {tx({ de: 'Überwache die Gesundheit des Template-Systems', en: 'Monitor the health of the template system', es: 'Supervisa la salud del sistema de plantillas' })}
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
              <h3 className="font-semibold">{tx({ de: "Cache", en: "Cache", es: "Caché" })}</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>{tx({ de: "Trefferquote", en: "Hit Rate", es: "Tasa de aciertos" })}</span>
                  <span className="font-semibold">{hitRatePercent}%</span>
                </div>
                <Progress value={hitRatePercent} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 bg-muted rounded">
                  <div className="text-xs text-muted-foreground">{tx({ de: "Treffer", en: "Hits", es: "Aciertos" })}</div>
                  <div className="font-semibold text-green-600">
                    {systemStats.cacheStats.hits}
                  </div>
                </div>
                <div className="p-2 bg-muted rounded">
                  <div className="text-xs text-muted-foreground">{tx({ de: "Fehlversuche", en: "Misses", es: "Fallos" })}</div>
                  <div className="font-semibold text-red-600">
                    {systemStats.cacheStats.misses}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {systemStats.cacheSize} / 100 {tx({ de: "Einträge", en: "entries", es: "entradas" })}
              </div>
            </div>
          </div>

          {/* Error Tracking */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <h3 className="font-semibold">{tx({ de: "Fehler & Warnungen", en: "Errors & Warnings", es: "Errores y advertencias" })}</h3>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-red-500/10 rounded border border-red-500/20">
                <div className="text-sm text-muted-foreground mb-1">{tx({ de: "Fehler (letzte 1000 Logs)", en: "Errors (last 1000 logs)", es: "Errores (últimos 1000 registros)" })}</div>
                <div className="text-3xl font-bold text-red-600">
                  {systemStats.errorCount}
                </div>
              </div>
              <div className="p-3 bg-yellow-500/10 rounded border border-yellow-500/20">
                <div className="text-sm text-muted-foreground mb-1">{tx({ de: "Warnungen", en: "Warnings", es: "Advertencias" })}</div>
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
              <h3 className="font-semibold">{tx({ de: "Performance", en: "Performance", es: "Rendimiento" })}</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(systemStats.performance).slice(0, 3).map(([key, metrics]: [string, any]) => (
                metrics && (
                  <div key={key} className="p-2 bg-muted rounded">
                    <div className="text-xs text-muted-foreground truncate">{key}</div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs">{tx({ de: "Ø:", en: "Avg:", es: "Prom:" })}</span>
                      <span className="text-sm font-semibold">
                        {metrics.avg.toFixed(1)}ms
                      </span>
                    </div>
                  </div>
                )
              ))}
              {Object.keys(systemStats.performance).length === 0 && (
                <p className="text-sm text-muted-foreground">{tx({ de: "Keine Performance-Daten", en: "No performance data", es: "Sin datos de rendimiento" })}</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* System Metrics */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5" />
          <h3 className="text-lg font-semibold">{tx({ de: "System-Metriken", en: "System Metrics", es: "Métricas del sistema" })}</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">{tx({ de: "Cache-Operationen", en: "Cache Operations", es: "Operaciones de caché" })}</div>
            <div className="text-2xl font-bold">{systemStats.cacheStats.sets}</div>
            <div className="text-xs text-muted-foreground mt-1">{tx({ de: "Sets insgesamt", en: "Total sets", es: "Total de sets" })}</div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">{tx({ de: "Invalidierungen", en: "Invalidations", es: "Invalidaciones" })}</div>
            <div className="text-2xl font-bold">{systemStats.cacheStats.invalidations}</div>
            <div className="text-xs text-muted-foreground mt-1">{tx({ de: "Cache-Leerungen", en: "Cache clears", es: "Vaciados de caché" })}</div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">{tx({ de: "Performance-Stichproben", en: "Performance Samples", es: "Muestras de rendimiento" })}</div>
            <div className="text-2xl font-bold">
              {Object.values(systemStats.performance).reduce(
                (sum: number, m: any) => sum + (m?.count || 0),
                0
              ) as number}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{tx({ de: "Messungen", en: "Measurements", es: "Mediciones" })}</div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">{tx({ de: "Laufzeit", en: "Uptime", es: "Tiempo activo" })}</div>
            <div className="text-2xl font-bold">
              {Math.floor(performance.now() / 1000 / 60)}m
            </div>
            <div className="text-xs text-muted-foreground mt-1">{tx({ de: "Seit Seitenaufruf", en: "Since page load", es: "Desde la carga de la página" })}</div>
          </div>
        </div>
      </Card>

      {/* Recommendations */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">{tx({ de: "Empfehlungen", en: "Recommendations", es: "Recomendaciones" })}</h3>
        <div className="space-y-3">
          {hitRatePercent < 70 && (
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 rounded border border-yellow-500/20">
              <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">{tx({ de: "Niedrige Cache-Hit-Rate", en: "Low cache hit rate", es: "Tasa de aciertos de caché baja" })}</div>
                <div className="text-sm text-muted-foreground">
                  {tx({ de: `Die Hit-Rate liegt bei ${hitRatePercent}%. Erwäge TTL-Anpassungen oder mehr Prefetching.`, en: `Hit rate is at ${hitRatePercent}%. Consider TTL adjustments or more prefetching.`, es: `La tasa de aciertos es del ${hitRatePercent}%. Considera ajustes de TTL o más precarga.` })}
                </div>
              </div>
            </div>
          )}

          {systemStats.errorCount > 5 && (
            <div className="flex items-start gap-3 p-3 bg-red-500/10 rounded border border-red-500/20">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">{tx({ de: "Hohe Fehlerrate", en: "High error rate", es: "Tasa de errores alta" })}</div>
                <div className="text-sm text-muted-foreground">
                  {tx({ de: `${systemStats.errorCount} Fehler erkannt. Überprüfe die Logs für Details.`, en: `${systemStats.errorCount} errors detected. Check the logs for details.`, es: `${systemStats.errorCount} errores detectados. Revisa los registros para más detalles.` })}
                </div>
              </div>
            </div>
          )}

          {systemStats.cacheSize > 80 && (
            <div className="flex items-start gap-3 p-3 bg-blue-500/10 rounded border border-blue-500/20">
              <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">{tx({ de: "Cache fast voll", en: "Cache almost full", es: "Caché casi lleno" })}</div>
                <div className="text-sm text-muted-foreground">
                  {tx({ de: `Der Cache ist zu ${Math.round((systemStats.cacheSize / 100) * 100)}% gefüllt. Älteste Einträge werden automatisch entfernt.`, en: `The cache is ${Math.round((systemStats.cacheSize / 100) * 100)}% full. Oldest entries are removed automatically.`, es: `La caché está llena en un ${Math.round((systemStats.cacheSize / 100) * 100)}%. Las entradas más antiguas se eliminan automáticamente.` })}
                </div>
              </div>
            </div>
          )}

          {hitRatePercent >= 70 && systemStats.errorCount <= 5 && systemStats.cacheSize <= 80 && (
            <div className="flex items-start gap-3 p-3 bg-green-500/10 rounded border border-green-500/20">
              <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">{tx({ de: "System läuft optimal", en: "System running optimally", es: "El sistema funciona de forma óptima" })}</div>
                <div className="text-sm text-muted-foreground">
                  {tx({ de: "Alle Metriken sind im grünen Bereich. Keine Aktion erforderlich.", en: "All metrics are in the green zone. No action required.", es: "Todas las métricas están en la zona verde. No se requiere ninguna acción." })}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
